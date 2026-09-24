import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'انستاباي',
  fawry: 'محفظة إلكترونية',
}

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

  const amount = payment.amount
  const methodName = METHOD_LABELS[payment.method] || payment.method
  const customerName = payment.customer?.name ?? 'عميل'

  // Find the original CashEntries linked to this payment so we know exactly
  // what to offset. We compute the commission by looking at the linked
  // 'commission' source entry (if any).
  const linkedEntries = await db.cashEntry.findMany({
    where: {
      tenantId: session.tenantId,
      source: { in: ['payment', 'commission'] },
      refId: pid,
    },
  })

  await db.$transaction(async (tx) => {
    // 1. Reverse the customer balance (increment by payment amount)
    await tx.customer.update({
      where: { id: payment.customerId },
      data: { balance: { increment: amount } },
    })

    // 2. Reverse the CashEntry(ies) — create mirror entries with opposite sign
    for (const entry of linkedEntries) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: entry.source,
          refId: pid,
          amount: -entry.amount, // opposite sign cancels the original
          note: `إلغاء ${entry.source === 'commission' ? 'عمولة' : 'دفعة'} - ${customerName} - ${methodName}`,
          userId: session.userId,
        },
      })
    }

    // 3. Delete the payment record
    await tx.payment.delete({ where: { id: pid } })
  })

  return NextResponse.json({ ok: true })
}
