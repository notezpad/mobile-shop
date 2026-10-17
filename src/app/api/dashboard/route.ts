import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { recordCommission, createPrincipalCashEntry } from '@/lib/commission'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache } from '@/lib/edgeCache'
import { withSql, type Sql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

const METHODS = new Set(['vodafone_cash', 'instapay', 'fawry'])
const KINDS = new Set(['deposit', 'withdraw'])

/* ── ⚠️ التصديرات في أول الملف عمداً (2026-10-18) ──────────────────────────
   لزقة مشوهة (قص من الآخر أو ملف غلط) كانت خلت الملف المنشور من غير
   export POST → كل حفظ معاملة يرجع 405. لو حصل قص تاني من هنا ورايح
   البناء هيقع فشل ظاهر فوراً بدل ما يفضل شغال ناقص بصمت.
   الـ function declarations بتترفع (hoisting) فالترتيب ده سليم 100%.
   ═════════════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  return withSql((sql) => __GET(req, sql))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}

/**
 * ⚡ 2026-10-18 (نفس دوا صفحة المخزون): GET بقى SQL مباشر عبر postgres.js بدل
 * Prisma wasm — كانت أتقل صفحة متبقية في الموقع (التمويل مش متخزن في المتصفح،
 * فكل فتح صفحة = Prisma كامل + 3 جولات استعلام). الآن:
 *   - استعلام واحد (المعاملات + اسم المستخدم من subselect بدل findMany تاني)
 *   - كاش حافة 20 ثانية بنفس نمط مفاتيح المخزون (per-tenant + الفلاتر الفعلية)
 *   - الرد مصفوفة بنفس الحقول والترتيب بالظبط (id DESC، سقف 500):
 *     id, tenantId, method, kind, amount, commission, note, userId,
 *     status, cancelledAt, cancelledBy, createdAt, userName
 * POST فضل Prisma زي ما هو (عملية إيداع/سحب نادرة + عمولات).
 */
async function __GET(req: NextRequest, sql: Sql) {
  let session
  try {
    session = await requireAuth()
    await requireModule(session, 'finance')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const method = searchParams.get('method')
  const methodOk = !!method && METHODS.has(method)

  // ⚡ كاش حافة 20 ثانية — المفتاح بيشمل الفلاتر الفعلية بس (deterministic)
  const filterParts: string[] = []
  if (from) filterParts.push(`from=${from}`)
  if (to) filterParts.push(`to=${to}`)
  if (methodOk) filterParts.push(`method=${method}`)
  const finQuery = filterParts.join('&')
  const cached = await matchEdgeCache('/api/finance', finQuery, session.tenantId, '1')
  if (cached) return cached

  const tid = session.tenantId
  const whereParts = [sql`t."tenantId" = ${tid}`]
  if (from || to) {
    // 🕐 نفس دلالات from/to القديمة بتوقيت المحل (localDateStrToUtcBounds)
    const tz = await getTenantTimezone(tid)
    if (from) whereParts.push(sql` AND t."createdAt" >= ${localDateStrToUtcBounds(from, 'start', tz)}`)
    if (to) whereParts.push(sql` AND t."createdAt" <= ${localDateStrToUtcBounds(to, 'end', tz)}`)
  }
  if (methodOk) whereParts.push(sql` AND t."method" = ${method}`)

  const rows = await sql<{
    id: number
    tenantId: string
    method: string
    kind: string
    amount: number
    commission: number
    note: string | null
    userId: string | null
    status: string
    cancelledAt: Date | null
    cancelledBy: string | null
    createdAt: Date
    userName: string | null
  }[]>`
    SELECT t."id", t."tenantId", t."method", t."kind", t."amount", t."commission",
           t."note", t."userId", t."status", t."cancelledAt", t."cancelledBy", t."createdAt",
           (SELECT u."name" FROM "User" u WHERE u."id" = t."userId") AS "userName"
    FROM "Transaction" t
    WHERE ${whereParts}
    ORDER BY t."id" DESC
    LIMIT 500`

  const res = NextResponse.json(rows)
  await putEdgeCache(res.clone(), '/api/finance', finQuery, tid, 20, '1')
  return res
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
    await requireModule(session, 'finance')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const method = String(body.method ?? '')
  const kind = String(body.kind ?? '')
  if (!METHODS.has(method)) {
    return NextResponse.json({ error: 'وسيلة غير صالحة' }, { status: 400 })
  }
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
  }
  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
  }

  // 🛡️ 2026-09-15 (v3): commission rate lookup now uses the unified
  // `recordCommission()` helper inside the transaction. No need to pre-compute
  // here — the helper will look up the rate and compute correctly.

  const note = body.note ? String(body.note) : null
  const principalSign = kind === 'deposit' ? 1 : -1
  const methodName =
    method === 'vodafone_cash'
      ? 'محافظ إلكترونية'
      : method === 'instapay'
        ? 'انستاباي'
        : 'محفظة إلكترونية'

  const tx = await db.$transaction(async (dbx) => {
    const created = await dbx.transaction.create({
      data: {
        tenantId: session.tenantId,
        method,
        kind,
        amount,
        // 🛡️ Compute commission via the unified helper for consistency.
        // Pre-read it for the Transaction.commission field (the helper
        // creates a separate CashEntry, but the Transaction row also
        // needs to store it for the finance list view).
        commission: 0, // filled in below after calling recordCommission
        note,
        userId: session.userId,
      },
    })

    // Principal cash entry (signed by kind) with `method` column
    const principalEntry = await createPrincipalCashEntry(dbx, {
      tenantId: session.tenantId,
      userId: session.userId,
      method,
      source: 'transaction',
      refId: created.id,
      amount: principalSign * amount,
      note: `${kind === 'deposit' ? 'إيداع' : 'سحب'} ${methodName} - ${amount}`,
    })

    // 🛡️ Bug #5 fix: Use the unified commission helper (always POSITIVE —
    // the shop EARNS the commission). This was already the convention here,
    // but now it's centralized so all routes are consistent.
    const { commission, commissionEntryId } = await recordCommission(dbx, {
      tenantId: session.tenantId,
      userId: session.userId,
      method,
      amount,
      refType: 'transaction',
      refId: created.id,
      noteSuffix: methodName,
    })

    // Update the Transaction row with the commission amount (for the finance list view)
    if (commission > 0) {
      await dbx.transaction.update({
        where: { id: created.id },
        data: { commission },
      })
    }

    return {
      ...created,
      commission,
      commissionEntryId,
      linkedCashEntryId: principalEntry.id,
    }
  })

  // ⚡ المعاملة الجديدة لازم تظهر فوراً في القايمة — نمسح كاش قائمة التمويل
  // الافتراضية (بدون فلاتر — نفس الشكل اللي بيطابقه الـ UI عند الفتح).
  // أي فلاتر تانية شغالة بتنضفي تلقائياً بالـ TTL (20 ثانية).
  await purgeEdgeCache([{ pathname: '/api/finance', rawQuery: '' }], session.tenantId, '1')

  return NextResponse.json(tx, { status: 201 })
}