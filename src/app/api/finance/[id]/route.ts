import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

const METHOD_LABELS: Record<string, string> = {
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'انستاباي',
  fawry: 'محفظة إلكترونية',
}

class AlreadyCancelled extends Error {}

/**
 * 🛡️ 2026-09-30 (X6): إلغاء معاملة محفظة (إيداع/سحب + عمولتها).
 *
 * قبل كده مفيش أي طريق للإلغاء خالص — معاملة غلط كانت تفضل للأبد، ومحلها
 * كان لازم يدوّر قيد عكسي يدوي (والعمولة تتقيد تاني غلط).
 *
 * نفس موك إلغاء الدفعات:
 *  1. أدمن بس + موديول التمويل.
 *  2. إلغاء ناعم (status='cancelled' + cancelledAt/By) — السجل بيفضل في
 *     سجل المعاملات بعلامة ملغية.
 *  3. مطالبة ذرية — ضغطتين/إعادة إرسال مابيعكسوش مرتين.
 *  4. عكس قيد الأصل + قيد العمولة بنفس طريقة الدفع.
 */
async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAdmin()
    await requireModule(session, 'finance')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    if (err) return NextResponse.json(err.body, { status: err.status })
    throw e
  }

  const { id } = await params
  const tid = parseInt(id, 10)
  if (isNaN(tid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  const txn = await db.transaction.findUnique({ where: { id: tid } })
  if (!txn || txn.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المعاملة غير موجودة' }, { status: 404 })
  }
  if (txn.status === 'cancelled') {
    return NextResponse.json({ error: 'المعاملة ملغية بالفعل' }, { status: 409 })
  }

  const methodName = METHOD_LABELS[txn.method] || txn.method

  try {
    await db.$transaction(async (tx) => {
      // 0. Claim the cancellation atomically.
      const claimed = await tx.transaction.updateMany({
        where: { id: tid, tenantId: session.tenantId, status: 'active' },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: session.userId,
        },
      })
      if (claimed.count !== 1) throw new AlreadyCancelled()

      // 1. Reverse the principal till entry (source 'transaction', refId = txn id).
      const principalEntry = await tx.cashEntry.findFirst({
        where: { tenantId: session.tenantId, source: 'transaction', refId: tid },
        orderBy: { id: 'asc' },
      })
      if (principalEntry && principalEntry.amount !== 0) {
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: 'transaction',
            refId: tid,
            amount: -principalEntry.amount,
            method: principalEntry.method ?? txn.method,
            note: `إلغاء ${txn.kind === 'deposit' ? 'إيداع' : 'سحب'} ${methodName} - ${txn.amount}`,
            userId: session.userId,
          },
        })
      } else {
        // Legacy data without a linked entry — reverse from the txn itself.
        const sign = txn.kind === 'deposit' ? 1 : -1
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: 'transaction',
            refId: tid,
            amount: -sign * txn.amount,
            method: txn.method,
            note: `إلغاء ${txn.kind === 'deposit' ? 'إيداع' : 'سحب'} ${methodName} - ${txn.amount}`,
            userId: session.userId,
          },
        })
      }

      // 2. Reverse the commission entry (source 'commission', refId = txn id —
      //    recordCommission writes refId with refType 'transaction', so this
      //    match is safe and replaces the old fragile note-regex).
      const commissionEntries = await tx.cashEntry.findMany({
        where: {
          tenantId: session.tenantId,
          source: 'commission',
          refId: tid,
          amount: { gt: 0 },
        },
      })
      for (const entry of commissionEntries) {
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: 'commission',
            refId: tid,
            amount: -entry.amount,
            method: entry.method ?? txn.method,
            note: `إلغاء عمولة ${methodName} — transaction #${tid}`,
            userId: session.userId,
          },
        })
      }
    })
  } catch (e) {
    if (e instanceof AlreadyCancelled) {
      return NextResponse.json({ error: 'المعاملة ملغية بالفعل' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
