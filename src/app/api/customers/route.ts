import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): GET بقى SQL مباشر عبر postgres.js —
 * كان بيشغّل استعلامين Prisma (قائمة + groupBy على كل المبيعات) + إنشاء
 * PrismaClient في كل طلب، وكان من أوضح اللي بتقع معاه "Exceeded CPU Limit"
 * في wrangler tail. نفس الرد بنفس الشكل بالظبط ( bare array أو {data,...}
 * مع _count.sales وtotalPurchases وlastSaleAt).
 *
 * 🛡️ 2026-09-27: SAFETY_CAP بيوازن "كل العملاء" المطلوب للأوفلاين/الإكسل
 * مع عدم فتح باب مسح غير محدود.
 *
 * 🛡️ 2026-09-30 (C6/M12): الفواتير المرتجعة بالكامل ماتتحسبش مشتريات
 * (status <> 'مرتجعة') — نفس الشرط في SQL.
 */
const SAFETY_CAP = 3000

export async function GET(req: NextRequest) {
  return withSql(async (sql) => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''

    // ⚡ EDGE CACHE (2026-10-06) — نفس مفاتيح الكاش القديمة بدون تغيير
    const cacheable = !search && !searchParams.has('page') && searchParams.keys().next().done === true
    if (cacheable) {
      const cached = await matchEdgeCache('/api/customers', '', session.tenantId, 2)
      if (cached) return cached
    }

    const paginated = searchParams.has('page')
    const limit = paginated
      ? Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
      : SAFETY_CAP
    const page = paginated ? Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)) : 1
    const skip = paginated ? (page - 1) * limit : 0

    // ملاحظة: بحث Prisma القديم كان contains **حساس لحالة الحروف** (بدون
    // mode:'insensitive') — LIKE في Postgres بنفس السلوك حرفيًا.
    const searchPattern = search ? `%${search}%` : null

    const rows = await sql<any[]>`
      SELECT c.*,
             (SELECT COUNT(*)::int FROM "Sale" s WHERE s."customerId" = c."id") AS "__salesCount"
      FROM "Customer" c
      WHERE c."tenantId" = ${session.tenantId}
        ${searchPattern ? sql`AND (c."name" LIKE ${searchPattern} OR c."phone" LIKE ${searchPattern})` : sql``}
      ORDER BY c."id" DESC
      LIMIT ${limit} OFFSET ${skip}`

    // إجمالي عدد العملاء (paginated فقط — زي القديم بالظبط)
    let total: number | null = null
    if (paginated) {
      const cnt = await sql<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt FROM "Customer"
        WHERE "tenantId" = ${session.tenantId}
          ${searchPattern ? sql`AND ("name" LIKE ${searchPattern} OR "phone" LIKE ${searchPattern})` : sql``}`
      total = Number(cnt[0]?.cnt ?? 0)
    }

    // 🛡️ C6/M12: تجميع المشتريات + آخر فاتورة لكل عميل (بدون المرتجعة)
    type AggRow = { customerId: number; total: number; lastSaleAt: Date | null }
    const salesAgg = await sql<AggRow[]>`
      SELECT "customerId",
             COALESCE(SUM("total"), 0)::float8 AS total,
             MAX("createdAt") AS "lastSaleAt"
      FROM "Sale"
      WHERE "tenantId" = ${session.tenantId}
        AND "customerId" IS NOT NULL
        AND "status" <> 'مرتجعة'
      GROUP BY "customerId"`
    const aggByCustomer = new Map<number, { totalPurchases: number; lastSaleAt: Date | null }>(
      salesAgg.map((a) => [Number(a.customerId), { totalPurchases: a.total ?? 0, lastSaleAt: a.lastSaleAt }])
    )

    const result = rows.map((c) => {
      const { __salesCount, ...rest } = c
      return {
        ...rest,
        _count: { sales: Number(__salesCount ?? 0) },
        totalPurchases: aggByCustomer.get(Number(c.id))?.totalPurchases ?? 0,
        lastSaleAt: aggByCustomer.get(Number(c.id))?.lastSaleAt ?? null,
      }
    })

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
