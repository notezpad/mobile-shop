import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { matchEdgeCacheV, putEdgeCacheV, bumpEdgeCache, sortedQuery } from '@/lib/edgeCache'
import { recordCommission, createPrincipalCashEntry } from '@/lib/commission'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

const METHODS = new Set(['vodafone_cash', 'instapay', 'fawry'])
const KINDS = new Set(['deposit', 'withdraw'])

async function __GET(req: NextRequest) {
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

  const where: any = { tenantId: session.tenantId }
  // 🕐 2026-09-30: حدود from/to بتوقيت المحل مش توقيت السيرفر
  if (from || to) {
    const tz = await getTenantTimezone(session.tenantId)
    where.createdAt = {}
    if (from) where.createdAt.gte = localDateStrToUtcBounds(from, 'start', tz)
    if (to) where.createdAt.lte = localDateStrToUtcBounds(to, 'end', tz)
  }
  if (method && METHODS.has(method)) {
    where.method = method
  }

  // ⚡ EDGE CACHE v9: دفتر المعاملات (TTL 30s) + إبطال فوري بعد إضافة/إلغاء
  const sq = sortedQuery(req.url)
  const cached = await matchEdgeCacheV('/api/finance', sq, session.tenantId)
  if (cached) return cached

  const rows = await db.transaction.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 500,
  })
  // `userId` on Transaction is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
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
  const res = NextResponse.json(result)
  await putEdgeCacheV(res.clone(), '/api/finance', sq, session.tenantId, 30)
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
  // ⚡ v9: إبطال كاش المعاملات فوراً
  await bumpEdgeCache('/api/finance', session.tenantId)
  return NextResponse.json(tx, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
