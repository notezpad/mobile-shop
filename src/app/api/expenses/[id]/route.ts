import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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
  const eid = parseInt(id, 10)
  if (isNaN(eid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const expense = await db.expense.findUnique({ where: { id: eid } })
  if (!expense || expense.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 })
  }

  // 🛡️ 2026-09-30: مصروف الهالك بيتولد تلقائياً من حركة مخزون (نوع damage)
  // ومن غير قيد خزنة — لأن مفيش فلوس خرجت من الخزنة فعلاً، الخسارة في
  // البضاعة نفسها. حذفه من هنا كان هيرجّع قيمته للخزنة غلط (كأن فلوس رجعت
  // من غير ما تكون خرجت). الخسارة تتشال فقط بعكس حركة المخزون نفسها.
  if ((expense as any).source === 'damage') {
    return NextResponse.json(
      { error: 'مصروف الهالك مرتبط بحركة مخزون ولا يمكن حذفه من هنا — الخسارة بتتشال فقط بعكس حركة المخزون نفسها' },
      { status: 409 },
    )
  }

  // 👥 2026-10-28: مصروف المرتبات بيتولّد من صرف الرواتب (الخزنة بتخرج بالصافي بس
  // والباقي قسط سلفة) — حذفه من هنا هيرجّع مبلغ غلط للخزنة ويبوّظ الدورة.
  if ((expense as any).source === 'payroll') {
    return NextResponse.json(
      { error: 'مصروف المرتبات مرتبط بدورة رواتب ولا يمكن حذفه من هنا' },
      { status: 409 },
    )
  }

  await db.$transaction(async (tx) => {
    // 🛡️ 2026-09-30 (X10): حماية الضغط المزدوج — لو فيه قيد استرداد موجود
    // بالفعل للمصروف ده، يبقى اتمسح قبل كده ومفيش استرداد تاني.
    const alreadyReversed = await tx.cashEntry.findFirst({
      where: {
        tenantId: session.tenantId,
        source: 'expense',
        refId: eid,
        amount: { gt: 0 },
      },
      select: { id: true },
    })
    if (alreadyReversed) {
      throw new ExpenseAlreadyReversed()
    }
    // restore the cash that left the till for this expense
    // 🛡️ X5: الاسترداد بنفس طريقة الدفع الأصلية عشان أرصدة المحافظ تفضل مظبوطة.
    const originalEntry = await tx.cashEntry.findFirst({
      where: { tenantId: session.tenantId, source: 'expense', refId: eid, amount: { lt: 0 } },
      orderBy: { id: 'desc' },
    })
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'expense',
        refId: eid,
        amount: expense.amount,
        method: originalEntry?.method ?? 'cash',
        note: `إلغاء المصروف ${expense.category}`,
        userId: session.userId,
      },
    })
    await tx.expense.delete({ where: { id: eid } })
  })

  return NextResponse.json({ ok: true })
}

class ExpenseAlreadyReversed extends Error {}

export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(async () => {
    try {
      return await __DELETE(...args)
    } catch (e) {
      if (e instanceof ExpenseAlreadyReversed) {
        return NextResponse.json(
          { error: 'المصروف ده اتلغى بالفعل — حدث الصفحة' },
          { status: 409 },
        )
      }
      throw e
    }
  })
}
