import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { parseSignedAmount } from '@/lib/amount'
import { withSql, type Sql } from '@/lib/sql'
import { branchScopeSql } from '@/lib/branch-scope'

export const dynamic = 'force-dynamic'

// 🛡️ 2026-09-30: طريقة الدفع/الاستلام للحركة اليدوية — زي باقي قيود الخزنة،
// عشان رصيد الكاش يفضل منفصل عن المحافظ/الانستاباي/البنك.
const MANUAL_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry', 'card', 'bank'])

/**
 * ⚡ 2026-10-18 (نفس دوا صفحة المخزون): GET بقى SQL مباشر عبر postgres.js بدل
 * Prisma wasm — آخر صفحة كبيرة كانت بتشغّل محرك Prisma كامل في كل فتح
 * (استعلامان + findMany للمستخدمين = 3 جولات). الآن استعلامان متوازيان:
 *   - القايمة: آخر 200 حركة + اسم المستخدم من subselect
 *   - الرصيد: SUM على كل حركات المحل (مش آخر 200) — زي الـ aggregate القديم
 * الرد { balance, entries } بنفس الحقول والترتيب بالظبط
 * (id, tenantId, source, refId, amount, note, userId, method, createdAt, userName).
 * من غير كاش حافة عمداً — الخزنة بتتغير مع كل بيعة/مصروف/سداد، وحدثة الرصيد
 * أهم هنا من أي توفير إضافي.
 */
async function __GET(sql: Sql, req: NextRequest) {
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

  const tid = session.tenantId

  // 🏬 خزنة كل فرع: موظف الفرع بيشوف خزنة فرعه بس (والقيود غير المسندة لو فرعه هو الرئيسي).
  // المدير (بدون فرع) بيشوف الكل، وممكن يفلتر بـ ?branchId=<id> لخزنة فرع واحد.
  const branches = await sql<{ id: number; name: string; isMain: boolean }[]>`
    SELECT "id", "name", "isMain" FROM "Branch" WHERE "tenantId" = ${tid} ORDER BY "isMain" DESC, "id" ASC`
  const mainBranch = branches.find((b) => b.isMain) ?? null
  const reqBranch = new URL(req.url).searchParams.get('branchId')
  const filterBranch = session.branchId
    ? session.branchId
    : reqBranch && reqBranch !== 'all' && Number.isFinite(parseInt(reqBranch, 10))
      ? parseInt(reqBranch, 10)
      : null
  const scope = branchScopeSql(sql, tid, filterBranch, 'e.branchId')
  const scopeBal = branchScopeSql(sql, tid, filterBranch, 'branchId')

  const [entryRows, balanceRows, perBranchRows] = await Promise.all([
    sql<{
      id: number
      tenantId: string
      source: string
      refId: number | null
      amount: number
      note: string | null
      userId: string | null
      method: string | null
      branchId: number | null
      createdAt: Date
      userName: string | null
    }[]>`
      SELECT e."id", e."tenantId", e."source", e."refId", e."amount", e."note",
             e."userId", e."method", e."branchId", e."createdAt",
             (SELECT u."name" FROM "User" u WHERE u."id" = e."userId") AS "userName"
      FROM "CashEntry" e
      WHERE e."tenantId" = ${tid} AND ${scope}
      ORDER BY e."id" DESC
      LIMIT 200`,
    sql<{ balance: number }[]>`
      SELECT COALESCE(SUM("amount"), 0)::float8 AS balance
      FROM "CashEntry"
      WHERE "tenantId" = ${tid} AND ${scopeBal}`,
    // رصيد كل فرع (للمدير فقط) — القيود غير المسندة بتتحسب على الفرع الرئيسي
    session.branchId || branches.length === 0
      ? Promise.resolve([] as { branchId: number | null; balance: number }[])
      : sql<{ branchId: number | null; balance: number }[]>`
          SELECT "branchId", COALESCE(SUM("amount"), 0)::float8 AS balance
          FROM "CashEntry" WHERE "tenantId" = ${tid} GROUP BY "branchId"`,
  ])

  const nameOf = new Map(branches.map((b) => [b.id, b.name]))
  const effective = (id: number | null) => id ?? mainBranch?.id ?? null
  const entries = entryRows.map((e) => {
    const bid = effective(e.branchId)
    return { ...e, branchId: bid, branchName: bid != null ? nameOf.get(bid) ?? null : null }
  })
  const totals = new Map<number, number>()
  for (const r of perBranchRows) {
    const bid = effective(r.branchId)
    if (bid != null) totals.set(bid, (totals.get(bid) ?? 0) + Number(r.balance))
  }

  return NextResponse.json({
    balance: Number(balanceRows[0]?.balance ?? 0),
    entries,
    branches: session.branchId
      ? []
      : branches.map((b) => ({ id: b.id, name: b.name, isMain: b.isMain, balance: totals.get(b.id) ?? 0 })),
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
  // مبلغ من غير سبب — فبlsaها في الخزنة من غير اسم ولا تفسير، ومحدش بيعرف
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
  // 🏬 الحركة اليدوية لازم تتسجل على فرع: اللي المدير يحدده، وإلا الفرع الرئيسي (لو المحل عنده فروع).
  let branchId: number | null = session.branchId ?? null
  if (!branchId) {
    if (body.branchId) {
      const bid = parseInt(String(body.branchId), 10)
      const ok = Number.isFinite(bid)
        ? await db.branch.findFirst({ where: { id: bid, tenantId: session.tenantId }, select: { id: true } })
        : null
      if (!ok) return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 400 })
      branchId = bid
    } else {
      branchId = (await db.branch.findFirst({ where: { tenantId: session.tenantId, isMain: true }, select: { id: true } }))?.id ?? null
    }
  }
  const created = await db.cashEntry.create({
    data: {
      tenantId: session.tenantId,
      source: 'manual',
      amount,
      method,
      note,
      userId: session.userId,
      branchId,
    },
  })
  return NextResponse.json(created, { status: 201 })
}

export async function GET(req: NextRequest) {
  return withSql((sql) => __GET(sql, req))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __POST(...args)))
}