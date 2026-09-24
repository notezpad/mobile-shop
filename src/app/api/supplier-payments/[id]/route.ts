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

  const payment = await db.supplierPayment.findUnique({
    where: { id: pid },
    include: { supplier: true },
  })
  if (!payment || payment.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 })
  }

  const amount = payment.amount
  const methodName = METHOD_LABELS[payment.method] || payment.method
  const supplierName = payment.supplier?.name ?? 'مورد'

  await db.$transaction(async (tx) => {
    // 1. Reverse the supplier balance (increment back — we owe them again)
    await tx.supplier.update({
      where: { id: payment.supplierId },
      data: { balance: { increment: amount } },
    })

    // 2. Reverse the CashEntry — mirror entry with opposite sign (+amount back into till)
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'supplier_payment',
        refId: pid,
        amount,
        note: `إلغاء دفعة - ${supplierName} - ${methodName}`,
        userId: session.userId,
      },
    })

    // 3. Delete the payment record
    await tx.supplierPayment.delete({ where: { id: pid } })
  })

  return NextResponse.json({ ok: true })
}
