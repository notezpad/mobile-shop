import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

const CATEGORIES = new Set([
  'إيجار',
  'كهرباء ومياه',
  'مرتبات',
  'نقل ومواصلات',
  'صيانة المحل',
  'إنترنت واتصالات',
  'ضيافة',
  'هالك وتالف', // 🛡️ 2026-09-30: تسجيل خسارة الهالك (بتتسجل تلقائياً من حركة هالك في المخزون)
  'أخرى',
])

// 🛡️ 2026-09-30: طريقة دفع المصروف — عشان رصيد الكاش يفضل منفصل عن المحافظ
// (مصروف مدفوع من فودافون كاش مكاناش بيتسجل كاش).
const EXPENSE_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])

async function __GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const category = searchParams.get('category')

  const where: any = { tenantId: session.tenantId }
  // 🕐 2026-09-30: حدود from/to بتوقيت المحل مش توقيت السيرفر
  if (from || to) {
    const tz = await getTenantTimezone(session.tenantId)
    where.createdAt = {}
    if (from) where.createdAt.gte = localDateStrToUtcBounds(from, 'start', tz)
    if (to) where.createdAt.lte = localDateStrToUtcBounds(to, 'end', tz)
  }
  if (category && CATEGORIES.has(category)) {
    where.category = category
  }

  // ⚡ v12 EDGE CACHE (Error 1102 / CPU limit): صفحة المصروفات من صفحات
  // الإدارة — قايمة بـ 500 صف + أسماء المستخدمين في كل فتح. 20 ثانية كاش
  // على الحافة (نفس نهج /api/products) + مسح فوري بعد أي مصروف جديد.
  const rawQuery = `from=${from ?? ''}&to=${to ?? ''}&cat=${category && CATEGORIES.has(category) ? encodeURIComponent(category) : ''}`
  const cachedExpenses = await matchEdgeCache('/api/expenses', rawQuery, session.tenantId, '1')
  if (cachedExpenses) return cachedExpenses

  const rows = await db.expense.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 500,
  })
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const result = rows.map((r) => ({
    ...r,
    userName: r.userId ? (userNameById.get(r.userId) ?? null) : null,
  }))

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const byCategory = rows.reduce((acc: Record<string, number>, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.amount
    return acc
  }, {})

  const res = NextResponse.json({ expenses: result, total, byCategory })
  await putEdgeCache(res.clone(), '/api/expenses', rawQuery, session.tenantId, 20, '1')
  return res
}

async function __POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const category = String(body.category ?? '').trim()
  if (!category) {
    return NextResponse.json({ error: 'النوع مطلوب' }, { status: 400 })
  }
  // 🛡️ 2026-09-30 (X5): الفئة كانت بتتفحص في GET بس — POST كان بيقبل أي
  // نص كفئة جديدة، فتقارير المصروفات بتتلخبط بفئات موجودة خارج القايمة.
  if (!CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: 'النوع غير صالح — اختار من قايمة الأنواع المعروضة' },
      { status: 400 },
    )
  }
  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'المبلغ يجب أن يكون أكبر من صفر' },
      { status: 400 }
    )
  }
  const method = body.method === undefined || body.method === null || body.method === ''
    ? 'cash'
    : String(body.method)
  if (!EXPENSE_METHODS.has(method)) {
    return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
  }
  const note = body.note ? String(body.note).trim() || null : null

  const created = await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        tenantId: session.tenantId,
        branchId: session.branchId ?? null,
        category,
        amount,
        note,
        userId: session.userId,
      },
    })
    // money leaving the till
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'expense',
        refId: expense.id,
        amount: -amount,
        method, // 🛡️ X5: من أي درج/محفظة خرجت الفلوس
        note: `المصروف ${category}${note ? ' - ' + note : ''}`,
        userId: session.userId,
      },
    })
    return expense
  })

  // ⚡ v12: مصروف جديد → امسح كاش قائمة المصروفات فورًا (والتقارير بتتكافأ بالـ TTL)
  await purgeEdgeCache([PURGE_KEYS.expensesDefault], session.tenantId, '1')
  return NextResponse.json(created, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
