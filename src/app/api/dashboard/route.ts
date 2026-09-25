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

    const [
      // PERF FIX (2026-09-25 v2): todaySales and monthSales used include:{items:true}
      // which loads potentially thousands of SaleItem rows into Worker memory on every
      // dashboard open. Replaced with aggregate queries (total) + separate profit queries
      // using only the columns needed. The full items list is NOT needed for the
      // dashboard — only the totals are displayed.
      todaySalesAgg,
      todayProfitRaw,
      monthSalesAgg,
      monthProfitRaw,
      cashAgg,
      allProducts,       // FIXED: fetch once, derive lowStockCount + stockValue from it
      activeMaintenance,
      activeMaintenanceOrders,
      last10SalesRaw,
      last30DaysSales,
      customersCount,
      customersWithBalance,
      suppliersWithBalance,
      // FIXED: fetch all last-7-days sales in ONE query instead of 7 sequential queries
      last7RawSales,
    ] = await Promise.all([
      // Today: aggregate total + count (no items needed)
      db.sale.aggregate({
        where: { ...tenantFilter, createdAt: { gte: todayStart }, status: 'مكتملة' },
        _sum: { total: true },
        _count: { id: true },
      }),
      // Today profit: only the columns needed for (price-cost)*qty calculation
      db.saleItem.findMany({
        where: {
          sale: { tenantId: tenantFilter.tenantId, createdAt: { gte: todayStart }, status: 'مكتملة' },
        },
        select: { price: true, cost: true, quantity: true },
      }),
      // Month: aggregate total (no items needed)
      db.sale.aggregate({
        where: { ...tenantFilter, createdAt: { gte: monthStart }, status: 'مكتملة' },
        _sum: { total: true },
        _count: { id: true },
      }),
      // Month profit items
      db.saleItem.findMany({
        where: {
          sale: { tenantId: tenantFilter.tenantId, createdAt: { gte: monthStart }, status: 'مكتملة' },
        },
        select: { price: true, cost: true, quantity: true },
      }),
      db.cashEntry.aggregate({
        where: tenantFilter,
        _sum: { amount: true },
      }),
      // FIXED: single products fetch — used for lowStockCount, stockValue, AND lowStockAlerts
      // PERF FIX (2026-09-25): only the 5 columns the dashboard actually uses.
      // Fetching every column of every product moved megabytes per request and
      // was a main reason the dashboard felt frozen (and sometimes timed out
      // with a 503 on large shops).
      db.product.findMany({
        where: tenantFilter,
        select: { id: true, name: true, quantity: true, minQuantity: true, cost: true, price: true },
      }),
      db.maintenanceOrder.count({
        where: { ...tenantFilter, status: { in: ['مستلم', 'قيد العمل', 'مكتمل'] } },
      }),
      db.maintenanceOrder.findMany({
        where: { ...tenantFilter, status: { in: ['مستلم', 'قيد العمل', 'مكتمل'] } },
        orderBy: { id: 'desc' },
        take: 10,
      }),
      db.sale.findMany({
        where: tenantFilter,
        orderBy: { id: 'desc' },
        take: 10,
        include: { items: true, customer: true },
      }),
      db.sale.findMany({
        where: {
          ...tenantFilter,
          createdAt: { gte: last30Start },
          status: 'مكتملة',
        },
        include: { items: true },
      }),
      db.customer.count({ where: tenantFilter }),
      db.customer.findMany({
        where: tenantFilter,
        select: { balance: true },
      }),
      db.supplier.findMany({
        where: tenantFilter,
        select: { balance: true },
      }),
      // FIXED: Single query for last 7 days — replaces the for-loop of 7 sequential awaits
      db.sale.findMany({
        where: {
          ...tenantFilter,
          createdAt: { gte: last7Start, lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000) },
          status: 'مكتملة',
        },
        select: {
          createdAt: true,
          total: true,
          items: { select: { price: true, cost: true, quantity: true } },
        },
      }),
    ])

    const todaySalesTotal = todaySalesAgg._sum.total ?? 0
    const todaySalesCount = todaySalesAgg._count.id
    const todayProfit = todayProfitRaw.reduce(
      (s, it) => s + (it.price - it.cost) * it.quantity,
      0
    )
    const monthSalesTotal = monthSalesAgg._sum.total ?? 0
    const monthProfit = monthProfitRaw.reduce(
      (s, it) => s + (it.price - it.cost) * it.quantity,
      0
    )
    const cashBalance = cashAgg._sum.amount ?? 0
    const lowStockCount = allProducts.filter((p) => p.quantity <= p.minQuantity).length
    const stockValueCost = allProducts.reduce((s, p) => s + p.cost * p.quantity, 0)
    const stockValuePrice = allProducts.reduce((s, p) => s + p.price * p.quantity, 0)
    const totalOutstandingDebt = customersWithBalance.reduce(
      (s, c) => s + (c.balance > 0 ? c.balance : 0),
      0
    )
    const totalSupplierDebt = suppliersWithBalance.reduce(
      (s, sup) => s + (sup.balance > 0 ? sup.balance : 0),
      0
    )

    // FIXED: Build last7DaysSales from single-query result using in-memory grouping
    const pad = (x: number) => String(x).padStart(2, '0')
    const dayMap = new Map<string, { total: number; profit: number }>()
    // Pre-populate all N days with zeros so days without sales still appear
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(todayStart)
      d.setDate(d.getDate() - i)
      const key = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
      dayMap.set(key, { total: 0, profit: 0 })
    }
    for (const sale of last7RawSales) {
      const d = sale.createdAt
      const key = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
      const slot = dayMap.get(key)
      if (slot) {
        slot.total += sale.total
        slot.profit += sale.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0)
      }
    }
    const last7DaysSales = Array.from(dayMap.entries()).map(([date, v]) => ({
      date,
      ...v,
    }))

    // top 5 selling products (by quantity, last 30 days)
    const productQty = new Map<number, { name: string; quantity: number; total: number }>()
    for (const s of last30DaysSales) {
      for (const it of s.items) {
        const cur = productQty.get(it.productId) ?? {
          name: it.name,
          quantity: 0,
          total: 0,
        }
        cur.quantity += it.quantity
        cur.total += it.price * it.quantity
        productQty.set(it.productId, cur)
      }
    }
    const topProducts = Array.from(productQty.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)

    // FIXED: reuse allProducts (single fetch) for low stock alerts
    const lowStockAlerts = allProducts
      .filter((p) => p.quantity <= p.minQuantity)
      .map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        minQuantity: p.minQuantity,
      }))

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
