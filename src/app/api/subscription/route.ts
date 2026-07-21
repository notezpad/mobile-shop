import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { ALL_MODULES } from '@/lib/features'

export const dynamic = 'force-dynamic'

function parseArr(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch { /* ignore */ }
  return null
}

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    if (err) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  // Super admin has no subscription — full access.
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
      businessType: 'electronics',
      enabledModules: [...ALL_MODULES],
      capabilities: ['collections', 'multi_unit'],
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
      businessType: 'electronics',
      enabledModules: [...ALL_MODULES],
      capabilities: [],
    })
  }

  const now = new Date()
  const daysLeft = Math.ceil(
    (latestSub.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  )
  const expired = latestSub.endDate < now || tenant.status === 'expired'
  const expiringSoon = !expired && daysLeft >= 0 && daysLeft <= 7

  const enabledModules =
    parseArr(latestSub.plan.enabledModules) ?? [...ALL_MODULES]
  const capabilities = parseArr(latestSub.plan.capabilities) ?? []
  const businessType =
    latestSub.plan.businessType === 'fashion' ? 'fashion' : 'electronics'

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
    businessType,
    enabledModules,
    capabilities,
  })
}
