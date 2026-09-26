import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { checkLowStockAndNotify, checkExpiringSubscriptions } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function startOfMonth(d: Date) {
  const x = new Date(d)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // ?days=7|14|30 — controls the chart period (default 7)
  const url = new URL(req.url)
  const rawDays = parseInt(url.searchParams.get('days') ?? '7', 10)
  const chartDays = [7, 14, 30].includes(rawDays) ? rawDays : 7

  return withDb(async () => {
    const tenantFilter = { tenantId: session.tenantId }
    const now = new Date()
    const todayStart = startOfDay(now)
    const monthStart = startOfMonth(now)
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const lastNStart = new Date(todayStart)
    lastNStart.setDate(lastNStart.getDate() - (chartDays - 1))
    // keep last7Start alias for backward compat with existing references below
    const last7Start = lastNStart

    const tid = session.tenantId
    const chartEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    // All sums are computed inside PostgreSQL — loading every product and
    // sale item into the Worker was exceeding Cloudflare's CPU limit.
    const profitSince = (since: Date) => db.$queryRaw<{ profit: number }[]>`
      SELECT COALESCE(SUM((i."price" - i."cost") * i."quantity"), 0)::float8 AS profit
      FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
      WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${since}`

    const [
      todaySalesAgg, todayProfitRows, monthSalesAgg, monthProfitRows, cashAgg,
      stockRows, lowStockRows, activeMaintenance, activeMaintenanceOrders, last10SalesRaw,
      topProductRows, customersCount, custAgg, suppAgg, chartRows,
    ] = await Promise.all([
      db.sale.aggregate({ where: { ...tenantFilter, createdAt: { gte: todayStart }, status: 'مكتملة' }, _sum: { total: true }, _count: { id: true } }),
      profitSince(todayStart),
      db.sale.aggregate({ where: { ...tenantFilter, createdAt: { gte: monthStart }, status: 'مكتملة' }, _sum: { total: true }, _count: { id: true } }),
      profitSince(monthStart),
      db.cashEntry.aggregate({ where: tenantFilter, _sum: { amount: true } }),
      db.$queryRaw<{ vcost: number; vprice: number; low: number }[]>`
        SELECT COALESCE(SUM(p."cost" * p."quantity"), 0)::float8 AS vcost,
               COALESCE(SUM(p."price" * p."quantity"), 0)::float8 AS vprice,
               COUNT(*) FILTER (WHERE p."quantity" <= p."minQuantity")::int AS low
        FROM "Product" p WHERE p."tenantId" = ${tid}`,
      db.$queryRaw<{ id: number; name: string; quantity: number; minQuantity: number }[]>`
        SELECT p."id", p."name", p."quantity", p."minQuantity" FROM "Product" p
        WHERE p."tenantId" = ${tid} AND p."quantity" <= p."minQuantity"
        ORDER BY p."quantity" ASC LIMIT 50`,
      db.maintenanceOrder.count({ where: { ...tenantFilter, status: { in: ['مستلم', 'قيد العمل', 'مكتمل'] } } }),
      db.maintenanceOrder.findMany({ where: { ...tenantFilter, status: { in: ['مستلم', 'قيد العمل', 'مكتمل'] } }, orderBy: { id: 'desc' }, take: 10 }),
      db.sale.findMany({ where: tenantFilter, orderBy: { id: 'desc' }, take: 10, select: { id: true, invoiceNo: true, createdAt: true, total: true, paid: true, status: true, customer: { select: { name: true } } } }),
      db.$queryRaw<{ name: string; quantity: number; total: number }[]>`
        SELECT MIN(i."name") AS name, SUM(i."quantity")::float8 AS quantity, SUM(i."price" * i."quantity")::float8 AS total
        FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
        WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${last30Start}
        GROUP BY COALESCE(i."productId", 0) ORDER BY quantity DESC LIMIT 5`,
      db.customer.count({ where: tenantFilter }),
      db.customer.aggregate({ where: { ...tenantFilter, balance: { gt: 0 } }, _sum: { balance: true } }),
      db.supplier.aggregate({ where: { ...tenantFilter, balance: { gt: 0 } }, _sum: { balance: true } }),
      db.$queryRaw<{ createdAt: Date; total: number; profit: number }[]>`
        SELECT s."createdAt", s."total"::float8 AS total,
               COALESCE((SELECT SUM((i."price" - i."cost") * i."quantity") FROM "SaleItem" i WHERE i."saleId" = s."id"), 0)::float8 AS profit
        FROM "Sale" s
        WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${last7Start} AND s."createdAt" < ${chartEnd}`,
    ])

    const n = (v: unknown) => Number(v ?? 0)
    const todaySalesTotal = todaySalesAgg._sum.total ?? 0
    const todaySalesCount = todaySalesAgg._count.id
    const todayProfit = n(todayProfitRows[0]?.profit)
    const monthSalesTotal = monthSalesAgg._sum.total ?? 0
    const monthProfit = n(monthProfitRows[0]?.profit)
    const cashBalance = cashAgg._sum.amount ?? 0
    const lowStockCount = n(stockRows[0]?.low)
    const stockValueCost = n(stockRows[0]?.vcost)
    const stockValuePrice = n(stockRows[0]?.vprice)
    const totalOutstandingDebt = n(custAgg._sum.balance)
    const totalSupplierDebt = n(suppAgg._sum.balance)

    // Chart: group the (small) per-sale rows by local day
    const pad = (x: number) => String(x).padStart(2, '0')
    const dayMap = new Map<string, { total: number; profit: number }>()
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(todayStart)
      d.setDate(d.getDate() - i)
      dayMap.set(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, { total: 0, profit: 0 })
    }
    for (const r of chartRows) {
      const d = new Date(r.createdAt)
      const slot = dayMap.get(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}`)
      if (slot) { slot.total += n(r.total); slot.profit += n(r.profit) }
    }
    const last7DaysSales = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }))

    const topProducts = topProductRows.map((r) => ({ name: r.name, quantity: n(r.quantity), total: n(r.total) }))
    const lowStockAlerts = lowStockRows.map((p) => ({ id: n(p.id), name: p.name, quantity: n(p.quantity), minQuantity: n(p.minQuantity) }))

    // last 10 sales (lightweight payload)
    const last10Sales = last10SalesRaw.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      createdAt: s.createdAt.toISOString(),
      total: s.total,
      paid: s.paid,
      status: s.status,
      customerName: s.customer?.name ?? null,
    }))

    // active maintenance orders payload
    const activeMaintenanceList = activeMaintenanceOrders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      device: o.device,
      status: o.status,
      receivedAt: o.receivedAt.toISOString(),
    }))

    // 🔔 2026-09-14: Trigger notification checks (fire-and-forget).
    // We use `void` so these run in the background without blocking the
    // dashboard response. The helpers internally check tenant preferences
    // (notifyLowStock / notifyExpiringSubscription) and dedupe against
    // existing unread notifications of the same type — so calling them
    // on every dashboard load is safe (no duplicate notifications).
    //
    // The await Promise.allSettled lets both finish before the response
    // is sent. This adds ~50-150ms to the dashboard load but ensures the
    // user sees fresh notifications on dashboard open. If you'd rather
    // have it purely fire-and-forget (faster response, notifications show
    // up on the NEXT poll), replace with:
    //   void checkLowStockAndNotify(db, session.tenantId).catch(() => {})
    //   void checkExpiringSubscriptions(db, session.tenantId).catch(() => {})
    try {
      await Promise.allSettled([
        checkLowStockAndNotify(db, session.tenantId),
        checkExpiringSubscriptions(db, session.tenantId),
      ])
    } catch {
      // 🛡️ Never let notification failures break the dashboard.
      // The dashboard response is more important than notifications.
    }

    return NextResponse.json({
      todaySales: todaySalesTotal,
      todayProfit,
      cashBalance,
      lowStockCount,
      todaySalesCount,
      monthSales: monthSalesTotal,
      monthProfit,
      customersCount,
      activeMaintenance,
      totalOutstandingDebt,
      totalSupplierDebt,
      stockValueCost,
      stockValuePrice,
      last7DaysSales,
      topProducts,
      last10Sales,
      lowStockProducts: lowStockAlerts,
      activeMaintenanceOrders: activeMaintenanceList,
    })
  })
}
