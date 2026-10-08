import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse, PLATFORM_TENANT_ID } from '@/lib/auth'
import { DEFAULT_TENANT_TIMEZONE, startOfDayInTz, startOfMonthInTz, startOfYearInTz } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const now = new Date()
  const fromStr = url.searchParams.get('from')
  const toStr = url.searchParams.get('to')

  // Default: last 12 months
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const from = fromStr ? new Date(fromStr) : defaultFrom
  const to = toStr ? new Date(toStr) : now

  // 🕐 هذا تقرير المنصة نفسها (عبر كل المحلات)، فمفيش "توقيت محل" واحد
  // ينطبق هنا — بنستخدم توقيت مصر بشكل ثابت كتوقيت تشغيل المنصة (بدل ما
  // كان بيتحسب بتوقيت السيرفر UTC، وده كان بيخلي "إيرادات اليوم" هنا
  // بتتغير حدودها فعلياً كل يوم بفارق ساعتين/3 ساعات عن يوم العمل الحقيقي).
  const startOfToday = startOfDayInTz(now, DEFAULT_TENANT_TIMEZONE)
  const startOfMonth = startOfMonthInTz(now, DEFAULT_TENANT_TIMEZONE)
  const startOfYear = startOfYearInTz(now, DEFAULT_TENANT_TIMEZONE)
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)

  // ⚡ PERF FIX (CPU time / Error 1102): this endpoint used to load EVERY
  // paid subscription across the platform's entire history (with `tenant`
  // and `plan` included) into the Worker, then ran the same array through
  // ~7 separate `.filter()`/`.reduce()` passes (daily/monthly/yearly/total
  // revenue, a 12-month breakdown, a payment-method breakdown...). That
  // array grows every time any tenant pays for anything, so this page got
  // slower — and closer to the CPU limit — every day, forever.
  //
  // Fix: every number below is computed by Postgres (SUM/COUNT/GROUP BY),
  // scoped to the requested date range in the WHERE clause instead of being
  // fetched in full and filtered in JS. The Worker only ever handles small,
  // bounded result sets (a handful of rows per breakdown, 100 transactions).
  const tenantId = { not: PLATFORM_TENANT_ID }
  const baseWhere = { tenantId, amountPaid: { gt: 0 } } as const

  const [
    rangeAgg, dailyAgg, monthlyAgg, yearlyAgg,
    monthlyRaw, methodRows, transactions, count,
  ] = await Promise.all([
    db.subscription.aggregate({
      where: { ...baseWhere, createdAt: { gte: from, lte: to } },
      _sum: { amountPaid: true },
    }),
    // Each period below is intersected with [from, to] — matching the
    // original `inRange.filter(s.createdAt >= startOfX)` semantics exactly
    // (the DB just applies both bounds in one WHERE instead of two passes).
    db.subscription.aggregate({
      where: { ...baseWhere, createdAt: { gte: startOfToday > from ? startOfToday : from, lte: to } },
      _sum: { amountPaid: true },
    }),
    db.subscription.aggregate({
      where: { ...baseWhere, createdAt: { gte: startOfMonth > from ? startOfMonth : from, lte: to } },
      _sum: { amountPaid: true },
    }),
    db.subscription.aggregate({
      where: { ...baseWhere, createdAt: { gte: startOfYear > from ? startOfYear : from, lte: to } },
      _sum: { amountPaid: true },
    }),
    // ⚡ SANDBOX DEMO ADAPTER (2026-10-08): كان استعلام SQL بصيغة PostgreSQL
    // (to_char/date_trunc/::float8) — اتحول لقراءة Prisma عادية + تجميع في JS
    // (مجموعة بيانات المعاينة صغيرة، نفس الأرقام بالظبط).
    db.subscription.findMany({
      where: { ...baseWhere, createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true, amountPaid: true },
    }),
    db.subscription.groupBy({
      by: ['paymentMethod'],
      where: { ...baseWhere, createdAt: { gte: from, lte: to } },
      _sum: { amountPaid: true },
      _count: true,
    }),
    // Last 100 transactions in range — was previously `inRange.slice(0, 100)`
    // after loading everything; now the DB does the ordering + limiting.
    db.subscription.findMany({
      where: { ...baseWhere, createdAt: { gte: from, lte: to } },
      include: { tenant: true, plan: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.subscription.count({ where: { ...baseWhere, createdAt: { gte: from, lte: to } } }),
  ])

  const n = (v: number | null | undefined) => v ?? 0
  const totalRevenue = n(rangeAgg._sum.amountPaid)
  const dailyRevenue = n(dailyAgg._sum.amountPaid)
  const monthlyRevenue = n(monthlyAgg._sum.amountPaid)
  const yearlyRevenue = n(yearlyAgg._sum.amountPaid)
  const avgMonthly = totalRevenue / 12

  // Fill in the 12-month window (including months with zero revenue, which
  // the grouping never returns a row for) — only 12 iterations.
  const grouped = new Map<string, { revenue: number; count: number }>()
  for (const s of monthlyRaw) {
    const d = new Date(s.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = grouped.get(key) ?? { revenue: 0, count: 0 }
    row.revenue += s.amountPaid
    row.count += 1
    grouped.set(key, row)
  }
  const monthlyByKey = grouped
  const monthly: Array<{ month: string; revenue: number; count: number }> = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = monthlyByKey.get(key)
    monthly.push({ month: ARABIC_MONTHS[d.getMonth()], revenue: n(row?.revenue), count: row?.count ?? 0 })
  }

  const methodBreakdown = methodRows
    .map((r) => ({
      method: r.paymentMethod ?? 'manual',
      revenue: n(r._sum.amountPaid),
      count: r._count,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const transactionsPayload = transactions.map((s) => ({
    id: s.id,
    date: s.createdAt.toISOString(),
    tenantId: s.tenantId,
    shopName: s.tenant.shopName,
    planCode: s.plan.code,
    planName: s.plan.name,
    period: s.period,
    amount: s.amountPaid,
    method: s.paymentMethod ?? 'manual',
    status: s.status,
  }))

  return NextResponse.json({
    dailyRevenue,
    monthlyRevenue,
    yearlyRevenue,
    totalRevenue,
    avgMonthly: Math.round(avgMonthly),
    monthly,
    methodBreakdown,
    transactions: transactionsPayload,
    count,
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
