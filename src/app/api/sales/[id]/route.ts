import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const sid = parseInt(id, 10)
  if (isNaN(sid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const sale = await db.sale.findUnique({
    where: { id: sid },
    include: { items: true, customer: true, payments: true },
  })
  if (!sale || sale.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'البيع غير موجود' }, { status: 404 })
  }
  return NextResponse.json(sale)
}

/**
 * 🛡️ 2026-09-15 (v2): Major accounting audit fixes.
 *
 * Bug #1: Cash drawer refund used `sale.total` (full invoice amount) instead
 *         of `sale.paid` (the amount that actually entered the drawer).
 *         If customer bought 200 and paid 50 (credit 150), the original sale
 *         added +50 to the drawer, but the DELETE was refunding -200, so
 *         the drawer lost 150 EGP that was never in it.
 *         → Fix: refund only `sale.paid` (cash that actually entered).
 *
 * Bug #2: Variant stock not restored. If sale had items with `variantId`,
 *         the original deductStock decremented `ProductVariant.quantity`
 *         (not `Product.quantity`), but the restore was incrementing
 *         `Product.quantity` — leading to phantom inventory.
 *         → Fix: branch on `variantId` — restore variant OR product, then
 *         re-sync the parent product's quantity.
 *
 * Bug #6: Separate payments weren't reversed. If customer made a payment
 *         via /api/payments (creates SalePayment + Customer.balance -= X),
 *         the DELETE sale was only refunding `sale.paid` (initial sale-time
 *         payment), not the subsequent payments.
 *         → Fix: also reverse all linked SalePayment rows + their CashEntries
 *         + customer balance increments for each reversed payment.
 *
 * Bug #4-related: Customer balance reversal was using `sale.total - sale.paid`
 *         which is the CREDIT portion at sale time. After payments, this is
 *         stale. The correct reversal is: customer balance should be
 *         decremented by the unpaid credit portion AFTER all payments
 *         (i.e., `max(0, sale.total - totalPaid)`).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const sid = parseInt(id, 10)
  if (isNaN(sid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  // Load the sale with ALL related data we need to reverse correctly:
  // - items (to restore stock — including variantId)
  // - customer (to know if there's a credit balance to reverse)
  // - payments (SalePayment rows — to reverse post-sale payments)
  // - payments.cashEntry (to mirror-reverse each payment's cash entry)
  const sale = await db.sale.findUnique({
    where: { id: sid },
    include: {
      items: { include: { product: true, variant: true } },
      customer: true,
      payments: { include: { cashEntry: true } },
    },
  })
  if (!sale || sale.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'البيع غير موجود' }, { status: 404 })
  }
  if (sale.status === 'مرتجعة') {
    return NextResponse.json(
      { error: 'البيع مرتجع بالفعل' },
      { status: 400 }
    )
  }

  // 🛡️ Calculate the correct accounting numbers BEFORE the transaction:
  //   totalPaid = sale.paid (at sale time) + sum of all SalePayment.amount
  //   cashToRefund = totalPaid (everything that entered the drawer)
  //   customerBalanceToReverse = max(0, sale.total - totalPaid) — unpaid portion
  const postSalePaymentsTotal = sale.payments.reduce(
    (sum, p) => sum + p.amount,
    0
  )
  const totalPaid = sale.paid + postSalePaymentsTotal
  const unpaidCredit = Math.max(0, sale.total - totalPaid)

  await db.$transaction(async (tx) => {
    // ─── Step 1: Restore stock (Bug #2 fix) ───
    for (const it of sale.items) {
      // 🛡️ productId might be null if the product was hard-deleted via
      // mode=archive (Bug #6 in v3 — nullable productId). If so, skip
      // stock restoration — the product doesn't exist anymore.
      if (it.productId == null) continue

      if (it.variantId && it.variant) {
        // 🛡️ Bug #2: Variant stock restore — the original deductStock
        // decremented ProductVariant.quantity, so we restore to the
        // variant (not the parent product).
        await tx.productVariant.update({
          where: { id: it.variantId },
          data: { quantity: { increment: it.quantity } },
        })
        // Re-sync the parent product's quantity = sum of variant quantities.
        // This keeps Product.quantity consistent with the sum of its variants.
        const allVariants = await tx.productVariant.findMany({
          where: { productId: it.productId },
          select: { quantity: true },
        })
        const variantSum = allVariants.reduce((s, v) => s + v.quantity, 0)
        await tx.product.update({
          where: { id: it.productId },
          data: { quantity: variantSum },
        })
      } else {
        // No variant — just restore the parent product's quantity directly.
        await tx.product.update({
          where: { id: it.productId },
          data: { quantity: { increment: it.quantity } },
        })
      }
      // 🛡️ Audit trail: create a StockMovement for the stock return.
      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: sale.branchId ?? null,
          productId: it.productId,
          type: 'return',
          quantity: it.quantity, // positive: stock is being restored
          refType: 'sale',
          refId: sid,
          note: `مرتجع فاتورة ${sale.invoiceNo ?? sid}`,
          userId: session.userId,
        },
      })
    }

    // ─── Step 2: Reverse each post-sale payment (Bug #6 fix) ───
    // Each SalePayment has its own CashEntry (positive, in the drawer).
    // We need to create a MIRROR negative CashEntry for each one, AND
    // increment Customer.balance (since the payment had decremented it).
    for (const p of sale.payments) {
      // Mirror-reverse the cash entry
      if (p.cashEntry) {
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: 'refund',
            refId: p.cashEntry.id, // link back to the original payment's cash entry
            amount: -p.cashEntry.amount,
            note: `عكس دفعة فاتورة ${sale.invoiceNo ?? sid}`,
            userId: session.userId,
          },
        })
      }
      // Restore customer balance (the payment had decremented it)
      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { increment: p.amount } },
        })
      }
      // Mark the SalePayment as reversed (soft-delete via status)
      await tx.salePayment.update({
        where: { id: p.id },
        data: { note: `reversed-by-sale-delete-${sid} | ${p.note ?? ''}`.substring(0, 500) },
      })
    }

    // ─── Step 3: Mark sale as refunded ───
    await tx.sale.update({
      where: { id: sid },
      data: {
        status: 'مرتجعة',
        // Reset paid to 0 since the sale is now fully reversed
        paid: 0,
      },
    })

    // ─── Step 4: Refund the initial sale-time payment (Bug #1 fix) ───
    // 🛡️ Bug #1 fix: refund `sale.paid` (NOT sale.total). The `sale.paid`
    // is the amount that actually entered the drawer at sale time. Refunding
    // `sale.total` would lose money that was never in the drawer (the credit
    // portion).
    if (sale.paid > 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'refund',
          refId: sid,
          amount: -sale.paid, // 🛡️ Bug #1 fix: -sale.paid, NOT -sale.total
          note: `مرتجع دفعة فاتورة ${sale.invoiceNo ?? sid}`,
          userId: session.userId,
        },
      })
    }

    // ─── Step 5: Reverse customer's credit balance ───
    // 🛡️ Bug #4 fix: use the ACTUAL unpaid credit (after all payments),
    // not the stale sale-time credit (`sale.total - sale.paid`).
    if (sale.customerId && unpaidCredit > 0) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { balance: { decrement: unpaidCredit } },
      })
    }
  })

  return NextResponse.json({
    ok: true,
    reversed: {
      sale_paid: sale.paid,
      post_sale_payments: postSalePaymentsTotal,
      total_cash_refunded: totalPaid,
      customer_credit_reversed: unpaidCredit,
    },
  })
}
