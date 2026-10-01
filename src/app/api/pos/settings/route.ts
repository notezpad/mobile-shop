import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { setManagerPin } from '@/lib/pos/approval'
import { isValidPin } from '@/lib/pos/pricing'

export const dynamic = 'force-dynamic'

/** POS behaviour settings. Anyone signed in can READ (the screen needs the limits); only managers can CHANGE. */
export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  return withDb(async () => {
    const t = await db.tenant.findUnique({
      where: { id: session.tenantId },
      select: { posRequireShift: true, posEmployeeMaxDiscountPct: true, posManagerPinHash: true, posPinLockedUntil: true },
    })
    return NextResponse.json({
      requireShift: t?.posRequireShift ?? false,
      employeeMaxDiscountPct: t?.posEmployeeMaxDiscountPct ?? 100,
      hasPin: !!t?.posManagerPinHash, // never the hash itself
      pinLocked: !!(t?.posPinLockedUntil && t.posPinLockedUntil.getTime() > Date.now()),
    })
  })
}

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.requireShift !== undefined) data.posRequireShift = !!body.requireShift
  if (body.employeeMaxDiscountPct !== undefined) {
    const n = Number(body.employeeMaxDiscountPct)
    if (!Number.isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: 'نسبة الخصم لازم تكون بين 0 و 100' }, { status: 400 })
    data.posEmployeeMaxDiscountPct = n
  }
  if (body.pin !== undefined && !body.clearPin && !isValidPin(body.pin)) {
    return NextResponse.json({ error: 'الـ PIN لازم يكون من 4 إلى 8 أرقام' }, { status: 400 })
  }

  return withDb(async () => {
    if (Object.keys(data).length > 0) await db.tenant.update({ where: { id: session.tenantId }, data })
    if (body.clearPin) await setManagerPin(session.tenantId, null)
    else if (body.pin !== undefined) await setManagerPin(session.tenantId, body.pin)

    // A limit with no PIN would leave cashiers unable to ever sell above it — say so instead of silently allowing it.
    const t = await db.tenant.findUnique({
      where: { id: session.tenantId },
      select: { posRequireShift: true, posEmployeeMaxDiscountPct: true, posManagerPinHash: true },
    })
    return NextResponse.json({
      requireShift: t?.posRequireShift ?? false,
      employeeMaxDiscountPct: t?.posEmployeeMaxDiscountPct ?? 100,
      hasPin: !!t?.posManagerPinHash,
      warning:
        (t?.posEmployeeMaxDiscountPct ?? 100) < 100 && !t?.posManagerPinHash
          ? 'حددت حد للخصم بس مفيش PIN — الكاشير مش هيقدر يتخطى الحد. حدد PIN للمدير.'
          : null,
    })
  })
}
