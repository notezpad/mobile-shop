import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { shiftDifference, summarizeShift, round2 } from '@/lib/pos/pricing'

export const dynamic = 'force-dynamic'

async function entriesFor(tenantId: string, userId: string, since: Date) {
  return db.cashEntry.findMany({
    where: { tenantId, userId, createdAt: { gte: since } },
    select: { source: true, refId: true, amount: true, method: true },
  })
}

/**
 * GET            → the caller's open shift + live summary (or { shift: null })
 * GET ?history=1 → last 20 shifts of the shop (managers only)
 */
export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  return withDb(async () => {
    if (new URL(req.url).searchParams.get('history')) {
      if (session.role === 'EMPLOYEE') return NextResponse.json({ error: 'ممنوع — هذه العملية للمدير فقط' }, { status: 403 })
      const rows = await db.cashShift.findMany({ where: { tenantId: session.tenantId }, orderBy: { id: 'desc' }, take: 20 })
      const ids = [...new Set(rows.map((r) => r.userId))]
      const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
      const nameOf = new Map(users.map((u) => [u.id, u.name]))
      return NextResponse.json({ data: rows.map((r) => ({ ...r, userName: nameOf.get(r.userId) ?? null })) })
    }

    const shift = await db.cashShift.findFirst({
      where: { tenantId: session.tenantId, userId: session.userId, closedAt: null },
      orderBy: { id: 'desc' },
    })
    if (!shift) return NextResponse.json({ shift: null })
    const summary = summarizeShift(shift.openingCash, await entriesFor(session.tenantId, session.userId, shift.openedAt))
    return NextResponse.json({ shift, summary })
  })
}

/**
 * POST { action: 'open', openingCash }
 * POST { action: 'close', countedCash, note? }   — the SERVER computes the expected cash, the client only reports what was counted.
 */
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const body = await req.json().catch(() => null)
  if (!body || (body.action !== 'open' && body.action !== 'close')) {
    return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 })
  }

  return withDb(async () => {
    const open = await db.cashShift.findFirst({
      where: { tenantId: session.tenantId, userId: session.userId, closedAt: null },
      orderBy: { id: 'desc' },
    })

    if (body.action === 'open') {
      const opening = Number(body.openingCash)
      if (!Number.isFinite(opening) || opening < 0) return NextResponse.json({ error: 'مبلغ افتتاح الدرج غير صحيح' }, { status: 400 })
      // Idempotent: a replayed/duplicate open (offline outbox, double tap) returns the shift that already exists.
      if (open) return NextResponse.json({ shift: open }, { status: 200 })
      const shift = await db.cashShift.create({
        data: { tenantId: session.tenantId, branchId: session.branchId ?? null, userId: session.userId, openingCash: round2(opening) },
      })
      return NextResponse.json({ shift }, { status: 201 })
    }

    // close
    if (!open) return NextResponse.json({ error: 'مفيش وردية مفتوحة' }, { status: 404 })
    const counted = Number(body.countedCash)
    if (!Number.isFinite(counted) || counted < 0) return NextResponse.json({ error: 'المبلغ المعدود غير صحيح' }, { status: 400 })
    const summary = summarizeShift(open.openingCash, await entriesFor(session.tenantId, session.userId, open.openedAt))
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
    const closed = await db.cashShift.update({
      where: { id: open.id },
      data: {
        closedAt: new Date(),
        expectedCash: summary.expectedCash,
        countedCash: round2(counted),
        difference: shiftDifference(counted, summary.expectedCash),
        note,
      },
    })
    return NextResponse.json({ shift: closed, summary })
  })
}
