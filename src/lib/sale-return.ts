/**
 * 🛡️ 2026-09-30: Sale return (مرتجع بيع جزئي/كامل + استبدال) — single source
 * of truth. Mirrors src/lib/purchase-return.ts line by line, adapted to the
 * customer side of the accounting model:
 *
 *   Customer.balance = what the customer OWES US (positive = debt).
 *   Till is only touched by money that actually moved — NOW.
 *
 * Fixes the three serious bugs of the old POST /api/sales/returns:
 *
 *  1. The "quantity available?" check ran OUTSIDE the transaction and the
 *     SaleItem.quantity was decremented directly — a double click / replayed
 *     offline request returned the same pieces twice and quantity could go
 *     NEGATIVE. Now:
 *       a. the first statement of the transaction locks the sale row
 *          (SELECT … FOR UPDATE), and
 *       b. every line is claimed with ONE atomic conditional UPDATE
 *          (returnedQty + qty <= quantity) — no match → whole tx rolls back.
 *     SaleItem.quantity is never mutated (it stays the ORIGINAL sold qty —
 *     invoices keep printing correctly after partial returns).
 *
 *  2. `cashDelta` was 100% client-controlled (any signed amount, no method,
 *     no bound) — a single API call could drain the drawer. Now the server
 *     computes the money split and bounds the refund:
 *       refund ≤ min(returnValue − exchangeTotal, paidNotRefunded)
 *     and the rest goes to the customer's account (creditApplied).
 *
 *  3. Returned goods never re-entered the weighted-average cost. Now stock
 *     re-weights UP: newCost = (Q_before × C_before + qty × lineCost) / (Q_before + qty).
 *
 * ACCOUNTING MODEL (all amounts rounded to 2 decimals)
 *   total         = Σ price × qty            → goods come back to the shop
 *   exchangeTotal = Σ exPrice × exQty        → replacement goods leave (optional)
 *   netReturn     = total − exchangeTotal
 *   netReturn > 0 (shop owes customer value):
 *     refund        ∈ [0 … min(netReturn, paidNotRefunded)]  cash out NOW
 *     creditApplied = netReturn − refund      → customer balance −
 *   netReturn < 0 (customer owes the difference, e.g. pricier exchange):
 *     with customer    → balance += |netReturn|
 *     without customer → cash in NOW (+|netReturn| into the till)
 *   Invariant: creditApplied + refund = netReturn (when netReturn > 0).
 *
 *   Stock            : + qty per returned line (variant-aware)
 *   SaleItem         : returnedQty += qty (atomic claim), quantity untouched
 *   Customer.balance : − creditApplied   (or + the exchange charge)
 *   Till (CashEntry) : − refund (method required) and/or + charge (walk-in)
 *   Sale             : refunded += refund, status recomputed
 *                      (مكتملة | مرتجعة جزئياً | مرتجعة)
 */

import type { Prisma } from '@prisma/client'
import { createPrincipalCashEntry } from '@/lib/commission'
import { round2 } from '@/lib/purchase-return'

export class SaleReturnError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SaleReturnError'
    this.status = status
  }
}

export const SALE_STATUS = {
  COMPLETE: 'مكتملة',
  PARTIAL_RETURN: 'مرتجعة جزئياً',
  RETURNED: 'مرتجعة',
} as const

export interface SaleReturnLineInput {
  saleItemId: number
  quantity: number
}

export interface SaleExchangeLineInput {
  productId: number
  quantity: number
  /** Selling price of the replacement; default = the product's retail price. */
  price?: number
}

export interface PerformSaleReturnInput {
  tenantId: string
  userId?: string | null
  saleId: number
  /** undefined → return everything that is still returnable. */
  lines?: SaleReturnLineInput[]
  /** Optional replacement goods (استبدال). */
  exchange?: SaleExchangeLineInput[]
  /** Cash actually handed to the customer NOW. undefined → 0 (credit the account). */
  refund?: number | null
  refundMethod?: string
  note?: string | null
}

export interface SaleReturnResult {
  returnId: number
  total: number
  exchangeTotal: number
  refund: number
  creditApplied: number
  charge: number
  status: string
  customerBalance: number | null
}

export async function performSaleReturn(
  tx: Prisma.TransactionClient,
  input: PerformSaleReturnInput,
): Promise<SaleReturnResult> {
  const { tenantId, userId = null, saleId } = input

  // ── 0. Lock the sale row. Concurrent returns of this sale are serialized
  //       and everyone below re-reads fresh data.
  const locked = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "Sale"
     WHERE "id" = ${saleId} AND "tenantId" = ${tenantId}
       FOR UPDATE`
  if (locked.length === 0) {
    throw new SaleReturnError('الفاتورة غير موجودة', 404)
  }

  const sale = await tx.sale.findFirst({
    where: { id: saleId, tenantId },
    include: { items: true },
  })
  if (!sale) throw new SaleReturnError('الفاتورة غير موجودة', 404)
  if (sale.status === SALE_STATUS.RETURNED) {
    throw new SaleReturnError('الفاتورة مرتجعة بالفعل', 400)
  }

  // ── 1. Build + validate the lines
  const itemById = new Map(sale.items.map((it) => [it.id, it]))
  const wanted = new Map<number, number>() // saleItemId → qty (duplicates merged)

  if (input.lines === undefined) {
    for (const it of sale.items) {
      const remaining = it.quantity - it.returnedQty
      if (remaining > 0) wanted.set(it.id, remaining)
    }
  } else {
    for (const l of input.lines) {
      const itemId = Number(l?.saleItemId)
      const qty = Number(l?.quantity)
      if (!Number.isInteger(itemId) || !itemById.has(itemId)) {
        throw new SaleReturnError('صنف غير موجود في الفاتورة', 400)
      }
      if (!Number.isInteger(qty) || qty < 0) {
        throw new SaleReturnError('كمية المرتجع غير صالحة', 400)
      }
      if (qty === 0) continue
      wanted.set(itemId, (wanted.get(itemId) ?? 0) + qty)
    }
  }

  if (wanted.size === 0 && !(input.exchange && input.exchange.length > 0)) {
    throw new SaleReturnError('لا توجد كميات للإرجاع', 400)
  }

  for (const [itemId, qty] of wanted) {
    const it = itemById.get(itemId)!
    const remaining = it.quantity - it.returnedQty
    if (qty > remaining) {
      throw new SaleReturnError(
        `الكمية المطلوبة للصنف "${it.name}" (${qty}) أكبر من المتاح للإرجاع (${remaining})`,
        400,
      )
    }
  }

  // ── 2. Money — computed by the SERVER, never trusted from the client
  let total = 0
  for (const [itemId, qty] of wanted) {
    total += itemById.get(itemId)!.price * qty
  }
  total = round2(total)

  // ── 3. Exchange goods (optional) — validated + stock out atomically
  const exchangeLines: Array<{
    productId: number
    name: string
    price: number
    cost: number
    quantity: number
  }> = []
  let exchangeTotal = 0
  if (input.exchange && input.exchange.length > 0) {
    for (const ex of input.exchange) {
      const pid = Number(ex?.productId)
      const qty = Number(ex?.quantity)
      if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty <= 0) {
        throw new SaleReturnError('بيانات الاستبدال غير صالحة', 400)
      }
      const p = await tx.product.findFirst({ where: { id: pid, tenantId } })
      if (!p) throw new SaleReturnError('منتج الاستبدال غير موجود', 400)
      const exPrice = ex.price === undefined || ex.price === null
        ? p.price
        : Number(ex.price)
      if (!Number.isFinite(exPrice) || exPrice < 0) {
        throw new SaleReturnError('سعر بضاعة الاستبدال غير صالح', 400)
      }
      // 🛡️ Atomic stock claim for the replacement — no negative stock, no
      // check-then-write race like the old code.
      const out = await tx.product.updateMany({
        where: { id: pid, tenantId, quantity: { gte: qty } },
        data: { quantity: { decrement: qty } },
      })
      if (out.count !== 1) {
        throw new SaleReturnError(
          `مخزون "${p.name}" غير كافي للاستبدال (المطلوب ${qty})`,
          409,
        )
      }
      exchangeLines.push({
        productId: p.id,
        name: p.name,
        price: exPrice,
        cost: p.cost,
        quantity: qty,
      })
      exchangeTotal += exPrice * qty
    }
    exchangeTotal = round2(exchangeTotal)
  }

  const netReturn = round2(total - exchangeTotal)

  // ── 4. Split the money — bounded, server-side
  const hasCustomer = sale.customerId != null
  const paidNotRefunded = Math.max(0, round2(sale.paid - sale.refunded))
  let refund = 0
  let creditApplied = 0
  let charge = 0

  if (netReturn > 0) {
    if (input.refund === undefined || input.refund === null) {
      // 🛡️ Never assume cash moved for a customer sale — the value sits on
      // the account by default (same as supplier returns default to 0).
      // But a walk-in (no customer) has nobody to hold the credit, so the
      // sensible default is the full amount back in cash now.
      refund = hasCustomer ? 0 : Math.min(netReturn, paidNotRefunded)
    } else {
      refund = Number(input.refund)
      if (!Number.isFinite(refund) || refund < 0) {
        throw new SaleReturnError('المبلغ المسترد غير صالح', 400)
      }
    }
    refund = round2(Math.min(refund, netReturn))
    if (refund > paidNotRefunded) {
      throw new SaleReturnError(
        `المبلغ المسترد (${refund}) أكبر من المدفوع فعلاً على هذه الفاتورة ولم يُسترد بعد (${paidNotRefunded}). الباقي يتحول على حساب العميل.`,
        400,
      )
    }
    creditApplied = round2(netReturn - refund)
    if (!hasCustomer && creditApplied !== 0) {
      // No customer account to hold the credit → the whole value must come
      // back as money NOW.
      throw new SaleReturnError(
        'الفاتورة بدون عميل مسجل، لذلك يجب أن يساوي المبلغ المسترد قيمة المرتجع بالكامل',
        400,
      )
    }
  } else if (netReturn < 0) {
    charge = round2(-netReturn)
    if (!hasCustomer && charge > 0) {
      // Walk-in paid exchange — the difference must be received in cash now.
      // (Recorded below as a positive till entry.)
    }
  }

  const refundMethod = input.refundMethod ?? sale.paymentMethod ?? 'cash'
  if (refund > 0 && !REFUND_METHOD_SET.has(refundMethod)) {
    throw new SaleReturnError('طريقة رد المبلغ غير صالحة', 400)
  }

  // ── 5. Claim the quantities ATOMICALLY (authoritative double-return guard)
  for (const [itemId, qty] of wanted) {
    const it = itemById.get(itemId)!
    const claimed = await tx.saleItem.updateMany({
      where: {
        id: itemId,
        saleId,
        returnedQty: { lte: it.quantity - qty }, // returnedQty + qty <= quantity
      },
      data: { returnedQty: { increment: qty } },
    })
    if (claimed.count !== 1) {
      throw new SaleReturnError(
        `تم إرجاع الصنف "${it.name}" بالفعل، حدّث الصفحة وحاول مرة أخرى`,
        409,
      )
    }
  }

  // ── 6. The return record (audit trail)
  const created = await tx.saleReturn.create({
    data: {
      tenantId,
      branchId: sale.branchId,
      saleId,
      customerId: sale.customerId,
      total,
      exchangeTotal,
      refund,
      refundMethod: refund > 0 ? refundMethod : null,
      creditApplied,
      note: input.note ?? null,
      userId,
      items: {
        create: [...wanted].map(([itemId, qty]) => {
          const it = itemById.get(itemId)!
          return {
            saleItemId: it.id,
            productId: it.productId,
            name: it.name,
            price: it.price,
            cost: it.cost,
            quantity: qty,
          }
        }),
      },
    },
    select: { id: true },
  })

  // ── 7. Stock in per returned line (+ movement + weighted-average re-weight)
  const noteBase = `مرتجع فاتورة ${sale.invoiceNo ?? saleId}`
  for (const [itemId, qty] of wanted) {
    const it = itemById.get(itemId)!
    if (it.productId != null) {
      const cur = await tx.product.findUnique({
        where: { id: it.productId },
        select: { quantity: true, cost: true },
      })
      if (it.variantId) {
        // Restore the variant's own stock (deductStock decremented it), then
        // re-sync the parent product's aggregate.
        await tx.productVariant.updateMany({
          where: { id: it.variantId, productId: it.productId },
          data: { quantity: { increment: qty } },
        })
        const allVariants = await tx.productVariant.findMany({
          where: { productId: it.productId },
          select: { quantity: true },
        })
        const variantSum = allVariants.reduce((s, v) => s + v.quantity, 0)
        await tx.product.update({
          where: { id: it.productId },
          data: { quantity: variantSum, ...(costReweight(cur, qty, it.cost) ?? {}) },
        })
      } else {
        const patch = costReweight(cur, qty, it.cost)
        await tx.product.update({
          where: { id: it.productId },
          data: { quantity: { increment: qty }, ...(patch ?? {}) },
        })
      }
    }
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId: sale.branchId,
        productId: it.productId,
        type: 'return',
        quantity: qty, // positive: goods are coming back
        refType: 'sale_return',
        refId: created.id,
        note: `${noteBase} — ${it.name}`,
        userId,
      },
    })
  }

  // Exchange lines out (stock already claimed above — movements here)
  for (const ex of exchangeLines) {
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId: sale.branchId,
        productId: ex.productId,
        type: 'sale',
        quantity: -ex.quantity,
        refType: 'sale_return',
        refId: created.id,
        note: `استبدال ${noteBase} — ${ex.name}`,
        userId,
      },
    })
    await tx.saleItem.create({
      data: {
        saleId,
        productId: ex.productId,
        name: ex.name + ' (استبدال)',
        price: ex.price,
        cost: ex.cost,
        quantity: ex.quantity,
      },
    })
  }

  // ── 8. Customer balance
  let customerBalance: number | null = null
  if (sale.customerId != null) {
    const delta = round2(charge - creditApplied) // + charge (owes more) / − creditApplied (owes less)
    if (delta !== 0) {
      const cust = await tx.customer.update({
        where: { id: sale.customerId },
        data: { balance: { increment: delta } },
        select: { balance: true },
      })
      customerBalance = cust.balance
    } else {
      const cust = await tx.customer.findUnique({
        where: { id: sale.customerId },
        select: { balance: true },
      })
      customerBalance = cust?.balance ?? null
    }
  }

  // ── 9. Till — only money that actually moved NOW
  if (refund > 0) {
    await createPrincipalCashEntry(tx, {
      tenantId,
      userId,
      method: refundMethod,
      source: 'return',
      refId: saleId,
      amount: -refund, // money OUT of the drawer to the customer
      note: `${noteBase} (مرتجع #${created.id})`,
    })
  }
  if (charge > 0 && !hasCustomer) {
    // Walk-in exchange price difference collected in cash NOW.
    await createPrincipalCashEntry(tx, {
      tenantId,
      userId,
      method: refundMethod,
      source: 'return',
      refId: saleId,
      amount: charge, // money INTO the drawer
      note: `فرق استبدال ${noteBase} (مرتجع #${created.id})`,
    })
  }

  // ── 10. Sale status + refunded total
  const remainingItems = await tx.saleItem.findMany({
    where: { saleId },
    select: { quantity: true, returnedQty: true },
  })
  const fullyReturned = remainingItems.every((it) => it.returnedQty >= it.quantity)
  const status = fullyReturned ? SALE_STATUS.RETURNED : SALE_STATUS.PARTIAL_RETURN
  await tx.sale.update({
    where: { id: saleId },
    data: {
      status,
      ...(refund > 0 ? { refunded: { increment: refund } } : {}),
    },
  })

  return { returnId: created.id, total, exchangeTotal, refund, creditApplied, charge, status, customerBalance }
}

const REFUND_METHOD_SET = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])

/**
 * 🛡️ 2026-09-30: weighted-average re-weight when goods re-enter stock.
 *   newCost = (Q_before × C_before + qty × lineCost) / (Q_before + qty)
 * Returns the patch object for product.update, or null when nothing changes.
 */
function costReweight(
  cur: { quantity: number; cost: number } | null,
  qty: number,
  lineCost: number,
): { cost: number } | null {
  if (!cur) return null
  const qBefore = Math.max(0, cur.quantity)
  const cBefore = Math.max(0, cur.cost)
  const qAfter = qBefore + qty
  if (qAfter <= 0) return null
  const newCost = Math.max(0, round2((qBefore * cBefore + qty * Math.max(0, lineCost)) / qAfter))
  if (newCost === cBefore) return null
  return { cost: newCost }
}
