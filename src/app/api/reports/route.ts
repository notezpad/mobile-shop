import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import {
  getTenantTimezone,
  localDateStrToUtcBounds,
} from '@/lib/tenantTime'
import { matchEdgeCache, putEdgeCache } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'


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

  // ⚡ v9 EDGE CACHE (2026-10-06) — «التنقل للتقارير يبان فوري»:
  // التقارير read-heavy بحت (نفس المدى بيفتح أكتر من مرة: تغيير تبويب،
  // رجوع، تحديث بعد عملية بيع) والمجمّعات كلها في Postgres أصلاً —
  // فنسخة مخزنة على الحافة لمدة 25 ثانية = الافتتاحيات المتتالية بـ ≈ صفر
  // CPU. المفتاح يشمل المدى + الفرع + tenantId (مفيش تسريب بين المحلات)،
  // والحد أقصى للقِدَم 25 ثانية + بيتصفّر بالـ TTL بعد أي بيع/مصروف —
  // يعني عملياً بيانات حديثة. (مدى التواريخ غير محدود فمفيش purge بالمفتاح
  // — الـ TTL هو ضمان الحداثة هنا، زي نهج /api/dashboard بالظبط.)
  const reportQuery = `from=${fromStr ?? ''}&to=${toStr ?? ''}&branch=${branchIdStr ?? ''}`
  const cachedReport = await matchEdgeCache('/api/reports', reportQuery, session.tenantId, '1')
  if (cachedReport) return cachedReport

  // 🕐 ROOT FIX (2026-09-30): التواريخ كانت بتتفسّر بتوقيت السيرفر (UTC على
  // Cloudflare) — يعني "تقرير النهاردة" كان بيبدأ من 2 صباحاً بتوقيت القاهرة
  // وبيسيب آخر ساعتين من اليوم الفعلي خارج الحساب (والعكس في الإغلاق).
  // دلوقتي from/to بيتحوّلوا لحدود UTC بتوقيت المحل نفسه (Tenant.timezone)،
  // وتجميع منحنى المبيعات بيتم بتوقيت المحل كمان (AT TIME ZONE). نفس نهج
  // /api/sales و /api/dashboard (شوف src/lib/tenantTime.ts).
  const tz = await getTenantTimezone(session.tenantId)
  const now = new Date()
  const from = fromStr ? localDateStrToUtcBounds(fromStr, 'start', tz) : new Date(0)
  // "to" حدّ علوي حصري (lt): نهاية يوم to بتوقيت المحل + 1ms = منتصف ليل اليوم اللي بعده
  const to = toStr
    ? new Date(localDateStrToUtcBounds(toStr, 'end', tz).getTime() + 1)
    : now

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

  const tid = session.tenantId
  const bid = branchId ?? null
  // All heavy math runs inside PostgreSQL (aggregates) — the Worker only
  // receives small result sets. Loading every sale/item/product into memory
  // was exceeding the Cloudflare CPU limit (Error 1102 / 500).
  const saleAgg = (gte: Date, lt: Date) => db.$queryRaw<{ total: number; profit: number; cnt: number }[]>`
    SELECT
      COALESCE((SELECT SUM(s."total") FROM "Sale" s WHERE s."tenantId" = ${tid} AND (${bid}::int IS NULL OR s."branchId" = ${bid}::int) AND s."status" = 'مكتملة' AND s."createdAt" >= ${gte} AND s."createdAt" < ${lt}), 0)::float8 AS total,
      COALESCE((SELECT SUM((i."price" - i."cost") * i."quantity") FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId" WHERE s."tenantId" = ${tid} AND (${bid}::int IS NULL OR s."branchId" = ${bid}::int) AND s."status" = 'مكتملة' AND s."createdAt" >= ${gte} AND s."createdAt" < ${lt}), 0)::float8 AS profit,
      (SELECT COUNT(*) FROM "Sale" s WHERE s."tenantId" = ${tid} AND (${bid}::int IS NULL OR s."branchId" = ${bid}::int) AND s."status" = 'مكتملة' AND s."createdAt" >= ${gte} AND s."createdAt" < ${lt})::int AS cnt`
  const branchWhere = branchId ? { branchId } : {}

  const [
    cur, prev, maintenanceCount, maintAgg, prevMaintAgg, finIn, finOut, cashAgg,
    stockRows, lowStockRows, expAgg, prevExpAgg, expByCat, purchAgg, custAgg, suppAgg,
    branches, trendRows, topProductRows, categoryRows, topCustomerRows, methodRows, commissionAgg,
  ] = await Promise.all([
    saleAgg(from, to),
    hasBoundedRange ? saleAgg(prevFrom, prevTo) : Promise.resolve([{ total: 0, profit: 0, cnt: 0 }]),
    db.maintenanceOrder.count({ where: { tenantId: tid, receivedAt: dateRange } }),
    db.maintenanceOrder.aggregate({ where: { tenantId: tid, deliveredAt: dateRange, status: 'مُسلَّم' }, _sum: { cost: true } }),
    hasBoundedRange
      ? db.maintenanceOrder.aggregate({ where: { tenantId: tid, deliveredAt: prevDateRange, status: 'مُسلَّم' }, _sum: { cost: true } })
      : Promise.resolve({ _sum: { cost: 0 } }),
    db.transaction.aggregate({ where: { tenantId: tid, createdAt: dateRange, kind: 'deposit' }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { tenantId: tid, createdAt: dateRange, kind: 'withdraw' }, _sum: { amount: true } }),
    db.cashEntry.aggregate({ where: { tenantId: tid }, _sum: { amount: true } }),
    db.$queryRaw<{ vcost: number; vprice: number; low: number }[]>`
      SELECT COALESCE(SUM(p."cost" * p."quantity"), 0)::float8 AS vcost,
             COALESCE(SUM(p."price" * p."quantity"), 0)::float8 AS vprice,
             COUNT(*) FILTER (WHERE p."quantity" <= p."minQuantity")::int AS low
      FROM "Product" p WHERE p."tenantId" = ${tid} AND (${bid}::int IS NULL OR p."branchId" = ${bid}::int)`,
    db.$queryRaw<{ name: string; quantity: number; minQuantity: number; unitLabel: string | null }[]>`
      SELECT p."name", p."quantity", p."minQuantity", p."unitLabel" FROM "Product" p
      WHERE p."tenantId" = ${tid} AND (${bid}::int IS NULL OR p."branchId" = ${bid}::int) AND p."quantity" <= p."minQuantity"
      ORDER BY p."quantity" ASC LIMIT 10`,
    db.expense.aggregate({ where: { tenantId: tid, ...branchWhere, createdAt: dateRange }, _sum: { amount: true } }),
    hasBoundedRange
      ? db.expense.aggregate({ where: { tenantId: tid, ...branchWhere, createdAt: prevDateRange }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: 0 } }),
    db.expense.groupBy({ by: ['category'], where: { tenantId: tid, ...branchWhere, createdAt: dateRange }, _sum: { amount: true } }),
    db.purchaseOrder.aggregate({ where: { tenantId: tid, ...branchWhere, createdAt: dateRange, status: { in: ['مكتملة', 'مرتجعة جزئياً'] } }, _sum: { total: true }, _count: { _all: true } }),
    db.customer.aggregate({ where: { tenantId: tid, balance: { gt: 0 } }, _sum: { balance: true } }),
    db.supplier.aggregate({ where: { tenantId: tid, balance: { gt: 0 } }, _sum: { balance: true } }),
    db.branch.findMany({ where: { tenantId: tid }, orderBy: [{ isMain: 'desc' }, { id: 'asc' }], select: { id: true, name: true } }),
    db.$queryRaw<{ date: string; total: number; profit: number }[]>`
      -- 🕐 التجميع اليومي بتوقيت المحل (AT TIME ZONE بيتعامل مع التوقيت الصيفي تلقائياً)
      -- ⚡ v9: subquery الربح مقيّد بنفس النافذة (JOIN على Sale) بدل GROUP BY
      -- على جدول SaleItem كله — أرخص في CPU مع نمو البيانات.
      SELECT to_char(s."createdAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
             SUM(s."total")::float8 AS total,
             COALESCE(SUM(ip.profit), 0)::float8 AS profit
      FROM "Sale" s
      LEFT JOIN (
        SELECT i."saleId", SUM((i."price" - i."cost") * i."quantity") AS profit
        FROM "SaleItem" i
        JOIN "Sale" s2 ON s2."id" = i."saleId"
        WHERE s2."tenantId" = ${tid} AND (${bid}::int IS NULL OR s2."branchId" = ${bid}::int) AND s2."status" = 'مكتملة' AND s2."createdAt" >= ${from} AND s2."createdAt" < ${to}
        GROUP BY i."saleId"
      ) ip ON ip."saleId" = s."id"
      WHERE s."tenantId" = ${tid} AND (${bid}::int IS NULL OR s."branchId" = ${bid}::int) AND s."status" = 'مكتملة' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ name: string; qty: number; total: number; profit: number; pieceLabel: string | null }[]>`
      SELECT MIN(i."name") AS name, MAX(i."pieceLabel") AS "pieceLabel", SUM(i."quantity")::float8 AS qty,
             SUM(i."price" * i."quantity")::float8 AS total,
             SUM((i."price" - i."cost") * i."quantity")::float8 AS profit
      FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
      WHERE s."tenantId" = ${tid} AND (${bid}::int IS NULL OR s."branchId" = ${bid}::int) AND s."status" = 'مكتملة' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
      GROUP BY COALESCE(i."productId", 0) ORDER BY qty DESC LIMIT 8`,
    db.$queryRaw<{ category: string; total: number }[]>`
      SELECT CASE WHEN i."productId" IS NULL THEN 'منتجات محذوفة' ELSE COALESCE(NULLIF(p."category", ''), 'بدون تصنيف') END AS category,
             SUM(i."price" * i."quantity")::float8 AS total
      FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId" LEFT JOIN "Product" p ON p."id" = i."productId"
      WHERE s."tenantId" = ${tid} AND (${bid}::int IS NULL OR s."branchId" = ${bid}::int) AND s."status" = 'مكتملة' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
      GROUP BY 1 ORDER BY total DESC LIMIT 8`,
    db.$queryRaw<{ name: string; total: number; salesCount: number }[]>`
      SELECT c."name", SUM(s."total")::float8 AS total, COUNT(*)::int AS "salesCount"
      FROM "Sale" s JOIN "Customer" c ON c."id" = s."customerId"
      WHERE s."tenantId" = ${tid} AND (${bid}::int IS NULL OR s."branchId" = ${bid}::int) AND s."status" = 'مكتملة' AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
      GROUP BY c."id", c."name" ORDER BY total DESC LIMIT 6`,
    db.transaction.groupBy({ by: ['method'], where: { tenantId: tid, createdAt: dateRange, kind: 'deposit' }, _sum: { amount: true } }),
    // 🛡️ 2026-09-30 (X7): عمولة المحفظة (إيراد فعلي للمحل) كانت مش داخلة
    // في صافي الربح — محل بيكسب 1% على كل معاملات المحفظة كان ربحه بيطلع أقل من الحقيقي.
    db.cashEntry.aggregate({ where: { tenantId: tid, source: 'commission', createdAt: dateRange }, _sum: { amount: true } }),
  ])

  const n = (v: unknown) => Number(v ?? 0)
  const totalSales = n(cur[0]?.total)
  const totalProfit = n(cur[0]?.profit)
  const salesCount = n(cur[0]?.cnt)
  const avgOrderValue = salesCount > 0 ? totalSales / salesCount : 0
  const maintenanceRevenue = n(maintAgg._sum.cost)
  const totalExpenses = n(expAgg._sum.amount)
  // 🛡️ 2026-09-30 (X7): عمولة المحفظة داخلة في صافي الربح (فقط لما مفيش فلترة فرع — العمولة مش مربوطة بفرع).
  const commissionRevenue = bid === null ? n(commissionAgg._sum.amount) : 0
  const netProfit = totalProfit + maintenanceRevenue - totalExpenses + commissionRevenue

  const prevTotalSales = n(prev[0]?.total)
  const prevTotalProfit = n(prev[0]?.profit)
  const prevSalesCount = n(prev[0]?.cnt)
  const prevNetProfit = prevTotalProfit + n(prevMaintAgg._sum.cost) - n(prevExpAgg._sum.amount)

  const financeIn = n(finIn._sum.amount)
  const financeOut = n(finOut._sum.amount)
  const cashBalance = n(cashAgg._sum.amount)
  const stockValueCost = n(stockRows[0]?.vcost)
  const stockValuePrice = n(stockRows[0]?.vprice)
  const lowStockCount = n(stockRows[0]?.low)
  // 🛡️ 2026-09-29: a partially-returned order stays in the purchases total, net
  // of the value already sent back to the supplier (fully returned orders are
  // excluded entirely, as before).
  const partialReturnsAgg = await db.purchaseReturn.aggregate({
    where: {
      tenantId: tid,
      purchaseOrder: { ...branchWhere, createdAt: dateRange, status: 'مرتجعة جزئياً' },
    },
    _sum: { total: true },
  })
  const totalPurchases = Math.max(0, n(purchAgg._sum.total) - n(partialReturnsAgg._sum.total))
  const purchasesCount = purchAgg._count._all
  const customersReceivable = n(custAgg._sum.balance)
  const suppliersPayable = n(suppAgg._sum.balance)

  const salesTrend = trendRows.map((r) => ({ date: r.date, total: n(r.total), profit: n(r.profit), unitLabel: r.pieceLabel ?? null }))
  const topProducts = topProductRows.map((r) => ({ name: r.name, qty: n(r.qty), total: n(r.total), profit: n(r.profit) }))
  const categoryBreakdown = categoryRows.map((r) => ({ category: r.category, total: n(r.total) }))
  const topCustomers = topCustomerRows.map((r) => ({ name: r.name, total: n(r.total), salesCount: n(r.salesCount) }))
  const paymentMethods = methodRows
    .map((r) => ({ method: r.method, amount: n(r._sum.amount) }))
    .sort((a, b) => b.amount - a.amount)
  const expensesByCategory = expByCat
    .map((r) => ({ category: r.category, amount: n(r._sum.amount) }))
    .sort((a, b) => b.amount - a.amount)

  const pct = (cur: number, prev: number): number | null => {
    if (!hasBoundedRange) return null
    if (prev === 0) return cur === 0 ? 0 : 100
    return ((cur - prev) / Math.abs(prev)) * 100
  }

  const res = NextResponse.json({
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
    maintenanceCount,
    totalExpenses,
    netProfit,

    changes: {
      totalSales: pct(totalSales, prevTotalSales),
      totalProfit: pct(totalProfit, prevTotalProfit),
      salesCount: pct(salesCount, prevSalesCount),
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
    lowStockCount,
    lowStockProducts: lowStockRows.map((p) => ({ name: p.name, quantity: n(p.quantity), minQuantity: n(p.minQuantity), unitLabel: p.unitLabel ?? null })),

    totalPurchases,
    purchasesCount,
  })

  // ⚡ v9: خزّن نسخة على الحافة (clone — الرد الأصلي يكمل للمتصفح)
  await putEdgeCache(res.clone(), '/api/reports', reportQuery, session.tenantId, 25, '1')
  return res
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
