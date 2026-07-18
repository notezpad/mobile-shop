import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(
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
  const eid = parseInt(id, 10)
  if (isNaN(eid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const expense = await db.expense.findUnique({ where: { id: eid } })
  if (!expense || expense.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 })
  }

  await db.$transaction(async (tx) => {
    // restore the cash that left the till for this expense
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'expense',
        refId: eid,
        amount: expense.amount,
        note: `إلغاء مصروف ${expense.category}`,
        userId: session.userId,
      },
    })
    await tx.expense.delete({ where: { id: eid } })
  })

  return NextResponse.json({ ok: true })
}
