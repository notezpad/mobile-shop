import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ⚡ SANDBOX DEMO ADAPTER (2026-10-08): النسخة الأصلية تحسب MRR والنمو
// داخل Postgres ($queryRaw مع ::float8 / to_char / date_trunc / FILTER).
// SQLite لا يدعم هذه الصيغة — فالحساب يتم هنا في JS على مجموعة البيانات
// الصغيرة الخاصة بالمعاينة (نفس الأرقام بالضبط).

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
  const notPlatform = { not: PLATFORM_TENANT_ID }
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const [
    totalTenants,
    tenantsByStatus,
    activeSubs,
    totalSubsEver,
    activeTrials,
    expiringWithin7Days,
    expiringSoon,
    plans,
    allSubs,
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
    db.subscription.findMany({
      where: { tenantId: notPlatform },
      select: { id: true, status: true, period: true, createdAt: true, planId: true },
    }),
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

  // MRR (monthly-equivalent revenue) — computed in JS (SQLite demo):
  const planById = new Map(plans.map((p) => [p.id, p]))
  let mrr = 0
  for (const s of allSubs) {
    if (s.status !== 'active') continue
    const plan = planById.get(s.planId)
    if (!plan) continue
    if (s.period === 'monthly') mrr += plan.priceMonthly
    else if (s.period === 'yearly') mrr += plan.priceYearly / 12.0
  }

  const arpu = activeSubs > 0 ? Math.round(mrr / activeSubs) : 0
  const retentionRate =
    totalSubsEver > 0 ? Math.round((activeSubs / totalSubsEver) * 1000) / 10 : 100

  // Growth: new vs. cancelled per month (last 6 months) — JS grouping:
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const growthMap = new Map<string, { newSubs: number; cancelled: number }>()
  for (const s of allSubs) {
    const created = new Date(s.createdAt)
    if (created < sixMonthsAgo) continue
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
    const row = growthMap.get(key) ?? { newSubs: 0, cancelled: 0 }
    row.newSubs += 1
    if (s.status === 'cancelled') row.cancelled += 1
    growthMap.set(key, row)
  }
  const growth: Array<{ month: string; newSubs: number; cancelled: number }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = growthMap.get(key)
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
