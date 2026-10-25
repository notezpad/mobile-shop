import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { createPrincipalCashEntry } from '@/lib/commission'

export const dynamic = 'force-dynamic'

async function __GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAdminFallback()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // 🔐 صلاحيات الموظف: موديول 'sales'
  try { await requireModule(session, 'sales') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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
  // 🔒 RBAC: تكلفة البنود مخفية عن اللي ملوش صلاحية الأرباح
  const canViewProfits = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.canViewProfits === true
  if (!canViewProfits) {
    return NextResponse.json({ ...sale, items: sale.items.map((it) => ({ ...it, cost: null })) })
  }
  return NextResponse.json(sale)
}

// GET stays readable by any authenticated user; DELETE is the money-moving one.
async function requireAdminFallback() {
  const { requireAuth } = await import('@/lib/auth')
  return requireAuth()
}

/**
 * 🛡️ 2026-09-30 (v3): whole-invoice refund — rebuilt on the supplier-return
 * safety model.
 *
 * What changed vs. v2 and why:
 *
 *  1. ADMIN ONLY now. This endpoint refunds real cash out of the drawer;
 *     before, any employee could trigger it.
 *
 *  2. 🐛 C1 FIX — the customer balance was over-reversed by exactly the
 *     amount of every post-sale payment. v2 did:
 *       step 2: balance += Σ SalePayment.amount      (undo payment bookings)
 *       step 5: balance −= max(0, total − (paid + Σpayments))  ← paid ALREADY
 *               includes the linked payments (payments POST increments it),
 *               so the payments were subtracted twice.
 *     The correct reversal of the sale's own booking (+ (total − paidAtSale))
 *     is: balance −= (total − paidAtSale), where paidAtSale = sale.paid −
 *     Σ(linked SalePayment.amount). Post-sale payments are undone separately
 *     by their own +amount (their booking was −amount). Net effect on the
 *     customer = −(outstanding of this sale) — never more, never less.
 *
 *  3. Double-refund race fixed: the "already returned?" check now happens
 *     INSIDE the transaction as an atomic claim
 *     (UPDATE … WHERE status <> 'مرتجعة') — a concurrent second request
 *     claims 0 rows and fails with 409.
 *
 *  4. Blocked when the invoice has any SaleReturn record (partial returns
 *     already restored some stock and credited the customer) — finish the
 *     return from the returns flow instead of mixing two accounting paths.
 *
 *  5. Stock is restored by the NET quantity (quantity − returnedQty) —
 *     consistent with the new partial-return engine (sale-return.ts).
 *
 *  6. Every refund till entry keeps a payment METHOD (sale.paymentMethod /
 *     the original payment's method) so per-method drawer balances stay right.
 *
 *  7. Linked customer payments are soft-CANCELLED (status/cancelledAt/By)
 *     instead of leaving live payment rows pointing at a dead invoice.
 */
async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAdmin()
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
    include: {
      items: { include: { variant: true } },
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
  // 🛡️ Block when a partial return already went through the returns flow —
  // mixing the two accounting paths would double-restore stock/credit.
  const existingReturns = await db.saleReturn.count({
    where: { tenantId: session.tenantId, saleId: sid },
  })
  if (existingReturns > 0) {
    return NextResponse.json(
      { error: 'الفاتورة فيها مرتجع جزئي مسجل — أكمل إرجاع الباقي من شاشة المرتجعات بدل حذف الفاتورة كلها' },
      { status: 409 },
    )
  }

  // 🛡️ C1 fix — paidAtSale excludes the linked post-sale payments (they
  // incremented Sale.paid when they were linked).
  const linkedTotal = sale.payments.reduce((sum, p) => sum + p.amount, 0)
  const paidAtSale = sale.paid - linkedTotal
  const creditReversal = Math.max(0, sale.total - paidAtSale)
  const totalCashRefund = sale.paid // everything that entered the drawer for this sale

  class AlreadyReturned extends Error {}

  try {
    await db.$transaction(async (tx) => {
      // ─── Step 0: claim the refund ATOMICALLY (double-click guard) ───
      const claimed = await tx.sale.updateMany({
        where: { id: sid, tenantId: session.tenantId, status: { not: 'مرتجعة' } },
        data: { status: 'مرتجعة' },
      })
      if (claimed.count !== 1) throw new AlreadyReturned()

      // ─── Step 1: Restore stock (net of already-returned quantities) ───
      for (const it of sale.items) {
        const restoreQty = it.quantity - it.returnedQty
        if (restoreQty <= 0) continue
        if (it.productId == null) continue

        if (it.variantId && it.variant) {
          // 👕 المرتجع بيرجع معروض (زي مرتجع البيع الجزئي)
          await tx.productVariant.update({
            where: { id: it.variantId },
            data: { quantity: { increment: restoreQty }, displayQty: { increment: restoreQty } },
          })
          const allVariants = await tx.productVariant.findMany({
            where: { productId: it.productId },
            select: { quantity: true, displayQty: true },
          })
          const variantSum = allVariants.reduce((s, v) => s + v.quantity, 0)
          const displaySum = allVariants.reduce((s, v) => s + v.displayQty, 0)
          await tx.product.update({
            where: { id: it.productId },
            data: { quantity: variantSum, displayQty: Math.min(displaySum, variantSum) },
          })
        } else {
          await tx.product.update({
            where: { id: it.productId },
            data: { quantity: { increment: restoreQty }, displayQty: { increment: restoreQty } },
          })
        }
        await tx.stockMovement.create({
          data: {
            tenantId: session.tenantId,
            branchId: sale.branchId ?? null,
            productId: it.productId,
            variantId: it.variantId, // 🎨 اللون/المقاس بيظهر في سجل الحركات
            type: 'return',
            quantity: restoreQty,
            refType: 'sale',
            refId: sid,
            note: `مرتجع فاتورة ${sale.invoiceNo ?? sid}`,
            userId: session.userId,
          },
        })
      }

      // ─── Step 2: Undo each linked post-sale payment ───
      // Their booking was: balance −= amount, cash +amount (with method).
      // Undo: balance += amount (below), cash mirrored −amount (same method),
      // the Payment row is soft-cancelled, the SalePayment link removed.
      const reversedEntryIds: number[] = []
      for (const p of sale.payments) {
        if (p.cashEntry) {
          reversedEntryIds.push(p.cashEntry.id)
          await tx.cashEntry.create({
            data: {
              tenantId: session.tenantId,
              source: 'refund',
              refId: p.cashEntry.id,
              amount: -p.cashEntry.amount,
              method: p.cashEntry.method, // 🛡️ keep per-method balances right
              note: `عكس دفعة فاتورة ${sale.invoiceNo ?? sid}`,
              userId: session.userId,
            },
          })
        }
        await tx.salePayment.delete({ where: { id: p.id } })
      }

      // Soft-cancel the Payment rows whose cash entries we just reversed
      // (payment → cashEntry: source 'payment', refId = payment id).
      if (reversedEntryIds.length > 0) {
        const paymentEntries = await tx.cashEntry.findMany({
          where: {
            id: { in: reversedEntryIds },
            source: 'payment',
          },
          select: { refId: true },
        })
        const paymentIds = [...new Set(paymentEntries.map((e) => e.refId).filter((v): v is number => v != null))]
        for (const pid of paymentIds) {
          await tx.payment.updateMany({
            where: { id: pid, tenantId: session.tenantId, status: 'active' },
            data: {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancelledBy: session.userId,
              note: `ملغية تلقائياً — مرتجع فاتورة ${sale.invoiceNo ?? sid}`,
            },
          })
        }
      }

      // ─── Step 3: Refund the sale-time payment (cash that entered then) ───
      if (paidAtSale > 0) {
        await createPrincipalCashEntry(tx, {
          tenantId: session.tenantId,
          userId: session.userId,
          method: sale.paymentMethod, // 🛡️ same way the money came in
          source: 'refund',
          refId: sid,
          amount: -paidAtSale,
          note: `مرتجع دفعة فاتورة ${sale.invoiceNo ?? sid}`,
        })
      }

      // ─── Step 4: Reverse the customer's credit (C1-correct formula) ───
      if (sale.customerId && creditReversal > 0) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { decrement: creditReversal } },
        })
      }

      // ─── Step 5: finalize the sale row (paid → 0, refunded ← what came in) ───
      await tx.sale.update({
        where: { id: sid },
        data: { paid: 0, refunded: totalCashRefund },
      })
    })
  } catch (e) {
    if (e instanceof AlreadyReturned) {
      return NextResponse.json({ error: 'البيع مرتجع بالفعل' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({
    ok: true,
    reversed: {
      sale_paid: paidAtSale,
      post_sale_payments: linkedTotal,
      total_cash_refunded: totalCashRefund,
      customer_credit_reversed: creditReversal,
    },
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __DELETE(...args)))
}
