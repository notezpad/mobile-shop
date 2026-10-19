import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
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
 * 🛡️ 2026-09-30: Cancel a supplier payment.
 *
 * What changed vs. the old DELETE:
 *  1. Admin only (`requireAdmin`) — before, ANY logged-in user could cancel.
 *  2. The payment row is NOT deleted any more. It is marked
 *     `status = 'cancelled'` (+ cancelledAt / cancelledBy) so the supplier
 *     statement keeps its audit trail.
 *  3. The reversing till entry now carries the SAME payment method as the
 *     original one, so the cash / wallet / InstaPay balances stay correct
 *     (before it had method = null and unbalanced every per-method total).
 *  4. Every till entry that was created for this payment is reversed — this
 *     includes the 'commission' entry that older versions wrongly booked for
 *     supplier payments.
 *  5. Claimed atomically (`updateMany … status = 'active'`), so a double click
 *     or a replayed request cannot reverse the same payment twice.
 */
async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAdmin()
    await requireModule(session, 'suppliers')
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

  const payment = await db.supplierPayment.findUnique({
    where: { id: pid },
    include: { supplier: true },
  })
  if (!payment || payment.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 })
  }
  if (payment.status === 'cancelled') {
    return NextResponse.json({ error: 'الدفعة ملغية بالفعل' }, { status: 409 })
  }

  const amount = payment.amount
  const methodName = METHOD_LABELS[payment.method] || payment.method
  const supplierName = payment.supplier?.name ?? 'مورد'

  try {
    await db.$transaction(async (tx) => {
      // 0. Claim the cancellation atomically (only one request can win).
      const claimed = await tx.supplierPayment.updateMany({
        where: { id: pid, tenantId: session.tenantId, status: 'active' },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: session.userId,
        },
      })
      if (claimed.count !== 1) throw new AlreadyCancelled()

      // 1. We owe the supplier again.
      await tx.supplier.update({
        where: { id: payment.supplierId },
        data: { balance: { increment: amount } },
      })

      // 2. Reverse EVERY till entry that belongs to this payment.
      //    - the principal entry (source 'supplier_payment', refId = payment id)
      //    - a legacy 'commission' entry (older versions booked one for supplier
      //      payments). `refId` alone is not unique across tables (customer
      //      payments share source 'commission'), so match the note too.
      const commissionNote = new RegExp(`supplier_payment #${pid}(\\D|$)`)
      const candidates = await tx.cashEntry.findMany({
        where: {
          tenantId: session.tenantId,
          refId: pid,
          source: { in: ['supplier_payment', 'commission'] },
        },
      })
      const linked = candidates.filter((e) => {
        if (e.source === 'supplier_payment') return e.amount < 0 // originals only
        return commissionNote.test(e.note ?? '')
      })

      if (!linked.some((e) => e.source === 'supplier_payment')) {
        // Very old data without a linked till entry: still give the money back.
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: 'supplier_payment',
            refId: pid,
            amount,
            method: payment.method,
            note: `إلغاء دفعة - ${supplierName} - ${methodName}`,
            userId: session.userId,
          },
        })
      }
      for (const entry of linked) {
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: entry.source,
            refId: pid,
            amount: -entry.amount, // opposite sign cancels the original
            // same method as the original → per-method balances stay right
            method: entry.method ?? payment.method,
            note: `إلغاء ${entry.source === 'commission' ? 'عمولة' : 'دفعة'} - ${supplierName} - ${methodName}`,
            userId: session.userId,
          },
        })
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
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __DELETE(...args)))
}
