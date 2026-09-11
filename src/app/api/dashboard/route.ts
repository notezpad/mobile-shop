import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

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

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  return withDb(async () => {
    const tenantFilter = { tenantId: session.tenantId }
    const now = new Date()
    const todayStart = startOfDay(now)
    const monthStart = startOfMonth(now)
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const last7Start = new Date(todayStart)
    last7Start.setDate(last7Start.getDate() - 6) // 7 days back including today

    const [
      todaySales,
      monthSales,
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
      db.sale.findMany({
        where: { ...tenantFilter, createdAt: { gte: todayStart }, status: 'مكتملة' },
        include: { items: true },
      }),
      db.sale.findMany({
        where: { ...tenantFilter, createdAt: { gte: monthStart }, status: 'مكتملة' },
        include: { items: true },
      }),
      db.cashEntry.aggregate({
        where: tenantFilter,
        _sum: { amount: true },
      }),
      // FIXED: single products fetch — used for lowStockCount, stockValue, AND lowStockAlerts
      db.product.findMany({ where: tenantFilter }),
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

    const todaySalesTotal = todaySales.reduce((s, x) => s + x.total, 0)
    const todayProfit = todaySales.reduce(
      (s, x) =>
        s + x.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0),
      0
    )
    const monthSalesTotal = monthSales.reduce((s, x) => s + x.total, 0)
    const monthProfit = monthSales.reduce(
      (s, x) =>
        s + x.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0),
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
    // Pre-populate all 7 days with zeros so days without sales still appear
    for (let i = 6; i >= 0; i--) {
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

    return NextResponse.json({
      todaySales: todaySalesTotal,
      todayProfit,
      cashBalance,
      lowStockCount,
      todaySalesCount: todaySales.length,
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
