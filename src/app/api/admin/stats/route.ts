import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'platform-tenant'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

async function __GET() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const now = new Date()
  const tenantFilter = { id: { not: PLATFORM_TENANT_ID } }
  // Direct-column equivalent of `tenant: tenantFilter` — avoids a join with
  // Tenant for every count/aggregate below.
  const notPlatform = { not: PLATFORM_TENANT_ID }
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  // ⚡ PERF FIX (CPU time / Error 1102): this endpoint used to load EVERY
  // subscription ever created (across every tenant, with `plan` + `tenant`
  // included) into the Worker, then ran ~18 separate `.filter()`/`.reduce()`
  // passes over that array in JS to compute MRR, growth, retention, etc.
  // That array only grows over time (every renewal adds a row), so this was
  // getting slower — and closer to the CPU limit — every single day, on a
  // page that gets opened constantly (the admin dashboard).
  //
  // Fix: every number below is now computed by Postgres itself (COUNT,
  // SUM, GROUP BY) — the Worker only ever receives small, fixed-size
  // result sets, no matter how many tenants/subscriptions exist.
  const [
    totalTenants,
    tenantsByStatus,
    activeSubs,
    totalSubsEver,
    activeTrials,
    expiringWithin7Days,
    expiringSoon,
    plans,
    mrrRow,
    growthRows,
    recentTenantsRaw,
  ] = await Promise.all([
    db.tenant.count({ where: tenantFilter }),
    db.tenant.groupBy({ by: ['status'], where: tenantFilter, _count: true }),
    db.subscription.count({ where: { status: 'active', tenantId: notPlatform } }),
    db.subscription.count({ where: { tenantId: notPlatform } }),
    db.subscription.count({ where: { status: 'active', period: 'trial', tenantId: notPlatform } }),
    db.subscription.count({
      where: { status: 'active', tenantId: notPlatform, endDate: { gte: now, lte: sevenDaysLater } },
    }),
    db.subscription.findMany({
      where: { status: 'active', tenantId: notPlatform, endDate: { gte: now, lte: fourteenDaysLater } },
      include: { tenant: true, plan: true },
      orderBy: { endDate: 'asc' },
      take: 5,
    }),
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        subscriptions: { where: { status: 'active', tenant: tenantFilter }, select: { id: true } },
      },
    }),
    // MRR: monthly-equivalent revenue of every currently-active subscription,
    // computed inside Postgres via a join instead of looping over every
    // subscription row in JS.
    db.$queryRaw<{ mrr: number }[]>`
      SELECT COALESCE(SUM(
        CASE WHEN s."period" = 'monthly' THEN p."priceMonthly"
             WHEN s."period" = 'yearly' THEN p."priceYearly" / 12.0
             ELSE 0 END
      ), 0)::float8 AS mrr
      FROM "Subscription" s
      JOIN "Plan" p ON p."id" = s."planId"
      WHERE s."status" = 'active' AND s."tenantId" != ${PLATFORM_TENANT_ID}`,
    // New vs. cancelled subscriptions per month, grouped in SQL (last 6 months).
    db.$queryRaw<{ month: string; newSubs: number; cancelled: number }[]>`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(*)::int AS "newSubs",
             COUNT(*) FILTER (WHERE "status" = 'cancelled')::int AS cancelled
      FROM "Subscription"
      WHERE "tenantId" != ${PLATFORM_TENANT_ID} AND "createdAt" >= ${sixMonthsAgo}
      GROUP BY 1 ORDER BY 1`,
    db.tenant.findMany({
      where: tenantFilter,
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        subscriptions: { orderBy: { endDate: 'desc' }, take: 1, include: { plan: true } },
      },
    }),
  ])

  const statusMap: Record<string, number> = {}
  for (const s of tenantsByStatus) statusMap[s.status] = s._count
  const suspendedCount = (statusMap['suspended'] ?? 0) + (statusMap['cancelled'] ?? 0)
  const expiredCount = statusMap['expired'] ?? 0

  const mrr = mrrRow[0]?.mrr ?? 0
  const arpu = activeSubs > 0 ? Math.round(mrr / activeSubs) : 0
  const retentionRate =
    totalSubsEver > 0 ? Math.round((activeSubs / totalSubsEver) * 1000) / 10 : 100

  // Fill in the 6-month window (including months with zero activity, which
  // the GROUP BY above never returns a row for) — only 6 iterations, so
  // this is a rounding error CPU-wise compared to the old N-subscription scan.
  const growthByMonth = new Map(growthRows.map((r) => [r.month, r]))
  const growth: Array<{ month: string; newSubs: number; cancelled: number }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = growthByMonth.get(key)
    growth.push({ month: ARABIC_MONTHS[d.getMonth()], newSubs: row?.newSubs ?? 0, cancelled: row?.cancelled ?? 0 })
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

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
