import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'انستاباي',
  fawry: 'محفظة إلكترونية',
}

class AlreadyCancelled extends Error {}

/**
 * 🛡️ 2026-09-30 (v2): Cancel a customer payment — mirrors the supplier
 * payment cancel exactly.
 *
 * What changed vs. the old DELETE:
 *  1. Admin only (`requireAdmin`) — before, ANY logged-in user could delete a
 *     payment (i.e. pull money out of the customer's account).
 *  2. The payment row is NOT deleted any more. It is marked
 *     `status = 'cancelled'` (+ cancelledAt / cancelledBy) so the customer
 *     statement keeps its audit trail.
 *  3. Claimed atomically (`updateMany … status = 'active'`) — a double click
 *     or a replayed request cannot reverse the same payment twice.
 *  4. 🐛 C2 FIX — payments linked to a sale (SalePayment + Sale.paid) are now
 *     fully unlinked: Sale.paid is decremented and the SalePayment row is
 *     removed, so a later whole-invoice refund cannot count the payment a
 *     second time (the old code left Sale.paid/SalePayment alive → the
 *     invoice delete later refunded the same money twice).
 *  5. The reversing till entries keep the ORIGINAL payment method, so the
 *     cash / wallet / InstaPay balances stay correct.
 *  6. Every till entry that was created for this payment is reversed —
 *     including the legacy 'commission' entries older versions booked.
 */
async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAdmin()
    await requireModule(session, 'customers')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    if (err) return NextResponse.json(err.body, { status: err.status })
    throw e
  }

  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  const payment = await db.payment.findUnique({
    where: { id: pid },
    include: { customer: true },
  })
  if (!payment || payment.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 })
  }
  if (payment.status === 'cancelled') {
    return NextResponse.json({ error: 'الدفعة ملغية بالفعل' }, { status: 409 })
  }

  const amount = payment.amount
  const methodName = METHOD_LABELS[payment.method] || payment.method
  const customerName = payment.customer?.name ?? 'عميل'

  try {
    await db.$transaction(async (tx) => {
      // 0. Claim the cancellation atomically (only one request can win).
      const claimed = await tx.payment.updateMany({
        where: { id: pid, tenantId: session.tenantId, status: 'active' },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: session.userId,
        },
      })
      if (claimed.count !== 1) throw new AlreadyCancelled()

      // 1. The customer owes us again.
      await tx.customer.update({
        where: { id: payment.customerId },
        data: { balance: { increment: amount } },
      })

      // 2. Reverse EVERY till entry that belongs to this payment.
      //    refId alone is not unique across tables (supplier payments booked
      //    legacy 'commission' entries with their own ids) → match the note
      //    for the legacy commission entries.
      const commissionNote = new RegExp(`— payment #${pid}(\\D|$)`)
      const candidates = await tx.cashEntry.findMany({
        where: {
          tenantId: session.tenantId,
          source: { in: ['payment', 'commission'] },
          refId: pid,
        },
      })
      const linkedEntries = candidates.filter((e) =>
        e.source === 'payment' ? e.amount > 0 : commissionNote.test(e.note ?? ''),
      )

      for (const entry of linkedEntries) {
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: entry.source,
            refId: pid,
            amount: -entry.amount, // opposite sign cancels the original
            method: entry.method ?? payment.method, // keep per-method balances right
            note: `إلغاء ${entry.source === 'commission' ? 'عمولة' : 'دفعة'} - ${customerName} - ${methodName}`,
            userId: session.userId,
          },
        })
      }

      // 3. 🛡️ C2 fix — unlink from any sale this payment was attached to.
      //    The SalePayment rows point at the payment's principal cash entry.
      const principalEntryIds = linkedEntries
        .filter((e) => e.source === 'payment')
        .map((e) => e.id)
      if (principalEntryIds.length > 0) {
        const salePayments = await tx.salePayment.findMany({
          where: { cashEntryId: { in: principalEntryIds } },
        })
        for (const sp of salePayments) {
          // The payment no longer counts toward the sale's paid total.
          await tx.sale.update({
            where: { id: sp.saleId },
            data: { paid: { decrement: sp.amount } },
          })
          await tx.salePayment.delete({ where: { id: sp.id } })
        }
      }
    })
  } catch (e) {
    if (e instanceof AlreadyCancelled) {
      return NextResponse.json({ error: 'الدفعة ملغية بالفعل' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
