import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  const now = new Date()
  const from = fromStr ? new Date(fromStr) : new Date(0)
  const to = toStr ? new Date(toStr) : now
  if (toStr) {
    to.setDate(to.getDate() + 1) // include full "to" day
  }

  const dateRange = { gte: from, lt: to }
  const tenantFilter = { tenantId: session.tenantId }

  const [
    sales,
    completedSalesCount,
    maintenance,
    maintenanceDelivered,
    transactionsIn,
    transactionsOut,
    cashAgg,
    allProducts,
  ] = await Promise.all([
    db.sale.findMany({
      where: { ...tenantFilter, createdAt: dateRange, status: 'مكتملة' },
      include: { items: true },
    }),
    db.sale.count({
      where: { ...tenantFilter, createdAt: dateRange, status: 'مكتملة' },
    }),
    db.maintenanceOrder.findMany({
      where: { ...tenantFilter, receivedAt: dateRange },
    }),
    db.maintenanceOrder.findMany({
      where: { ...tenantFilter, deliveredAt: dateRange, status: 'مُسلَّم' },
    }),
    db.transaction.findMany({
      where: { ...tenantFilter, createdAt: dateRange, kind: 'deposit' },
    }),
    db.transaction.findMany({
      where: { ...tenantFilter, createdAt: dateRange, kind: 'withdraw' },
    }),
    db.cashEntry.aggregate({
      where: tenantFilter,
      _sum: { amount: true },
    }),
    db.product.findMany({ where: tenantFilter }),
  ])

  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  const totalProfit = sales.reduce(
    (s, x) =>
      s +
      x.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0),
    0
  )
  const maintenanceRevenue = maintenanceDelivered.reduce(
    (s, x) => s + x.cost,
    0
  )
  const financeIn = transactionsIn.reduce((s, x) => s + x.amount, 0)
  const financeOut = transactionsOut.reduce((s, x) => s + x.amount, 0)
  const cashBalance = cashAgg._sum.amount ?? 0
  const stockValueCost = allProducts.reduce(
    (s, p) => s + p.cost * p.quantity,
    0
  )
  const stockValuePrice = allProducts.reduce(
    (s, p) => s + p.price * p.quantity,
    0
  )
  const lowStockCount = allProducts.filter((p) => p.quantity <= p.minQuantity).length

  // top 5 products by quantity sold
  const productQty = new Map<number, { name: string; qty: number; total: number }>()
  for (const s of sales) {
    for (const it of s.items) {
      const cur = productQty.get(it.productId) ?? {
        name: it.name,
        qty: 0,
        total: 0,
      }
      cur.qty += it.quantity
      cur.total += it.price * it.quantity
      productQty.set(it.productId, cur)
    }
  }
  const topProducts = Array.from(productQty.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  return NextResponse.json({
    from: fromStr,
    to: toStr,
    totalSales,
    totalProfit,
    salesCount: completedSalesCount,
    maintenanceCount: maintenance.length,
    maintenanceRevenue,
    financeIn,
    financeOut,
    cashBalance,
    lowStockCount,
    stockValueCost,
    stockValuePrice,
    topProducts,
  })
}
