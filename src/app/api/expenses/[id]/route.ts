import { NextRequest, NextResponse } from 'next/server'
import { canAccessBranchRecord } from '@/lib/branch-scope-db'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// 🛡️ خ-5: نفس قوايم /api/expenses (التعريف محلي هنا لأن ملفات الـ route
// مبتقدرش تصدّر ثوابت عادية لملفات تانية)
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
const EXPENSE_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])

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
  if (!(await canAccessBranchRecord(session.tenantId, expense.branchId, session.branchId))) {
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

/**
 * 🛡️ خ-5 (2026-11-02): PATCH /api/expenses/[id] — تعديل مصروف (كانت الواجهة
 * بتناديه والمسار مش موجود أصلًا: التعديل الأوفلاين بيتقيد في الطابور بنجاح
 * وهمي وبعدين المزامنة ترميه بعد 5 محاولات 405 — التعديل بيضيع بصمت).
 *
 * المحاسبة: نفس منطق الحذف بالظبط — بنعكس القيد النقدي القديم (+ القيمة بنفس
 * طريقة الدفع) وبنسجّل قيد جديد بالمبلغ/الطريقة المعدّلة، جوه transaction واحدة.
 * مصروفات damage/payroll المولدة آليًا ممنوع تعدل من هنا زي ما ممنوع تتحذف.
 */
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

  const { id } = await params
  const eid = parseInt(id, 10)
  if (isNaN(eid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const expense = await db.expense.findUnique({ where: { id: eid } })
  if (!expense || expense.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 })
  }
  if (!(await canAccessBranchRecord(session.tenantId, expense.branchId, session.branchId))) {
    return NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 })
  }
  // مصروفات مولدة آليًا من أنظمة تانية — زي منع الحذف بالظبط
  if ((expense as any).source === 'damage') {
    return NextResponse.json(
      { error: 'مصروف الهالك مرتبط بحركة مخزون ولا يمكن تعديله من هنا' },
      { status: 409 },
    )
  }
  if ((expense as any).source === 'payroll') {
    return NextResponse.json(
      { error: 'مصروف المرتبات مرتبط بدورة رواتب ولا يمكن تعديله من هنا' },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const category = String(body.category ?? expense.category).trim()
  if (!category) {
    return NextResponse.json({ error: 'النوع مطلوب' }, { status: 400 })
  }
  if (!CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: 'النوع غير صالح — اختار من قايمة الأنواع المعروضة' },
      { status: 400 },
    )
  }
  const amount = Number(body.amount ?? expense.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }, { status: 400 })
  }
  const method = body.method === undefined || body.method === null || body.method === ''
    ? null
    : String(body.method)
  if (method !== null && !EXPENSE_METHODS.has(method)) {
    return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
  }
  const note = body.note !== undefined ? (body.note ? String(body.note).trim() || null : null) : expense.note

  // طريقة الدفع الجديدة: اللي بعتها الطلب، وإلا طريقة القيد الأصلي
  const originalEntry = await db.cashEntry.findFirst({
    where: { tenantId: session.tenantId, source: 'expense', refId: eid, amount: { lt: 0 } },
    orderBy: { id: 'desc' },
  })
  const effectiveMethod = method ?? originalEntry?.method ?? 'cash'

  await db.$transaction(async (tx) => {
    // 1) عكس القيد النقدي القديم — الفلوس بترجع للخزنة بنفس طريقة الدفع الأصلية
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'expense',
        refId: eid,
        amount: expense.amount, // موجب = استرداد (نفس منطق الحذف)
        method: originalEntry?.method ?? 'cash',
        note: `تعديل المصروف ${expense.category} — عكس القيد القديم`,
        userId: session.userId,
      },
    })
    // 2) القيد الجديد بالمبلغ/الطريقة المعدّلة
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'expense',
        refId: eid,
        amount: -amount,
        method: effectiveMethod,
        note: `المصروف ${category}${note ? ' - ' + note : ''}`,
        userId: session.userId,
      },
    })
    // 3) تحديث صف المصروف نفسه
    await tx.expense.update({
      where: { id: eid },
      data: { category, amount, note },
    })
  })

  return NextResponse.json({ ok: true })
}

export async function PATCH(...args: Parameters<typeof __PATCH>) {
  return withDb(() => __PATCH(...args))
}

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
