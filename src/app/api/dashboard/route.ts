import { NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { checkLowStockAndNotify, checkExpiringSubscriptions } from '@/lib/notifications'
import { getTenantTimezone, startOfDayInTz, startOfMonthInTz, dateStrInTz } from '@/lib/tenantTime'
import { matchEdgeCache, putEdgeCache } from '@/lib/edgeCache'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): الداشبورد كان أثقل endpoint في النظام
 * (15+ استعلام Prisma + إنشاء عميل لكل طلب). الآن:
 *   - كل الأرقام المجمّعة (مبيعات اليوم/الشهر، أرباح، خزنة، ديون، مخزون،
 *     صيانة، عملاء) في **استعلام واحد** بـ scalar subqueries — round trip واحد.
 *   - القوائم الخفيفة (آخر 10 فواتير، الصيانة النشطة، نواقص المخزون،
 *     الرسم البياني، الفواتير المتأخرة) استعلامات SQL بسيطة متوازية.
 *   - نفس حساب التوقيت المحلي للمحل، ونفس شكل الرد JSON بالظبط،
 *     ونفس كاش الحافة (45 ثانية) ومفتاحه.
 */

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

  // ⚡ EDGE CACHE — نفس المفاتيح القديمة (45 ثانية لكل tenant + رؤية الأرباح)
  // 🔒 RBAC: هل المستخدم مسموحله يشوف الأرباح؟
  const canViewProfits = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.canViewProfits === true
  const dashQuery = `days=${chartDays}&p=${canViewProfits ? '1' : '0'}`
  const cachedDashboard = await matchEdgeCache('/api/dashboard', dashQuery, session.tenantId, 2)
  if (cachedDashboard) return cachedDashboard

  return withSql(async (sql) => {
    const now = new Date()
    // 🕐 ROOT FIX (2026-09-27): "today"/"this month" = the shop's own local day
    // (Tenant.timezone) — DST-safe, consistent for all employees.
    const tz = await getTenantTimezone(session.tenantId)
    const todayStart = startOfDayInTz(now, tz)
    const monthStart = startOfMonthInTz(now, tz)
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const lastNStart = startOfDayInTz(new Date(now.getTime() - (chartDays - 1) * 24 * 60 * 60 * 1000), tz)

    const tid = session.tenantId
    const chartEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    // ── الاستعلام المجمع: كل الأرقام في round trip واحد ──
    type AggRow = {
      today_total: number; today_cnt: number; today_profit: number
      month_total: number; month_cnt: number; month_profit: number
      cash_balance: number; customers_count: number
      cust_debt: number; supp_debt: number
      maint_count: number
      vcost: number; vprice: number; low_count: number
    }
    const aggRows = await sql<AggRow[]>`
      SELECT
        (SELECT COALESCE(SUM("total"), 0)::float8 FROM "Sale"
          WHERE "tenantId" = ${tid} AND "status" = 'مكتملة' AND "createdAt" >= ${todayStart}) AS today_total,
        (SELECT COUNT(*)::int FROM "Sale"
          WHERE "tenantId" = ${tid} AND "status" = 'مكتملة' AND "createdAt" >= ${todayStart}) AS today_cnt,
        (SELECT COALESCE(SUM((i."price" - i."cost") * i."quantity"), 0)::float8
          FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
          WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${todayStart}) AS today_profit,
        (SELECT COALESCE(SUM("total"), 0)::float8 FROM "Sale"
          WHERE "tenantId" = ${tid} AND "status" = 'مكتملة' AND "createdAt" >= ${monthStart}) AS month_total,
        (SELECT COUNT(*)::int FROM "Sale"
          WHERE "tenantId" = ${tid} AND "status" = 'مكتملة' AND "createdAt" >= ${monthStart}) AS month_cnt,
        (SELECT COALESCE(SUM((i."price" - i."cost") * i."quantity"), 0)::float8
          FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
          WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${monthStart}) AS month_profit,
        (SELECT COALESCE(SUM("amount"), 0)::float8 FROM "CashEntry" WHERE "tenantId" = ${tid}) AS cash_balance,
        (SELECT COUNT(*)::int FROM "Customer" WHERE "tenantId" = ${tid}) AS customers_count,
        (SELECT COALESCE(SUM("balance"), 0)::float8 FROM "Customer" WHERE "tenantId" = ${tid} AND "balance" > 0) AS cust_debt,
        (SELECT COALESCE(SUM("balance"), 0)::float8 FROM "Supplier" WHERE "tenantId" = ${tid} AND "balance" > 0) AS supp_debt,
        (SELECT COUNT(*)::int FROM "MaintenanceOrder"
          WHERE "tenantId" = ${tid} AND "status" IN ${sql(['مستلم', 'قيد العمل', 'مكتمل'])}) AS maint_count,
        (SELECT COALESCE(SUM(p."cost" * p."quantity"), 0)::float8 FROM "Product" p WHERE p."tenantId" = ${tid}) AS vcost,
        (SELECT COALESCE(SUM(p."price" * p."quantity"), 0)::float8 FROM "Product" p WHERE p."tenantId" = ${tid}) AS vprice,
        (SELECT COUNT(*)::int FROM "Product" p WHERE p."tenantId" = ${tid} AND p."quantity" <= p."minQuantity") AS low_count`
    const a = aggRows[0]

    // ── القوائم الخفيفة بالتوازي ──
    const [lowStockRows, activeMaintenanceOrders, last10SalesRaw, topProductRows, chartRows] = await Promise.all([
      sql<{ id: number; name: string; quantity: number; minQuantity: number; unitLabel: string | null }[]>`
        SELECT p."id", p."name", p."quantity", p."minQuantity", p."unitLabel" FROM "Product" p
        WHERE p."tenantId" = ${tid} AND p."quantity" <= p."minQuantity"
        ORDER BY p."quantity" ASC LIMIT 50`,
      sql<{ id: number; customerName: string; device: string; status: string; receivedAt: Date }[]>`
        SELECT "id", "customerName", "device", "status", "receivedAt" FROM "MaintenanceOrder"
        WHERE "tenantId" = ${tid} AND "status" IN ${sql(['مستلم', 'قيد العمل', 'مكتمل'])}
        ORDER BY "id" DESC LIMIT 10`,
      sql<{ id: number; invoiceNo: string | null; createdAt: Date; total: number; paid: number; status: string; customerName: string | null }[]>`
        SELECT s."id", s."invoiceNo", s."createdAt", s."total", s."paid", s."status",
               (SELECT c."name" FROM "Customer" c WHERE c."id" = s."customerId") AS "customerName"
        FROM "Sale" s
        WHERE s."tenantId" = ${tid}
        ORDER BY s."id" DESC LIMIT 10`,
      sql<{ name: string; quantity: number; total: number; pieceLabel: string | null }[]>`
        SELECT MIN(i."name") AS name, MAX(i."pieceLabel") AS "pieceLabel", SUM(i."quantity")::float8 AS quantity, SUM(i."price" * i."quantity")::float8 AS total
        FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
        WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${last30Start}
        GROUP BY COALESCE(i."productId", 0) ORDER BY quantity DESC LIMIT 8`,
      // ⚡ v9: التجميع اليومي جوه PostgreSQL (بتوقيت المحل) —
      // صف واحد لكل يوم، والحساب كله في الداتابيز.
      // 🛡️ 2026-10-18: createdAt مخزّن naive-UTC — لازم نعلنه UTC الأول
      // (AT TIME ZONE 'UTC') وبعدين نحوله لتوقيت المحل، وإلا أي بيعة بعد
      // 9 مساءً بتوقيت القاهرة بتتحسب في يوم الشهر/الرسم السابق.
      sql<{ date: string; total: number; profit: number }[]>`
        SELECT to_char((s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
               SUM(s."total")::float8 AS total,
               COALESCE(SUM(ip.profit), 0)::float8 AS profit
        FROM "Sale" s
        LEFT JOIN (
          SELECT i."saleId", SUM((i."price" - i."cost") * i."quantity") AS profit
          FROM "SaleItem" i
          JOIN "Sale" s2 ON s2."id" = i."saleId"
          WHERE s2."tenantId" = ${tid} AND s2."status" = 'مكتملة' AND s2."createdAt" >= ${lastNStart} AND s2."createdAt" < ${chartEnd}
          GROUP BY i."saleId"
        ) ip ON ip."saleId" = s."id"
        WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${lastNStart} AND s."createdAt" < ${chartEnd}
        GROUP BY 1 ORDER BY 1`,
    ])

    const n = (v: unknown) => Number(v ?? 0)
    const todaySalesTotal = n(a?.today_total)
    const todaySalesCount = n(a?.today_cnt)
    const todayProfit = n(a?.today_profit)
    const monthSalesTotal = n(a?.month_total)
    const monthProfit = n(a?.month_profit)
    const cashBalance = n(a?.cash_balance)
    const lowStockCount = n(a?.low_count)
    const stockValueCost = n(a?.vcost)
    const stockValuePrice = n(a?.vprice)
    const totalOutstandingDebt = n(a?.cust_debt)
    const totalSupplierDebt = n(a?.supp_debt)
    const activeMaintenance = n(a?.maint_count)
    const customersCount = n(a?.customers_count)

    // Chart: rows arrive already aggregated per local day from PostgreSQL.
    const toDdMm = (isoDate: string) => { const [, m, d] = isoDate.split('-'); return `${d}/${m}` }
    const dayMap = new Map<string, { total: number; profit: number }>()
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000)
      dayMap.set(toDdMm(dateStrInTz(d, tz)), { total: 0, profit: 0 })
    }
    for (const r of chartRows) {
      const slot = dayMap.get(toDdMm(r.date))
      if (slot) { slot.total += n(r.total); slot.profit += n(r.profit) }
    }
    const last7DaysSales = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }))

    const topProducts = topProductRows.map((r) => ({ name: r.name, quantity: n(r.quantity), total: n(r.total), unitLabel: r.pieceLabel ?? null }))
    const lowStockAlerts = lowStockRows.map((p) => ({ id: n(p.id), name: p.name, quantity: n(p.quantity), minQuantity: n(p.minQuantity), unitLabel: p.unitLabel ?? null }))

    // last 10 sales (lightweight payload)
    const last10Sales = last10SalesRaw.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      createdAt: s.createdAt.toISOString(),
      total: s.total,
      paid: s.paid,
      status: s.status,
      customerName: s.customerName ?? null,
    }))

    // active maintenance orders payload
    const activeMaintenanceList = activeMaintenanceOrders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      device: o.device,
      status: o.status,
      receivedAt: o.receivedAt.toISOString(),
    }))

    // 🔔 2026-09-14: Trigger notification checks (same cookie cooldown as
    // /api/notifications) — بقيت SQL خفيفة بنفس الدلالات.
    const NOTIF_COOLDOWN_MS = 5 * 60 * 1000
    const cookieHeader = req.headers.get('cookie') ?? ''
    const lastCheckedMatch = cookieHeader.match(/(?:^|;\s*)notif_checked_at=([^;]+)/)
    const lastChecked = lastCheckedMatch ? Number(lastCheckedMatch[1]) : 0
    const shouldRunChecks = !Number.isFinite(lastChecked) || Date.now() - lastChecked >= NOTIF_COOLDOWN_MS
    if (shouldRunChecks) {
      try {
        await Promise.allSettled([
          checkLowStockAndNotify(sql, session.tenantId),
          checkExpiringSubscriptions(sql, session.tenantId),
        ])
      } catch {
        // 🛡️ Never let notification failures break the dashboard.
      }
    }

    // 🛡️ 2026-09-30 (M10): فواتير آجلة متأخرة — استحقاقها عدّى ومفيش سداد كامل.
    const todayStr2 = dateStrInTz(new Date(), tz)
    const overdueCutoff = new Date(`${todayStr2}T00:00:00.000Z`)
    const overdueRows = await sql<{ id: number; invoiceNo: string | null; total: number; paid: number; dueDate: Date | null; customer: { name: string; phone: string | null } | null }[]>`
      SELECT s."id", s."invoiceNo", s."total", s."paid", s."dueDate",
             (SELECT json_build_object('name', c."name", 'phone', c."phone")
              FROM "Customer" c WHERE c."id" = s."customerId") AS customer
      FROM "Sale" s
      WHERE s."tenantId" = ${session.tenantId}
        AND s."status" <> 'مرتجعة'
        AND s."dueDate" < ${overdueCutoff}
      ORDER BY s."dueDate" ASC
      LIMIT 10`
    const overdueInvoices = overdueRows
      .map((s) => ({
        id: s.id,
        invoiceNo: s.invoiceNo,
        remaining: Math.max(0, s.total - s.paid),
        dueDate: s.dueDate ? s.dueDate.toISOString() : null,
        customerName: s.customer?.name ?? null,
        customerPhone: s.customer?.phone ?? null,
      }))
      .filter((s) => s.remaining > 0.005)

    // 🔒 RBAC: نخفي أرقام الأرباح والتكاليف لو المستخدم مش مسموحله
    const sanitizedDays = canViewProfits
      ? last7DaysSales
      : last7DaysSales.map(({ date, total }) => ({ date, total, profit: null }))

    const res = NextResponse.json({
      todaySales: todaySalesTotal,
      todayProfit: canViewProfits ? todayProfit : null,
      cashBalance,
      lowStockCount,
      todaySalesCount,
      monthSales: monthSalesTotal,
      monthProfit: canViewProfits ? monthProfit : null,
      customersCount,
      activeMaintenance,
      totalOutstandingDebt,
      totalSupplierDebt,
      stockValueCost: canViewProfits ? stockValueCost : null,
      stockValuePrice: canViewProfits ? stockValuePrice : null,
      last7DaysSales: sanitizedDays,
      topProducts,
      last10Sales,
      lowStockProducts: lowStockAlerts,
      activeMaintenanceOrders: activeMaintenanceList,
      overdueInvoices,
      canViewProfits, // بعتهاله الفرونت عشان يعرف يخفي UI الأرباح
    })
    if (shouldRunChecks) {
      res.cookies.set('notif_checked_at', String(Date.now()), {
        maxAge: NOTIF_COOLDOWN_MS / 1000,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
    }
    // ⚡ خزّن نسخة على الحافة (clone — الرد الأصلي يكمل للمتصفح)
    await putEdgeCache(res.clone(), '/api/dashboard', dashQuery, session.tenantId, 45, 2) // dashQuery includes p=0|1
    return res
  })
}