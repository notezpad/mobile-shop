/**
 * 🛡️ 2026-09-29: Purchase return (مرتجع للمورد) — single source of truth.
 *
 * Fixes two serious bugs of the old `DELETE /api/purchase-orders/[id]`:
 *
 *  1. It could only return a WHOLE order. Now a return is a list of
 *     `{ itemId, quantity }` lines, so one or two items (or part of a line)
 *     can be returned.
 *
 *  2. The "already returned?" check ran BEFORE the transaction, so a double
 *     click / a replayed offline request executed twice (stock decremented
 *     twice, cash restored twice, supplier balance reduced twice). Now:
 *       a. the first statement of the transaction locks the order row
 *          (`SELECT … FOR UPDATE`) — concurrent returns of the same order are
 *          serialized and the second one re-reads fresh data, and
 *       b. every line is claimed with ONE atomic conditional UPDATE
 *          (`returnedQty + qty <= quantity`) — if it matches no row the whole
 *          transaction rolls back. This is the authoritative guard even if
 *          (a) were ever removed.
 *
 * ACCOUNTING MODEL (all amounts rounded to 2 decimals)
 *   returnValue = Σ cost × qty            → goods leave the shop
 *   refund      = cash the supplier really hands back (0 … returnValue)
 *
 *   Stock            : − qty per line
 *   Supplier.balance : − (returnValue − refund)      (what we owe him drops)
 *   Till (CashEntry) : + refund                       (only if refund > 0)
 *
 *   e.g. bought 1000 cash, return 200 and he gives 200 back → balance 0, till +200
 *        bought 1000 cash, return 200 and he only credits it → balance −200
 *        bought 1000 on credit, return 200                   → balance −200 (owes less)
 */

import type { Prisma } from '@prisma/client'
import { createPrincipalCashEntry } from '@/lib/commission'

export class PurchaseReturnError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PurchaseReturnError'
    this.status = status
  }
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const REFUND_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])

export const PO_STATUS = {
  COMPLETE: 'مكتملة',
  PARTIAL_RETURN: 'مرتجعة جزئياً',
  RETURNED: 'مرتجعة',
} as const

export interface ReturnLineInput {
  itemId: number
  quantity: number
}

export interface PerformPurchaseReturnInput {
  tenantId: string
  userId?: string | null
  orderId: number
  /** undefined → return everything that is still returnable (legacy "return the whole order"). */
  lines?: ReturnLineInput[]
  /** Cash really received back. undefined → sensible default (see below). */
  refund?: number
  refundMethod?: string
  note?: string | null
}

export interface PurchaseReturnResult {
  returnId: number
  total: number
  refund: number
  status: string
  supplierBalance: number | null
}

export async function performPurchaseReturn(
  tx: Prisma.TransactionClient,
  input: PerformPurchaseReturnInput,
): Promise<PurchaseReturnResult> {
  const { tenantId, userId = null, orderId } = input

  // ── 0. Lock the order row. Everything below sees the latest committed data
  //       and no other return of this order can run until we commit.
  const locked = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "PurchaseOrder"
     WHERE "id" = ${orderId} AND "tenantId" = ${tenantId}
       FOR UPDATE`
  if (locked.length === 0) {
    throw new PurchaseReturnError('أمر الشراء غير موجود', 404)
  }

  const order = await tx.purchaseOrder.findFirst({
    where: { id: orderId, tenantId },
    include: { items: true },
  })
  if (!order) throw new PurchaseReturnError('أمر الشراء غير موجود', 404)
  if (order.status === PO_STATUS.RETURNED) {
    throw new PurchaseReturnError('أمر الشراء مرتجع بالفعل', 400)
  }

  // ── 1. Build + validate the lines
  const itemById = new Map(order.items.map((it) => [it.id, it]))
  const wanted = new Map<number, number>() // itemId → qty (duplicates merged)

  if (input.lines === undefined) {
    for (const it of order.items) {
      const remaining = it.quantity - it.returnedQty
      if (remaining > 0) wanted.set(it.id, remaining)
    }
  } else {
    for (const l of input.lines) {
      const itemId = Number(l?.itemId)
      const qty = Number(l?.quantity)
      if (!Number.isInteger(itemId) || !itemById.has(itemId)) {
        throw new PurchaseReturnError('صنف غير موجود في أمر الشراء', 400)
      }
      if (!Number.isInteger(qty) || qty < 0) {
        throw new PurchaseReturnError('كمية المرتجع غير صالحة', 400)
      }
      if (qty === 0) continue
      wanted.set(itemId, (wanted.get(itemId) ?? 0) + qty)
    }
  }

  if (wanted.size === 0) {
    throw new PurchaseReturnError('لا توجد كميات للإرجاع', 400)
  }

  for (const [itemId, qty] of wanted) {
    const it = itemById.get(itemId)!
    const remaining = it.quantity - it.returnedQty
    if (qty > remaining) {
      throw new PurchaseReturnError(
        `الكمية المطلوبة للصنف "${it.name}" (${qty}) أكبر من المتاح للإرجاع (${remaining})`,
        400,
      )
    }
  }

  // ── 2. Money
  let returnValue = 0
  for (const [itemId, qty] of wanted) {
    returnValue += itemById.get(itemId)!.cost * qty
  }
  returnValue = round2(returnValue)

  const hasSupplier = order.supplierId != null
  let refund: number
  if (input.refund === undefined || input.refund === null) {
    // Default = old behaviour: we get back the cash we paid on this order
    // (that was not already refunded); the rest reduces the supplier debt.
    refund = hasSupplier
      ? Math.min(returnValue, Math.max(0, round2(order.paid - order.refunded)))
      : returnValue
  } else {
    refund = Number(input.refund)
    if (!Number.isFinite(refund) || refund < 0) {
      throw new PurchaseReturnError('المبلغ المسترد غير صالح', 400)
    }
  }
  refund = round2(refund)
  if (refund > returnValue) {
    throw new PurchaseReturnError('المبلغ المسترد لا يمكن أن يزيد عن قيمة المرتجع', 400)
  }
  if (!hasSupplier && refund !== returnValue) {
    // No supplier account to hold a credit → the whole value must come back in cash.
    throw new PurchaseReturnError(
      'أمر الشراء غير مرتبط بمورد، لذلك يجب أن يساوي المبلغ المسترد قيمة المرتجع بالكامل',
      400,
    )
  }
  const refundMethod = input.refundMethod ?? 'cash'
  if (refund > 0 && !REFUND_METHODS.has(refundMethod)) {
    throw new PurchaseReturnError('طريقة استلام المبلغ غير صالحة', 400)
  }

  // ── 3. Claim the quantities ATOMICALLY (authoritative double-return guard)
  for (const [itemId, qty] of wanted) {
    const it = itemById.get(itemId)!
    const claimed = await tx.purchaseOrderItem.updateMany({
      where: {
        id: itemId,
        purchaseOrderId: orderId,
        returnedQty: { lte: it.quantity - qty }, // returnedQty + qty <= quantity
      },
      data: { returnedQty: { increment: qty } },
    })
    if (claimed.count !== 1) {
      throw new PurchaseReturnError(
        `تم إرجاع الصنف "${it.name}" بالفعل، حدّث الصفحة وحاول مرة أخرى`,
        409,
      )
    }
  }

  // ── 4. The return record (audit trail)
  const created = await tx.purchaseReturn.create({
    data: {
      tenantId,
      branchId: order.branchId,
      purchaseOrderId: orderId,
      supplierId: order.supplierId,
      total: returnValue,
      refund,
      refundMethod: refund > 0 ? refundMethod : null,
      note: input.note ?? null,
      userId,
      items: {
        create: [...wanted].map(([itemId, qty]) => {
          const it = itemById.get(itemId)!
          return {
            purchaseOrderItemId: it.id,
            productId: it.productId,
            name: it.name,
            cost: it.cost,
            quantity: qty,
          }
        }),
      },
    },
    select: { id: true },
  })

  // ── 5. Stock out (+ movement per line)
  const noteBase = `مرتجع أمر شراء ${order.orderNo ?? orderId}`
  for (const [itemId, qty] of wanted) {
    const it = itemById.get(itemId)!
    if (it.productId != null) {
      await tx.product.update({
        where: { id: it.productId },
        data: { quantity: { decrement: qty } },
      })
    }
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId: order.branchId,
        productId: it.productId, // null if the product was archived/deleted
        type: 'out',
        quantity: -qty,
        refType: 'purchase',
        refId: orderId,
        note: `${noteBase} — ${it.name}`,
        userId,
      },
    })
  }

  // ── 6. Supplier balance
  let supplierBalance: number | null = null
  if (order.supplierId != null) {
    const net = round2(returnValue - refund)
    if (net !== 0) {
      const sup = await tx.supplier.update({
        where: { id: order.supplierId },
        data: { balance: { decrement: net } },
        select: { balance: true },
      })
      supplierBalance = sup.balance
    } else {
      const sup = await tx.supplier.findUnique({
        where: { id: order.supplierId },
        select: { balance: true },
      })
      supplierBalance = sup?.balance ?? null
    }
  }

  // ── 7. Till: only money that really came back
  if (refund > 0) {
    await createPrincipalCashEntry(tx, {
      tenantId,
      userId,
      method: refundMethod,
      source: 'purchase_refund',
      refId: orderId,
      amount: refund,
      note: `${noteBase} (مرتجع #${created.id})`,
    })
  }

  // ── 8. Order status + refunded total
  const fullyReturned = order.items.every(
    (it) => it.returnedQty + (wanted.get(it.id) ?? 0) >= it.quantity,
  )
  const status = fullyReturned ? PO_STATUS.RETURNED : PO_STATUS.PARTIAL_RETURN
  await tx.purchaseOrder.update({
    where: { id: orderId },
    data: {
      status,
      ...(refund > 0 ? { refunded: { increment: refund } } : {}),
    },
  })

  return { returnId: created.id, total: returnValue, refund, status, supplierBalance }
}
