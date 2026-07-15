import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

  const tenantFilter = { tenantId: session.tenantId }
  const now = new Date()
  const todayStart = startOfDay(now)
  const monthStart = startOfMonth(now)

  const [
    todaySales,
    monthSales,
    cashAgg,
    allProducts,
    lowStockProducts,
    activeMaintenance,
    activeMaintenanceOrders,
    last10SalesRaw,
    last30DaysSales,
    customersCount,
    customersWithBalance,
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
    db.product.findMany({ where: tenantFilter }),
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
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        status: 'مكتملة',
      },
      include: { items: true },
    }),
    db.customer.count({ where: tenantFilter }),
    db.customer.findMany({
      where: tenantFilter,
      select: { balance: true },
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
  const stockValueCost = allProducts.reduce(
    (s, p) => s + p.cost * p.quantity,
    0
  )
  const stockValuePrice = allProducts.reduce(
    (s, p) => s + p.price * p.quantity,
    0
  )
  // Total outstanding debt = sum of all positive customer balances in the tenant
  const totalOutstandingDebt = customersWithBalance.reduce(
    (s, c) => s + (c.balance > 0 ? c.balance : 0),
    0
  )

  // last 7 days sales
  const last7DaysSales: Array<{ date: string; total: number; profit: number }> = []
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayStart)
    dayStart.setDate(dayStart.getDate() - i)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const daySales = await db.sale.findMany({
      where: {
        ...tenantFilter,
        createdAt: { gte: dayStart, lt: dayEnd },
        status: 'مكتملة',
      },
      include: { items: true },
    })
    const total = daySales.reduce((s, x) => s + x.total, 0)
    const profit = daySales.reduce(
      (s, x) =>
        s + x.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0),
      0
    )
    const pad = (x: number) => String(x).padStart(2, '0')
    last7DaysSales.push({
      date: `${pad(dayStart.getDate())}/${pad(dayStart.getMonth() + 1)}`,
      total,
      profit,
    })
  }

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

  // low stock alerts
  const lowStockAlerts = lowStockProducts
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
    // Top row: 4 stat cards
    todaySales: todaySalesTotal,
    todayProfit,
    cashBalance,
    lowStockCount,
    todaySalesCount: todaySales.length,
    // Second row: 4 more stats
    monthSales: monthSalesTotal,
    monthProfit,
    customersCount,
    activeMaintenance,
    // Customer debt
    totalOutstandingDebt,
    // Stock value
    stockValueCost,
    stockValuePrice,
    // Sales chart
    last7DaysSales,
    // Top 5 selling products
    topProducts,
    // Last 10 sales
    last10Sales,
    // Low stock alerts
    lowStockProducts: lowStockAlerts,
    // Active maintenance orders
    activeMaintenanceOrders: activeMaintenanceList,
  })
}
