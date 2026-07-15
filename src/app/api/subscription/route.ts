import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    if (err) return NextResponse.json(err.body, { status: err.status })
    // For other errors, still return unauthorized-ish
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  // Super admin has no subscription
  if (session.role === 'SUPER_ADMIN') {
    return NextResponse.json({
      ok: true,
      tenantStatus: 'active',
      endDate: null,
      daysLeft: null,
      planName: 'منصة',
      planCode: 'platform',
      period: 'permanent',
      expired: false,
      expiringSoon: false,
    })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, status: true, shopName: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  const latestSub = await db.subscription.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { endDate: 'desc' },
    include: { plan: true },
  })

  if (!latestSub) {
    return NextResponse.json({
      ok: true,
      tenantStatus: tenant.status,
      endDate: null,
      daysLeft: null,
      planName: '-',
      planCode: '-',
      period: '-',
      expired: tenant.status === 'expired',
      expiringSoon: false,
    })
  }

  const now = new Date()
  const daysLeft = Math.ceil(
    (latestSub.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  )
  const expired = latestSub.endDate < now || tenant.status === 'expired'
  const expiringSoon = !expired && daysLeft >= 0 && daysLeft <= 7

  return NextResponse.json({
    ok: true,
    tenantStatus: tenant.status,
    endDate: latestSub.endDate.toISOString(),
    daysLeft,
    planName: latestSub.plan.name,
    planCode: latestSub.plan.code,
    period: latestSub.period,
    expired,
    expiringSoon,
  })
}
