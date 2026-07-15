import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse, PLATFORM_TENANT_ID } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export async function GET(req: NextRequest) {
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

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const where = {
    tenant: { id: { not: PLATFORM_TENANT_ID } },
    amountPaid: { gt: 0 },
  }

  const all = await db.subscription.findMany({
    where,
    include: { tenant: true, plan: true },
    orderBy: { createdAt: 'desc' },
  })

  const inRange = all.filter((s) => {
    return s.createdAt >= from && s.createdAt <= to
  })

  const dailyRevenue = inRange
    .filter((s) => s.createdAt >= startOfToday)
    .reduce((sum, s) => sum + s.amountPaid, 0)
  const monthlyRevenue = inRange
    .filter((s) => s.createdAt >= startOfMonth)
    .reduce((sum, s) => sum + s.amountPaid, 0)
  const yearlyRevenue = inRange
    .filter((s) => s.createdAt >= startOfYear)
    .reduce((sum, s) => sum + s.amountPaid, 0)
  const totalRevenue = inRange.reduce((sum, s) => sum + s.amountPaid, 0)
  const avgMonthly = totalRevenue / 12

  // Last 12 months breakdown for chart
  const monthly: Array<{ month: string; revenue: number; count: number }> = []
  for (let i = 11; i >= 0; i--) {
    const dStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const monthSubs = all.filter(
      (s) => s.createdAt >= dStart && s.createdAt < dEnd
    )
    monthly.push({
      month: ARABIC_MONTHS[dStart.getMonth()],
      revenue: monthSubs.reduce((sum, s) => sum + s.amountPaid, 0),
      count: monthSubs.length,
    })
  }

  // Payment method breakdown
  const methodMap: Record<string, { revenue: number; count: number }> = {}
  for (const s of inRange) {
    const m = s.paymentMethod ?? 'manual'
    if (!methodMap[m]) methodMap[m] = { revenue: 0, count: 0 }
    methodMap[m].revenue += s.amountPaid
    methodMap[m].count += 1
  }
  const methodBreakdown = Object.entries(methodMap).map(([method, v]) => ({
    method,
    revenue: v.revenue,
    count: v.count,
  }))

  // Last 100 transactions
  const transactions = inRange.slice(0, 100).map((s) => ({
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
    transactions,
    count: inRange.length,
  })
}
