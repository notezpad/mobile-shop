import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * Fashion Pro capability: loyalty
 * Redeem loyalty points as a discount (1 point = 1 EGP).
 * POST /api/customers/[id]/loyalty/redeem  body: { points: number }
 * Returns the discount value; caller applies it to the next sale total.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    await requireCapability(session, 'loyalty')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const { id } = await params
  const customerId = parseInt(id, 10)
  const body = await req.json().catch(() => null)
  const points = parseInt(body?.points, 10)
  if (!customerId || !points || points <= 0) {
    return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 })
  }

  const c = await db.customer.findFirst({
    where: { id: customerId, tenantId: session.tenantId },
  })
  if (!c) return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  if (c.loyaltyPoints < points) {
    return NextResponse.json({ error: 'النقاط غير كافية' }, { status: 400 })
  }

  const updated = await db.customer.update({
    where: { id: customerId },
    data: { loyaltyPoints: { decrement: points } },
  })
  return NextResponse.json({
    ok: true,
    discount: points, // 1 point = 1 EGP
    remainingPoints: updated.loyaltyPoints,
  })
}
