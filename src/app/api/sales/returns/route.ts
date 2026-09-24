import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * Fashion Pro capability: returns_exchange
 *
 * POST /api/sales/returns
 * Body: {
 *   saleItemId: number,        // original SaleItem being returned
 *   quantity: number,          // pieces returned (must be <= original quantity)
 *   exchange?: {               // optional replacement
 *     productId: number,
 *     price: number,
 *     quantity: number,
 *   },
 *   cashDelta?: number         // signed cash difference paid/refunded to customer
 * }
 *
 * 🛡️ 2026-09-15 (v2): Accounting audit fixes — Bug #4 + Bug #2.
 *
 * Bug #4: Customer balance wasn't reversed for credit returns.
 *   Example: Customer bought 100 on credit (paid=0, balance+=100).
 *   Then returns 30 worth → Sale.total becomes 70, but Customer.balance
 *   stayed at 100 → customer is double-charged 30 EGP.
 *   Fix: Reverse the customer balance proportionally to the credit portion.
 *   Also update Sale.paid when there's a cash refund.
 *
 * Bug #2: Variant stock not restored. The return only restored Product.quantity
 *   but if the original SaleItem had a variantId, the stock was deducted from
 *   the variant (not the product). We need to branch on variantId.
 *
 * Bug (unreported): Sale.paid wasn't decremented on cash refunds. If customer
 *   paid 50 in cash and then returned 30 worth (cashDelta=-30), the drawer
 *   got the -30 entry but Sale.paid stayed at 50. Now we decrement Sale.paid
 *   so it stays in sync with what actually went in the drawer.
 */
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    await requireCapability(session, 'returns_exchange')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const body = await req.json().catch(() => null)
  const saleItemId = parseInt(body?.saleItemId, 10)
  const quantity = parseInt(body?.quantity, 10)
  if (!saleItemId || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'بيانات المرتجع غير مكتملة' }, { status: 400 })
  }
  const cashDelta = Number(body?.cashDelta ?? 0) || 0

  // 🛡️ Include variant on the lookup so we can restore variant stock (Bug #2).
  const item = await db.saleItem.findUnique({
    where: { id: saleItemId },
    include: { sale: { include: { customer: true } }, variant: true },
  })
  if (!item || item.sale.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العنصر غير موجود' }, { status: 404 })
  }
  if (quantity > item.quantity) {
    return NextResponse.json({ error: 'الكمية المرتجعة أكبر من الأصلية' }, { status: 400 })
  }

  const result = await db.$transaction(async (tx) => {
    // 🛡️ productId might be null if the product was hard-deleted via
    // mode=archive (v3 — nullable productId). If so, skip stock restoration.
    if (item.productId == null) {
      throw new Error('المنتج الأصلي تم حذفه نهائياً — مفيش مخزون لاستعادته. استخدم DELETE للفاتورة كاملة.')
    }

    // ─── Restore stock (Bug #2 fix) ───
    if (item.variantId && item.variant) {
      // Original deductStock decremented ProductVariant.quantity, so
      // restore to the variant (NOT to the parent product).
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { quantity: { increment: quantity } },
      })
      // Re-sync the parent product's quantity = sum of variants.
      const allVariants = await tx.productVariant.findMany({
        where: { productId: item.productId },
        select: { quantity: true },
      })
      const variantSum = allVariants.reduce((s, v) => s + v.quantity, 0)
      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: variantSum },
      })
    } else {
      // No variant — restore the parent product directly.
      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { increment: quantity } },
      })
    }
    // Audit trail
    await tx.stockMovement.create({
      data: {
        tenantId: session.tenantId,
        branchId: item.sale.branchId ?? null,
        productId: item.productId,
        type: 'return',
        quantity,
        refType: 'sale',
        refId: item.saleId,
        note: `مرتجع من فاتورة #${item.sale.invoiceNo ?? item.saleId}`,
        userId: session.userId,
      },
    })

    // ─── Reduce original SaleItem quantity + Sale total ───
    const unitPrice = item.price
    const refundAmount = unitPrice * quantity
    await tx.saleItem.update({
      where: { id: item.id },
      data: { quantity: { decrement: quantity } },
    })
    await tx.sale.update({
      where: { id: item.saleId },
      data: { total: { decrement: refundAmount } },
    })

    // ─── Exchange (optional) ───
    let exchangeCharge = 0
    if (body?.exchange) {
      const ex = body.exchange
      const exProductId = parseInt(ex.productId, 10)
      const exQty = parseInt(ex.quantity, 10) || 1
      const exPrice = Number(ex.price ?? 0) || 0
      const p = await tx.product.findUnique({ where: { id: exProductId } })
      if (!p || p.tenantId !== session.tenantId) throw new Error('منتج الاستبدال غير موجود')

      if (p.quantity < exQty) {
        throw new Error('مخزون الاستبدال غير كافي')
      }
      await tx.product.update({
        where: { id: exProductId },
        data: { quantity: { decrement: exQty } },
      })
      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: item.sale.branchId ?? null,
          productId: exProductId,
          type: 'sale',
          quantity: -exQty,
          refType: 'sale',
          refId: item.saleId,
          note: `استبدال في فاتورة #${item.sale.invoiceNo ?? item.saleId}`,
          userId: session.userId,
        },
      })
      exchangeCharge = exPrice * exQty
      await tx.saleItem.create({
        data: {
          saleId: item.saleId,
          productId: exProductId,
          name: p.name + ' (استبدال)',
          price: exPrice,
          quantity: exQty,
          cost: p.cost,
        },
      })
      await tx.sale.update({
        where: { id: item.saleId },
        data: { total: { increment: exchangeCharge } },
      })
    }

    // ─── Cash movement for the net difference ───
    if (cashDelta !== 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'return',
          refId: item.saleId,
          amount: cashDelta,
          note: `مرتجع/استبدال فاتورة #${item.sale.invoiceNo ?? item.saleId}`,
          userId: session.userId,
        },
      })

      // 🛡️ Bug fix (unreported): if cash refund (cashDelta < 0), decrement
      // Sale.paid so it stays in sync with what's actually in the drawer.
      // This makes Sale.paid the "total cash entered drawer for this sale"
      // at any point in time.
      if (cashDelta < 0) {
        await tx.sale.update({
          where: { id: item.saleId },
          data: { paid: { decrement: Math.abs(cashDelta) } },
        })
      } else if (cashDelta > 0) {
        // Customer paid extra (e.g. upgrade for the exchange)
        await tx.sale.update({
          where: { id: item.saleId },
          data: { paid: { increment: cashDelta } },
        })
      }
    }

    // ─── Bug #4 fix: Reverse customer balance for credit returns ───
    // If the customer bought on credit (paid < total) AND we're returning
    // items, we need to reverse the credit portion proportionally.
    //
    // Example:
    //   Sale: total=100, paid=0, customer.balance += 100 (credit sale)
    //   Return 30 worth → refundAmount=30, sale.total becomes 70
    //   unpaidRatio BEFORE return = (100-0)/100 = 1.0
    //   balanceToReverse = 30 × 1.0 = 30
    //   customer.balance becomes 100 - 30 = 70 ✓
    //
    // Example with partial payment:
    //   Sale: total=100, paid=40, customer.balance += 60 (partial credit)
    //   Return 50 worth → refundAmount=50
    //   unpaidRatio = (100-40)/100 = 0.6
    //   balanceToReverse = 50 × 0.6 = 30
    //   customer.balance becomes 60 - 30 = 30 ✓ (correct: still owes 30 on the 50 remaining)
    if (item.sale.customerId && item.sale.paid < item.sale.total) {
      const totalBeforeReturn = item.sale.total
      const paidBeforeReturn = item.sale.paid
      // Avoid division by zero (shouldn't happen since total > 0 for sales)
      if (totalBeforeReturn > 0) {
        const unpaidRatio = (totalBeforeReturn - paidBeforeReturn) / totalBeforeReturn
        const balanceReversal = refundAmount * unpaidRatio
        if (balanceReversal > 0) {
          await tx.customer.update({
            where: { id: item.sale.customerId },
            data: { balance: { decrement: balanceReversal } },
          })
        }
      }
    }

    return {
      ok: true,
      refundAmount,
      exchangeCharge,
      cashDelta,
      customer_balance_reversed:
        item.sale.customerId && item.sale.paid < item.sale.total
          ? refundAmount * ((item.sale.total - item.sale.paid) / item.sale.total)
          : 0,
    }
  })

  return NextResponse.json(result, { status: 201 })
}
