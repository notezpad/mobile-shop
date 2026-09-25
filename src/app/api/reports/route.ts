import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

function ymd(d: Date) {
  const x = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${x(d.getMonth() + 1)}-${x(d.getDate())}`
}

/**
 * PERF FIX (2026-09-25): Reports route was causing Error 1102 (Worker exceeded
 * resource limits) because it loaded ALL sales with ALL items and ALL customers
 * into Worker memory at once. For a shop with 1000+ sales × 5+ items each,
 * this easily exceeded Cloudflare Workers' 128 MB memory cap.
 *
 * Changes:
 *  1. db.sale.aggregate() for totals → no row data loaded at all.
 *  2. db.saleItem.findMany() with `select` (6 cols) instead of loading full
 *     sales with include:{items, customer} (~20+ cols per row × 2 tables).
 *  3. db.sale.findMany() with narrow `select` (id, total, createdAt,
 *     customerId, customer.name) for trend + top-customers calculation.
 *  4. db.product.findMany() with `select` (7 cols) instead of all columns.
 *  5. Previous-period totals via aggregate instead of findMany.
 *
 * Net result: memory per reports request drops from O(sales × items) rows
 * to O(items) rows (with far fewer bytes per row), eliminating the 1102.
 */

async function __GET(req: NextRequest) {
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

  const hasBoundedRange = Boolean(fromStr)
  const rangeMs = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - rangeMs)
  const prevTo = new Date(from.getTime())
  const prevDateRange = { gte: prevFrom, lt: prevTo }

  // ── Shared "where" objects to avoid repetition ──────────────────────────
  const saleWhere = { ...tenantFilter, createdAt: dateRange, status: 'مكتملة' }
  const prevSaleWhere = { ...tenantFilter, createdAt: prevDateRange, status: 'مكتملة' }

  const [
    // ── CURRENT PERIOD ───────────────────────────────────────────────────
    // 1. Aggregate totals — no rows loaded into memory
    salesAgg,
    // 2. SaleItems with only the 6 columns we actually use
    saleItems,
    // 3. Sales with minimal columns for trend graph + top customers
    salesSlim,
    // ── PREVIOUS PERIOD ──────────────────────────────────────────────────
    // 4. Previous aggregate (skipped when no bounded range)
    prevSalesAgg,
    // 5. Previous items for profit comparison
    prevSaleItems,
    // ── MAINTENANCE ──────────────────────────────────────────────────────
    maintenance,
    maintenanceDelivered,
    prevMaintenanceDelivered,
    // ── FINANCE / CASH ───────────────────────────────────────────────────
    transactionsIn,
    transactionsOut,
    cashAgg,
    // ── PRODUCTS (stock) — narrow select, only cols needed ───────────────
    allProducts,
    // ── EXPENSES ─────────────────────────────────────────────────────────
    expenses,
    prevExpenses,
    // ── PURCHASES ────────────────────────────────────────────────────────
    purchaseOrders,
    // ── RECEIVABLES / PAYABLES ───────────────────────────────────────────
    customersWithBalance,
    suppliersWithBalance,
    // ── BRANCHES (for filter UI) ─────────────────────────────────────────
    branches,
  ] = await Promise.all([
    // ── 1. Current period aggregate ──────────────────────────────────────
    db.sale.aggregate({
      where: saleWhere,
      _sum: { total: true },
      _count: { id: true },
    }),

    // ── 2. Current period items (6 cols) ─────────────────────────────────
    db.saleItem.findMany({
      where: { sale: saleWhere },
      select: {
        saleId:    true,
        productId: true,
        name:      true,
        price:     true,
        cost:      true,
        quantity:  true,
      },
    }),

    // ── 3. Sales minimal (for trend + customers) ─────────────────────────
    db.sale.findMany({
      where: saleWhere,
      select: {
        id:         true,
        total:      true,
        createdAt:  true,
        customerId: true,
        customer:   { select: { name: true } },
      },
    }),

    // ── 4. Previous period aggregate ─────────────────────────────────────
    hasBoundedRange
      ? db.sale.aggregate({
          where: prevSaleWhere,
          _sum: { total: true },
          _count: { id: true },
        })
      : Promise.resolve(null),

    // ── 5. Previous period items (for profit) ────────────────────────────
    hasBoundedRange
      ? db.saleItem.findMany({
          where: { sale: prevSaleWhere },
          select: { price: true, cost: true, quantity: true },
        })
      : Promise.resolve([]),

    // ── Maintenance ──────────────────────────────────────────────────────
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

    // ── Finance ──────────────────────────────────────────────────────────
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

    // ── Products (stock) — 7 cols only ───────────────────────────────────
    db.product.findMany({
      where: tenantFilter as any,
      select: {
        id:          true,
        name:        true,
        category:    true,
        cost:        true,
        price:       true,
        quantity:    true,
        minQuantity: true,
      },
    }),

    // ── Expenses ─────────────────────────────────────────────────────────
    db.expense.findMany({ where: { ...tenantFilter, createdAt: dateRange } }),
    hasBoundedRange
      ? db.expense.findMany({ where: { ...tenantFilter, createdAt: prevDateRange } })
      : Promise.resolve([]),

    // ── Purchases ────────────────────────────────────────────────────────
    db.purchaseOrder.findMany({
      where: { ...tenantFilter, createdAt: dateRange, status: 'مكتملة' },
    }),

    // ── Receivables / Payables ───────────────────────────────────────────
    db.customer.findMany({
      where: { tenantId: session.tenantId, balance: { gt: 0 } },
      select: { balance: true },
    }),
    db.supplier.findMany({
      where: { tenantId: session.tenantId, balance: { gt: 0 } },
      select: { balance: true },
    }),

    // ── Branches ─────────────────────────────────────────────────────────
    db.branch.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  // ── Core totals (from aggregates — no loops over all rows) ──────────────
  const totalSales  = salesAgg._sum.total ?? 0
  const salesCount  = salesAgg._count.id
  const avgOrderValue = salesCount > 0 ? totalSales / salesCount : 0

  // Profit comes from items: (price − cost) × qty
  const totalProfit = saleItems.reduce(
    (s, it) => s + (it.price - it.cost) * it.quantity,
    0
  )

  const maintenanceRevenue = maintenanceDelivered.reduce((s, x) => s + x.cost, 0)
  const totalExpenses       = expenses.reduce((s, x) => s + x.amount, 0)
  const netProfit           = totalProfit + maintenanceRevenue - totalExpenses

  // ── Previous period ──────────────────────────────────────────────────────
  const prevTotalSales  = prevSalesAgg?._sum.total ?? 0
  const prevSalesCount  = prevSalesAgg?._count.id ?? 0
  const prevTotalProfit = (prevSaleItems as { price: number; cost: number; quantity: number }[])
    .reduce((s, it) => s + (it.price - it.cost) * it.quantity, 0)
  const prevMaintenanceRevenue = prevMaintenanceDelivered.reduce((s, x) => s + x.cost, 0)
  const prevTotalExpenses      = prevExpenses.reduce((s, x) => s + x.amount, 0)
  const prevNetProfit          = prevTotalProfit + prevMaintenanceRevenue - prevTotalExpenses

  // ── Finance ──────────────────────────────────────────────────────────────
  const financeIn   = transactionsIn.reduce((s, x) => s + x.amount, 0)
  const financeOut  = transactionsOut.reduce((s, x) => s + x.amount, 0)
  const cashBalance = cashAgg._sum.amount ?? 0

  // ── Stock ────────────────────────────────────────────────────────────────
  const stockValueCost  = allProducts.reduce((s, p) => s + p.cost  * p.quantity, 0)
  const stockValuePrice = allProducts.reduce((s, p) => s + p.price * p.quantity, 0)
  const lowStock = allProducts
    .filter((p) => p.quantity <= p.minQuantity)
    .sort((a, b) => a.quantity - b.quantity)

  // ── Purchases ────────────────────────────────────────────────────────────
  const totalPurchases  = purchaseOrders.reduce((s, x) => s + x.total, 0)
  const purchasesCount  = purchaseOrders.length

  // ── Receivables ──────────────────────────────────────────────────────────
  const customersReceivable = customersWithBalance.reduce((s, c) => s + c.balance, 0)
  const suppliersPayable    = suppliersWithBalance.reduce((s, x) => s + x.balance, 0)

  // ── Sales trend (per day) ────────────────────────────────────────────────
  // Build a saleId → createdAt lookup from the slim sales list
  const saleCreatedAtMap = new Map<number, Date>(salesSlim.map((s) => [s.id, s.createdAt]))

  // First pass: bucket sale totals by date
  const trendMap = new Map<string, { total: number; profit: number }>()
  for (const s of salesSlim) {
    const key = ymd(s.createdAt)
    const cur = trendMap.get(key) ?? { total: 0, profit: 0 }
    cur.total += s.total
    trendMap.set(key, cur)
  }
  // Second pass: add per-item profit to the correct date bucket
  for (const it of saleItems) {
    const createdAt = saleCreatedAtMap.get(it.saleId)
    if (!createdAt) continue
    const key = ymd(createdAt)
    const cur = trendMap.get(key)
    if (cur) cur.profit += (it.price - it.cost) * it.quantity
  }
  const salesTrend = Array.from(trendMap.entries())
    .map(([date, v]) => ({ date, total: v.total, profit: v.profit }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── Top products ─────────────────────────────────────────────────────────
  const productAgg = new Map<
    number,
    { name: string; qty: number; total: number; profit: number }
  >()
  for (const it of saleItems) {
    const key = it.productId ?? 0
    const cur = productAgg.get(key) ?? { name: it.name, qty: 0, total: 0, profit: 0 }
    cur.qty    += it.quantity
    cur.total  += it.price * it.quantity
    cur.profit += (it.price - it.cost) * it.quantity
    productAgg.set(key, cur)
  }
  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8)

  // ── Category breakdown ───────────────────────────────────────────────────
  const productCategoryById = new Map<number, string>(
    allProducts.map((p) => [p.id, p.category || 'بدون تصنيف'])
  )
  const categoryAgg = new Map<string, number>()
  for (const it of saleItems) {
    const cat =
      it.productId == null
        ? 'منتجات محذوفة'
        : (productCategoryById.get(it.productId) ?? 'بدون تصنيف')
    categoryAgg.set(cat, (categoryAgg.get(cat) ?? 0) + it.price * it.quantity)
  }
  const categoryBreakdown = Array.from(categoryAgg.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // ── Top customers ────────────────────────────────────────────────────────
  const customerAgg = new Map<string, { name: string; total: number; salesCount: number }>()
  for (const s of salesSlim) {
    const name = s.customer?.name ?? 'بدون عميل'
    const key  = s.customerId ? String(s.customerId) : `guest-${name}`
    const cur  = customerAgg.get(key) ?? { name, total: 0, salesCount: 0 }
    cur.total      += s.total
    cur.salesCount += 1
    customerAgg.set(key, cur)
  }
  const topCustomers = Array.from(customerAgg.values())
    .filter((c) => c.name !== 'بدون عميل')
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  // ── Payment methods ──────────────────────────────────────────────────────
  const methodAgg = new Map<string, number>()
  for (const t of transactionsIn) {
    methodAgg.set(t.method, (methodAgg.get(t.method) ?? 0) + t.amount)
  }
  const paymentMethods = Array.from(methodAgg.entries())
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount)

  // ── Expenses by category ─────────────────────────────────────────────────
  const expenseAgg = new Map<string, number>()
  for (const e of expenses) {
    expenseAgg.set(e.category, (expenseAgg.get(e.category) ?? 0) + e.amount)
  }
  const expensesByCategory = Array.from(expenseAgg.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  // ── % change helpers ─────────────────────────────────────────────────────
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
      totalSales:  pct(totalSales,  prevTotalSales),
      totalProfit: pct(totalProfit, prevTotalProfit),
      salesCount:  pct(salesCount,  prevSalesCount),
      netProfit:   pct(netProfit,   prevNetProfit),
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
      name:        p.name,
      quantity:    p.quantity,
      minQuantity: p.minQuantity,
    })),

    totalPurchases,
    purchasesCount,
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
