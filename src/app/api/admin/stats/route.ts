import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'platform-tenant'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export async function GET() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const now = new Date()
  const tenantFilter = { id: { not: PLATFORM_TENANT_ID } }

  const [
    totalTenants,
    tenantsByStatus,
    activeSubs,
    expiringSoon,
    plans,
    allSubs,
    recentTenantsRaw,
  ] = await Promise.all([
    db.tenant.count({ where: tenantFilter }),
    db.tenant.groupBy({
      by: ['status'],
      where: tenantFilter,
      _count: true,
    }),
    db.subscription.count({
      where: { status: 'active', tenant: tenantFilter },
    }),
    db.subscription.findMany({
      where: {
        status: 'active',
        endDate: { gte: now, lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) },
        tenant: tenantFilter,
      },
      include: { tenant: true, plan: true },
      orderBy: { endDate: 'asc' },
      take: 5,
    }),
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        subscriptions: {
          where: { status: 'active', tenant: tenantFilter },
          select: { id: true },
        },
      },
    }),
    db.subscription.findMany({
      where: { tenant: tenantFilter },
      include: { plan: true, tenant: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.tenant.findMany({
      where: tenantFilter,
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        subscriptions: {
          orderBy: { endDate: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    }),
  ])

  // MRR
  let mrr = 0
  for (const s of allSubs) {
    if (s.status !== 'active') continue
    if (s.period === 'monthly') mrr += s.plan.priceMonthly
    else if (s.period === 'yearly') mrr += s.plan.priceYearly / 12
  }

  const statusMap: Record<string, number> = {}
  for (const s of tenantsByStatus) statusMap[s.status] = s._count
  const suspendedCount = (statusMap['suspended'] ?? 0) + (statusMap['cancelled'] ?? 0)
  const expiredCount = statusMap['expired'] ?? 0
  const activeTrials = allSubs.filter(
    (s) => s.status === 'active' && s.period === 'trial'
  ).length

  const arpu = activeSubs > 0 ? Math.round(mrr / activeSubs) : 0
  const totalSubsEver = allSubs.length
  const activeSubsCount = allSubs.filter((s) => s.status === 'active').length
  const retentionRate =
    totalSubsEver > 0 ? Math.round((activeSubsCount / totalSubsEver) * 1000) / 10 : 100

  const growth: Array<{ month: string; newSubs: number; cancelled: number }> = []
  for (let i = 5; i >= 0; i--) {
    const dStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const newSubs = allSubs.filter((s) => s.createdAt >= dStart && s.createdAt < dEnd).length
    const cancelled = allSubs.filter(
      (s) => s.status === 'cancelled' && s.createdAt >= dStart && s.createdAt < dEnd
    ).length
    growth.push({ month: ARABIC_MONTHS[dStart.getMonth()], newSubs, cancelled })
  }

  const planDistribution = plans.map((p) => ({
    plan: p.code,
    name: p.name,
    count: p.subscriptions.length,
  }))

  const recentTenants = recentTenantsRaw.map((t) => {
    const latestSub = t.subscriptions[0]
    return {
      id: t.id,
      shopName: t.shopName,
      planName: latestSub?.plan?.name ?? '-',
      planCode: latestSub?.plan?.code ?? '-',
      createdAt: t.createdAt.toISOString(),
      status: t.status,
    }
  })

  const expiringSoonData = expiringSoon.map((s) => ({
    subscriptionId: s.id,
    tenantId: s.tenantId,
    shopName: s.tenant.shopName,
    planName: s.plan.name,
    planCode: s.plan.code,
    endDate: s.endDate.toISOString(),
    daysLeft: Math.ceil((s.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  }))

  const expiringWithin7Days = allSubs.filter((s) => {
    if (s.status !== 'active') return false
    const daysLeft = (s.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    return daysLeft >= 0 && daysLeft <= 7
  }).length

  return NextResponse.json({
    totalTenants,
    activeSubscriptions: activeSubs,
    mrr: Math.round(mrr),
    expiringWithin7Days,
    suspendedCount,
    expiredCount,
    activeTrials,
    arpu,
    retentionRate,
    growth,
    planDistribution,
    expiringSoon: expiringSoonData,
    recentTenants,
  })
}
