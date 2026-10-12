import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { checkLowStockAndNotify, checkExpiringSubscriptions } from '@/lib/notifications'
import { getTenantTimezone, startOfDayInTz, startOfMonthInTz, dateStrInTz } from '@/lib/tenantTime'
import { matchEdgeCache, putEdgeCache } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

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

  // ⚡ EDGE CACHE (2026-10-06) — إصلاح Error 1102: الداشبورد أثقل endpoint
  // (15+ استعلام + Prisma init لكل طلب) وبيتسحب مع كل زيارة وتحديث تلقائي.
  // نسخة مخزنة على حافة Cloudflare لحد 45 ثانية = ≈ صفر CPU للطلبات المتكررة.
  // مفتاح per-tenant — بيانات كل محل منفصلة. والجديد دايماً متاح لأن أي
  // بيع/سداد بيعمل purge للمفتاح (انظر api/sales و api/payments).
  const dashQuery = `days=${chartDays}`
  const cachedDashboard = await matchEdgeCache('/api/dashboard', dashQuery, session.tenantId, 2)
  if (cachedDashboard) return cachedDashboard

  return withDb(async () => {
    const tenantFilter = { tenantId: session.tenantId }
    const now = new Date()
    // 🕐 ROOT FIX (2026-09-27): "today"/"this month" must mean the shop's
    // own local day, not the server's (UTC) clock. Previously this used
    // `now.setHours(0,0,0,0)` — that's UTC midnight on Cloudflare Workers,
    // so a sale made after local midnight but before UTC midnight (e.g.
    // ~1-2 AM in Egypt) was silently missing from "today's sales" even
    // though the invoice itself is stamped with today's date everywhere
    // else in the UI. See src/lib/tenantTime.ts for the full explanation.
    const tz = await getTenantTimezone(session.tenantId)
    const todayStart = startOfDayInTz(now, tz)
    const monthStart = startOfMonthInTz(now, tz)
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const lastNStart = startOfDayInTz(new Date(now.getTime() - (chartDays - 1) * 24 * 60 * 60 * 1000), tz)
    // (⚡ v9: alias last7Start اتشال — الرسم بيتجمع في SQL مباشرة بـ lastNStart)

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
      db.$queryRaw<{ id: number; name: string; quantity: number; minQuantity: number; unitLabel: string | null }[]>`
        SELECT p."id", p."name", p."quantity", p."minQuantity", p."unitLabel" FROM "Product" p
        WHERE p."tenantId" = ${tid} AND p."quantity" <= p."minQuantity"
        ORDER BY p."quantity" ASC LIMIT 50`,
      db.maintenanceOrder.count({ where: { ...tenantFilter, status: { in: ['مستلم', 'قيد العمل', 'مكتمل'] } } }),
      db.maintenanceOrder.findMany({ where: { ...tenantFilter, status: { in: ['مستلم', 'قيد العمل', 'مكتمل'] } }, orderBy: { id: 'desc' }, take: 10 }),
      db.sale.findMany({ where: tenantFilter, orderBy: { id: 'desc' }, take: 10, select: { id: true, invoiceNo: true, createdAt: true, total: true, paid: true, status: true, customer: { select: { name: true } } } }),
      db.$queryRaw<{ name: string; quantity: number; total: number; pieceLabel: string | null }[]>`
        SELECT MIN(i."name") AS name, MAX(i."pieceLabel") AS "pieceLabel", SUM(i."quantity")::float8 AS quantity, SUM(i."price" * i."quantity")::float8 AS total
        FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
        WHERE s."tenantId" = ${tid} AND s."status" = 'مكتملة' AND s."createdAt" >= ${last30Start}
        GROUP BY COALESCE(i."productId", 0) ORDER BY quantity DESC LIMIT 5`,
      db.customer.count({ where: tenantFilter }),
      db.customer.aggregate({ where: { ...tenantFilter, balance: { gt: 0 } }, _sum: { balance: true } }),
      db.supplier.aggregate({ where: { ...tenantFilter, balance: { gt: 0 } }, _sum: { balance: true } }),
      // ⚡ v9 (2026-10-06): التجميع اليومي اتنقل لـ PostgreSQL (GROUP BY يوم
      // بتوقيت المحل AT TIME ZONE). كان بيرجع كل فاتورة في الفترة + subquery
      // ربح لكل فاتورة (O(n×m) على قاعدة البيانات) وبيعيد n صف للـ Worker
      // ويجمعهم في JS — مع 30 يوم وشهر مزدحم كان بيحرق CPU زيادة على
      // (10ms limit → Error 1102). دلوقتي: صف واحد لكل يوم بس، والحساب كله
      // جوه Postgres (نفس نمط trendRows في /api/reports).
      db.$queryRaw<{ date: string; total: number; profit: number }[]>`
        SELECT to_char(s."createdAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
               SUM(s."total")::float8 AS total,
               COALESCE(SUM(ip.profit), 0)::float8 AS profit
        FROM "Sale" s
        LEFT JOIN (
          -- مقيّد بنفس نافذة الرسم — مش GROUP BY على جدول SaleItem كله
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

    // Chart: rows arrive already aggregated per local day from PostgreSQL
    // (GROUP BY AT TIME ZONE — see query above). We only re-map the date to
    // the dd/mm label the chart expects, filling empty days so the line
    // never breaks.
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
    // 🛡️ Shares the same `notif_checked_at` cookie cooldown as
    // /api/notifications (see that route for the full explanation): the
    // in-memory rate limiter in lib/notifications.ts doesn't survive
    // across Cloudflare Workers isolates, so without this, a tenant with
    // both the dashboard (5-min auto-refresh) and the notification bell
    // (3-min poll) open would run these checks from BOTH endpoints,
    // independently, far more often than the intended 5-minute cooldown.
    const NOTIF_COOLDOWN_MS = 5 * 60 * 1000
    const cookieHeader = req.headers.get('cookie') ?? ''
    const lastCheckedMatch = cookieHeader.match(/(?:^|;\s*)notif_checked_at=([^;]+)/)
    const lastChecked = lastCheckedMatch ? Number(lastCheckedMatch[1]) : 0
    const shouldRunChecks = !Number.isFinite(lastChecked) || Date.now() - lastChecked >= NOTIF_COOLDOWN_MS
    if (shouldRunChecks) {
      try {
        await Promise.allSettled([
          checkLowStockAndNotify(db, session.tenantId),
          checkExpiringSubscriptions(db, session.tenantId),
        ])
      } catch {
        // 🛡️ Never let notification failures break the dashboard.
        // The dashboard response is more important than notifications.
      }
    }

    // 🛡️ 2026-09-30 (M10): فواتير آجلة متأخرة — استحقاقها عدّى ومفيش سداد
    // كامل. بتظهر في الداشبورد عشان التحصيل يحصل قبل ما الدين يتقادم.
    //
    // ⚡ PERF FIX (2026-10-05): كان بيستدعي getTenantTimezone() تاني هنا —
    // يعني استعلام Tenant إضافي كامل على كل تحميل داشبورد، وهو متاح أصلاً
    // في `tz` اللي اتحسب فوق في نفس الطلب. اتصال الـ Postgres هنا بيتفتح
    // من جديد لكل ريكويست، فكل استعلام زيادة بيحسس المستخدم فعلياً.
    const tzNow = tz
    const todayStr2 = dateStrInTz(new Date(), tzNow)
    const overdueCutoff = new Date(`${todayStr2}T00:00:00.000Z`)
    const overdueRows = await db.sale.findMany({
      where: {
        tenantId: session.tenantId,
        status: { not: 'مرتجعة' },
        dueDate: { lt: overdueCutoff },
      },
      select: {
        id: true,
        invoiceNo: true,
        total: true,
        paid: true,
        dueDate: true,
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
    })
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

    const res = NextResponse.json({
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
      overdueInvoices,
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
    await putEdgeCache(res.clone(), '/api/dashboard', dashQuery, session.tenantId, 45, 2)
    return res
  })
}
