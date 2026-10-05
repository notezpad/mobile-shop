import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

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

const CATEGORIES = new Set([
  'إيجار',
  'كهرباء ومياه',
  'مرتبات',
  'نقل ومواصلات',
  'صيانة المحل',
  'إنترنت واتصالات',
  'ضيافة',
  'هالك وتالف',
  'أخرى',
])

async function __PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'expenses') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { id } = await params
  const eid = parseInt(id, 10)
  if (isNaN(eid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const expense = await db.expense.findUnique({ where: { id: eid } })
  if (!expense || expense.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 })
  }

  // مصروف الهالك مولّد من حركة مخزون ومفيش له قيد خزنة — تعديله من هنا هيبوّظ الربط.
  if ((expense as any).source === 'damage') {
    return NextResponse.json(
      { error: 'مصروف الهالك مرتبط بحركة مخزون ولا يمكن تعديله من هنا' },
      { status: 409 },
    )
  }

  const category = String(body.category ?? expense.category).trim()
  if (!CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: 'النوع غير صالح — اختار من قايمة الأنواع المعروضة' },
      { status: 400 },
    )
  }
  const amount = body.amount === undefined ? expense.amount : Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'المبلغ يجب أن يكون أكبر من صفر' },
      { status: 400 },
    )
  }
  const note =
    body.note === undefined
      ? expense.note
      : body.note
        ? String(body.note).trim() || null
        : null

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id: eid },
      data: { category, amount, note },
    })
    // نعدّل قيد الخزنة الأصلي في مكانه (بنفس طريقة الدفع) بدل ما نضيف قيد فرق —
    // عشان حذف المصروف بعد كده يفضل يشتغل صح ومايتحسبش "اتلغى بالفعل".
    const entry = await tx.cashEntry.findFirst({
      where: { tenantId: session.tenantId, source: 'expense', refId: eid, amount: { lt: 0 } },
      orderBy: { id: 'desc' },
      select: { id: true },
    })
    if (entry) {
      await tx.cashEntry.update({
        where: { id: entry.id },
        data: {
          amount: -amount,
          note: `المصروف ${category}${note ? ' - ' + note : ''}`,
        },
      })
    }
    return row
  })

  return NextResponse.json(updated)
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

export async function PATCH(...args: Parameters<typeof __PATCH>) {
  return withDb(() => __PATCH(...args))
}
