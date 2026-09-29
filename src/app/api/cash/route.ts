import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { parseSignedAmount } from '@/lib/amount'

export const dynamic = 'force-dynamic'

// 🛡️ 2026-09-30: طريقة الدفع/الاستلام للحركة اليدوية — زي باقي قيود الخزنة،
// عشان رصيد الكاش يفضل منفصل عن المحافظ/الانستاباي/البنك.
const MANUAL_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry', 'card', 'bank'])

async function __GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'cash') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const [entries, agg] = await Promise.all([
    db.cashEntry.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { id: 'desc' },
      take: 200,
    }),
    db.cashEntry.aggregate({
      where: { tenantId: session.tenantId },
      _sum: { amount: true },
    }),
  ])
  // `userId` on CashEntry is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
  const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const entriesWithNames = entries.map((e) => ({
    ...e,
    userName: e.userId ? (userNameById.get(e.userId) ?? null) : null,
  }))
  return NextResponse.json({
    balance: agg._sum.amount ?? 0,
    entries: entriesWithNames,
  })
}

async function __POST(req: NextRequest) {
  let session
  try {
    // 🛡️ 2026-09-30: القيد اليدوي أدمن بس — أي موظف كان يقدر يحرك الخزنة
    // بأي مبلغ وبأي اتجاه، ودي أخطر شاشة فلوس في النظام بعد البيع نفسه.
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'cash') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  // 🛡️ FIX: `Number()` returned NaN for "100-" / "−100" and silently lost the
  // sign for anything the client sent as text. Parse the sign explicitly so a
  // manual entry always moves the drawer in the direction the user asked for.
  const amount = parseSignedAmount(body.amount)
  if (amount === null || amount === 0) {
    return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
  }
  // 🛡️ 2026-09-30: السبب بقى إجباري. قبل كده الحركة اليدوية كانت بتنقبل أي
  // مبلغ من غير سبب — فبсаها في الخزنة من غير اسم ولا تفسير، ومحدش بيعرف
  // بعدين الفلوس دي دخلتة ليه أو خرجت ليه. الحد الأدنى 3 حروف عشان
  // "..." أو مسافات ماتعدّيش كسبب.
  const note = body.note ? String(body.note).trim() : ''
  if (note.length < 3) {
    return NextResponse.json(
      { error: 'اكتب سبب الحركة (إجباري — مثال: مصاريف نثرية، تحصيل من عميل)' },
      { status: 400 },
    )
  }
  const method =
    body.method === undefined || body.method === null || body.method === ''
      ? 'cash'
      : String(body.method)
  if (!MANUAL_METHODS.has(method)) {
    return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
  }
  const created = await db.cashEntry.create({
    data: {
      tenantId: session.tenantId,
      source: 'manual',
      amount,
      method,
      note,
      userId: session.userId,
    },
  })
  return NextResponse.json(created, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
