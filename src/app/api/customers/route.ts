import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: Wrapped in `withDb` — on Cloudflare Workers reuses ONE
 * PrismaClient per request instead of creating a new TCP+TLS+auth connection
 * per query. GET makes 2 parallel queries; without `withDb` each was 200-500ms
 * of pure connection overhead.
 *
 * 🛡️ 2026-09-27: This list had no `take` limit at all — every request
 * fetched the tenant's ENTIRE customer table. Fine with a handful of rows,
 * but the same unbounded-scan shape as the Error 1102 fix elsewhere,
 * just waiting to happen as a shop's customer base grows.
 *
 * Every current caller (CustomersView's table, POS autocomplete, offline
 * prewarm) still calls this route with NO `page` param and gets the same
 * bare array as before — CustomersView's stats cards and Excel export need
 * the whole tenant's customers in memory to stay correct, so behavior is
 * unchanged there. What changed is that "all of them" is now bounded by
 * SAFETY_CAP instead of a truly unbounded query.
 *
 * Real, opt-in pagination is available for whoever wants it: pass `page`
 * (and optionally `limit`) and the response becomes { data, total, page,
 * limit, totalPages } instead of a bare array — mirroring /api/products.
 * No current page uses this yet.
 */
const SAFETY_CAP = 3000

export async function GET(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''

    // ⚡ EDGE CACHE (2026-10-06) — إصلاح Error 1102: القائمة الافتراضية (بدون
    // بحث/صفحات) بتجيب حتى 3000 عميل + groupBy على كل المبيعات — ده الطلب
    // اللي بيقع في كل تصفح سريع (شفناه في wrangler tail بـ Exceeded CPU Limit).
    // كاش حافة 20 ثانية بمفتاح per-tenant — والجديد فوري لأن أي إضافة
    // عميل/فاتورة/سداد بتعمل purge للمفتاح فوراً.
    const cacheable = !search && !searchParams.has('page') && searchParams.keys().next().done === true
    if (cacheable) {
      const cached = await matchEdgeCache('/api/customers', '', session.tenantId, 2)
      if (cached) return cached
    }

    const where: any = { tenantId: session.tenantId }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const paginated = searchParams.has('page')
    const limit = paginated
      ? Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
      : SAFETY_CAP
    const page = paginated ? Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)) : 1
    const skip = paginated ? (page - 1) * limit : 0

    const [customers, total, salesAgg] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { id: 'desc' },
        include: { _count: { select: { sales: true } } },
        skip,
        take: limit,
      }),
      paginated ? db.customer.count({ where }) : Promise.resolve(null),
      db.sale.groupBy({
        by: ['customerId'],
        // 🛡️ 2026-09-30 (C6/M12): الفواتير المرتجعة بالكامل ماتتحسبش مشتريات.
        where: {
          tenantId: session.tenantId,
          customerId: { not: null },
          status: { not: 'مرتجعة' },
        },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
    ])
    const aggByCustomer = new Map<number, { totalPurchases: number; lastSaleAt: Date | null }>(
      salesAgg.map((a) => [
        a.customerId as number,
        { totalPurchases: a._sum.total ?? 0, lastSaleAt: a._max.createdAt },
      ])
    )
    const result = customers.map((c) => ({
      ...c,
      totalPurchases: aggByCustomer.get(c.id)?.totalPurchases ?? 0,
      lastSaleAt: aggByCustomer.get(c.id)?.lastSaleAt ?? null,
    }))

    if (!paginated) {
      const res = NextResponse.json(result)
      if (cacheable) {
        // ⚡ خزّن نسخة على الحافة (clone — الرد الأصلي يكمل للمتصفح)
        await putEdgeCache(res.clone(), '/api/customers', '', session.tenantId, 20, 2)
      }
      return res
    }
    return NextResponse.json({
      data: result,
      total: total ?? result.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((total ?? result.length) / limit)),
    })
  })
}

export async function POST(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const body = await req.json().catch(() => null)
    if (!body?.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
    }
    const created = await db.customer.create({
      data: {
        tenantId: session.tenantId,
        name: String(body.name).trim(),
        phone: body.phone ? String(body.phone).trim() : null,
      },
    })
    // ⚡ تفريغ الكاش فوراً — العميل الجديد يظهر في كل القوائم لحظياً
    await purgeEdgeCache(
      [PURGE_KEYS.customersDefault, PURGE_KEYS.dashboard(7), PURGE_KEYS.dashboard(14), PURGE_KEYS.dashboard(30)],
      session.tenantId,
      2
    )
    return NextResponse.json(created, { status: 201 })
  })
}
