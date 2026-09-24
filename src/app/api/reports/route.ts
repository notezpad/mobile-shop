import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

function ymd(d: Date) {
  const x = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${x(d.getMonth() + 1)}-${x(d.getDate())}`
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'reports') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  const branchIdStr = searchParams.get('branchId')
  const branchId = branchIdStr ? Number(branchIdStr) : null

  const now = new Date()
  const from = fromStr ? new Date(fromStr) : new Date(0)
  const to = toStr ? new Date(toStr) : now
  if (toStr) to.setDate(to.getDate() + 1) // include the full "to" day

  const dateRange = { gte: from, lt: to }
  const tenantFilter: Record<string, unknown> = { tenantId: session.tenantId }
  if (branchId) tenantFilter.branchId = branchId

  // Previous period of equal length, immediately before `from` — only meaningful
  // when the person actually picked a bounded range (otherwise "previous" of
  // all-time is undefined, so we skip the comparison on the frontend).
  const hasBoundedRange = Boolean(fromStr)
  const rangeMs = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - rangeMs)
  const prevTo = new Date(from.getTime())
  const prevDateRange = { gte: prevFrom, lt: prevTo }

  const [
    sales,
    prevSales,
    maintenance,
    maintenanceDelivered,
    prevMaintenanceDelivered,
    transactionsIn,
    transactionsOut,
    cashAgg,
    allProducts,
    expenses,
    prevExpenses,
    purchaseOrders,
    customersWithBalance,
    suppliersWithBalance,
    branches,
  ] = await Promise.all([
    db.sale.findMany({
      where: { ...tenantFilter, createdAt: dateRange, status: 'مكتملة' },
      include: { items: true, customer: true },
    }),
    hasBoundedRange
      ? db.sale.findMany({
          where: { ...tenantFilter, createdAt: prevDateRange, status: 'مكتملة' },
          include: { items: true },
        })
      : Promise.resolve([]),
    db.maintenanceOrder.findMany({
      where: { tenantId: session.tenantId, receivedAt: dateRange },
    }),
    db.maintenanceOrder.findMany({
      where: { tenantId: session.tenantId, deliveredAt: dateRange, status: 'مُسلَّم' },
    }),
    hasBoundedRange
      ? db.maintenanceOrder.findMany({
          where: { tenantId: session.tenantId, deliveredAt: prevDateRange, status: 'مُسلَّم' },
        })
      : Promise.resolve([]),
    db.transaction.findMany({
      where: { tenantId: session.tenantId, createdAt: dateRange, kind: 'deposit' },
    }),
    db.transaction.findMany({
      where: { tenantId: session.tenantId, createdAt: dateRange, kind: 'withdraw' },
    }),
    db.cashEntry.aggregate({
      where: { tenantId: session.tenantId },
      _sum: { amount: true },
    }),
    db.product.findMany({ where: tenantFilter }),
    db.expense.findMany({ where: { ...tenantFilter, createdAt: dateRange } }),
    hasBoundedRange
      ? db.expense.findMany({ where: { ...tenantFilter, createdAt: prevDateRange } })
      : Promise.resolve([]),
    db.purchaseOrder.findMany({
      where: { ...tenantFilter, createdAt: dateRange, status: 'مكتملة' },
    }),
    db.customer.findMany({
      where: { tenantId: session.tenantId, balance: { gt: 0 } },
      select: { balance: true },
    }),
    db.supplier.findMany({
      where: { tenantId: session.tenantId, balance: { gt: 0 } },
      select: { balance: true },
    }),
    db.branch.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  // ---------- core totals ----------
  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  const totalProfit = sales.reduce(
    (s, x) => s + x.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0),
    0
  )
  const salesCount = sales.length
  const avgOrderValue = salesCount > 0 ? totalSales / salesCount : 0
  const maintenanceRevenue = maintenanceDelivered.reduce((s, x) => s + x.cost, 0)
  const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0)
  const netProfit = totalProfit + maintenanceRevenue - totalExpenses

  const prevTotalSales = prevSales.reduce((s, x) => s + x.total, 0)
  const prevTotalProfit = prevSales.reduce(
    (s, x) => s + x.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0),
    0
  )
  const prevMaintenanceRevenue = prevMaintenanceDelivered.reduce((s, x) => s + x.cost, 0)
  const prevTotalExpenses = prevExpenses.reduce((s, x) => s + x.amount, 0)
  const prevNetProfit = prevTotalProfit + prevMaintenanceRevenue - prevTotalExpenses

  const financeIn = transactionsIn.reduce((s, x) => s + x.amount, 0)
  const financeOut = transactionsOut.reduce((s, x) => s + x.amount, 0)
  const cashBalance = cashAgg._sum.amount ?? 0

  const stockValueCost = allProducts.reduce((s, p) => s + p.cost * p.quantity, 0)
  const stockValuePrice = allProducts.reduce((s, p) => s + p.price * p.quantity, 0)
  const lowStock = allProducts
    .filter((p) => p.quantity <= p.minQuantity)
    .sort((a, b) => a.quantity - b.quantity)

  const totalPurchases = purchaseOrders.reduce((s, x) => s + x.total, 0)
  const purchasesCount = purchaseOrders.length

  const customersReceivable = customersWithBalance.reduce((s, c) => s + c.balance, 0)
  const suppliersPayable = suppliersWithBalance.reduce((s, x) => s + x.balance, 0)

  // ---------- sales trend (grouped by day) ----------
  const trendMap = new Map<string, { total: number; profit: number }>()
  for (const s of sales) {
    const key = ymd(s.createdAt)
    const cur = trendMap.get(key) ?? { total: 0, profit: 0 }
    cur.total += s.total
    cur.profit += s.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0)
    trendMap.set(key, cur)
  }
  const salesTrend = Array.from(trendMap.entries())
    .map(([date, v]) => ({ date, total: v.total, profit: v.profit }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ---------- top products ----------
  // 🛡️ 2026-09-15 (v3): SaleItem.productId is now nullable (Int?) because
  // products can be hard-deleted via mode=archive without losing sale
  // history. When productId is null (the product was deleted), we use a
  // special bucket key `0` so the snapshot name still appears in reports.
  const productAgg = new Map<
    number,
    { name: string; qty: number; total: number; profit: number }
  >()
  for (const s of sales) {
    for (const it of s.items) {
      // 🛡️ Use 0 as the bucket key for items whose product was deleted
      // (productId is null after archive delete). The snapshot name stays.
      const bucketKey = it.productId ?? 0
      const cur = productAgg.get(bucketKey) ?? {
        name: it.name,
        qty: 0,
        total: 0,
        profit: 0,
      }
      cur.qty += it.quantity
      cur.total += it.price * it.quantity
      cur.profit += (it.price - it.cost) * it.quantity
      productAgg.set(bucketKey, cur)
    }
  }
  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8)

  // ---------- category breakdown ----------
  // 🛡️ 2026-09-15 (v3): For items with productId = null (deleted products),
  // categorize them as 'منتجات محذوفة' instead of lumping them with
  // un-categorized products.
  const productCategoryById = new Map<number, string>(
    allProducts.map((p) => [p.id, p.category || 'بدون تصنيف'])
  )
  const categoryAgg = new Map<string, number>()
  for (const s of sales) {
    for (const it of s.items) {
      // 🛡️ Deleted products → 'منتجات محذوفة' category
      const cat = it.productId == null
        ? 'منتجات محذوفة'
        : (productCategoryById.get(it.productId) ?? 'بدون تصنيف')
      categoryAgg.set(cat, (categoryAgg.get(cat) ?? 0) + it.price * it.quantity)
    }
  }
  const categoryBreakdown = Array.from(categoryAgg.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // ---------- top customers ----------
  const customerAgg = new Map<string, { name: string; total: number; salesCount: number }>()
  for (const s of sales) {
    const name = s.customer?.name ?? 'بدون عميل'
    const key = s.customerId ? String(s.customerId) : `guest-${name}`
    const cur = customerAgg.get(key) ?? { name, total: 0, salesCount: 0 }
    cur.total += s.total
    cur.salesCount += 1
    customerAgg.set(key, cur)
  }
  const topCustomers = Array.from(customerAgg.values())
    .filter((c) => c.name !== 'بدون عميل')
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  // ---------- payment methods (deposits only — how money came in) ----------
  const methodAgg = new Map<string, number>()
  for (const t of transactionsIn) {
    methodAgg.set(t.method, (methodAgg.get(t.method) ?? 0) + t.amount)
  }
  const paymentMethods = Array.from(methodAgg.entries())
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount)

  // ---------- expenses by category ----------
  const expenseAgg = new Map<string, number>()
  for (const e of expenses) {
    expenseAgg.set(e.category, (expenseAgg.get(e.category) ?? 0) + e.amount)
  }
  const expensesByCategory = Array.from(expenseAgg.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  const pct = (cur: number, prev: number): number | null => {
    if (!hasBoundedRange) return null
    if (prev === 0) return cur === 0 ? 0 : 100
    return ((cur - prev) / Math.abs(prev)) * 100
  }

  return NextResponse.json({
    from: fromStr,
    to: toStr,
    branchId,
    branches,

    totalSales,
    totalProfit,
    profitMargin: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
    salesCount,
    avgOrderValue,
    maintenanceRevenue,
    maintenanceCount: maintenance.length,
    totalExpenses,
    netProfit,

    changes: {
      totalSales: pct(totalSales, prevTotalSales),
      totalProfit: pct(totalProfit, prevTotalProfit),
      salesCount: pct(salesCount, prevSales.length),
      netProfit: pct(netProfit, prevNetProfit),
    },

    salesTrend,
    topProducts,
    categoryBreakdown,
    topCustomers,
    paymentMethods,

    financeIn,
    financeOut,
    cashBalance,
    expensesByCategory,
    customersReceivable,
    suppliersPayable,

    stockValueCost,
    stockValuePrice,
    lowStockCount: lowStock.length,
    lowStockProducts: lowStock.slice(0, 10).map((p) => ({
      name: p.name,
      quantity: p.quantity,
      minQuantity: p.minQuantity,
    })),

    totalPurchases,
    purchasesCount,
  })
}
