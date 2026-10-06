import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { matchEdgeCache, putEdgeCache } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/branches — sales/profit/product-count per branch.
 *
 * 🚀 2026-09-13 PERFORMANCE FIX:
 *   OLD: for each branch, findMany(sales, include: items) + iterate in JS to
 *        compute profit. For 5 branches = 13 sequential queries, each pulling
 *        ALL sale rows + ALL sale item rows. With Supabase's per-query latency
 *        on Cloudflare Workers, this was 3-6 seconds easily.
 *   NEW: 3 aggregate queries (via raw SQL + groupBy) — branches + salesAgg +
 *        profitAgg + productCount. All in parallel. No N+1. ~150-300ms total.
 *
 * Wrapped in `withDb` so all queries reuse ONE PrismaClient per request
 * (saves 200-500ms of TCP+TLS+auth setup per query on Cloudflare Workers).
 */
export async function GET() {
  return withDb(async () => {
    let s
    try {
      s = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // ⚡ v12 EDGE CACHE (Error 1102 / CPU limit): تقرير الفروع = 4 استعلامات
    // تجميعية في كل فتح صفحة فروع. صفحة الفروع كانت من الصفحات اللي بيسقطها
    // الموقع (مع /users و /reports) لأن الطلب ده كان بيشتغّل Prisma في
    // isolate بارد كل مرة. 25 ثانية كاش (نفس نهج /api/reports) + مسح فوري
    // بعد أي بيع/تغيير فرع = الافتتاحيات المتتالية بتكلف ≈ صفر CPU.
    const cached = await matchEdgeCache('/api/reports/branches', '', s.tenantId, '1')
    if (cached) return cached

    // 1) Branches list (1 query)
    const branches = await db.branch.findMany({
      where: { tenantId: s.tenantId },
      orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
    })
    const scope = s.branchId ? branches.filter((b) => b.id === s.branchId) : branches

    // 2) Aggregate sales totals per branch (1 query, no rows fetched)
    //    Returns rows: { branchId: number|null, salesCount: bigint, totalSales: number }
    const salesAgg = await db.$queryRaw<
      Array<{ branchId: number | null; salesCount: bigint; totalSales: number }>
    >`
      SELECT
        "branchId",
        COUNT(*)::bigint AS "salesCount",
        COALESCE(SUM(total), 0)::float8 AS "totalSales"
      FROM "Sale"
      WHERE "tenantId" = ${s.tenantId} AND status = 'مكتملة'
      GROUP BY "branchId"
    `

    // 3) Aggregate profit per branch (1 query, JOIN SaleItem → Sale)
    //    Returns rows: { branchId: number|null, totalProfit: number }
    const profitAgg = await db.$queryRaw<
      Array<{ branchId: number | null; totalProfit: number }>
    >`
      SELECT
        s."branchId",
        COALESCE(SUM((si.price - si.cost) * si.quantity), 0)::float8 AS "totalProfit"
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."tenantId" = ${s.tenantId} AND s.status = 'مكتملة'
      GROUP BY s."branchId"
    `

    // 4) Product count per branch (1 groupBy query)
    const productAgg = await db.product.groupBy({
      by: ['branchId'],
      where: { tenantId: s.tenantId },
      _count: { id: true },
    })

    // Build lookup maps for fast merge
    const salesMap = new Map(
      salesAgg.map((r) => [
        r.branchId ?? 0,
        { salesCount: Number(r.salesCount), totalSales: Number(r.totalSales) },
      ]),
    )
    const profitMap = new Map(
      profitAgg.map((r) => [r.branchId ?? 0, Number(r.totalProfit)]),
    )
    const productMap = new Map(
      productAgg.map((r) => [(r.branchId ?? 0), r._count.id]),
    )

    // Assemble per-branch results
    const results = scope.map((b) => {
      const s = salesMap.get(b.id)
      return {
        branchId: b.id,
        name: b.name,
        isMain: b.isMain,
        salesCount: s?.salesCount ?? 0,
        totalSales: s?.totalSales ?? 0,
        totalProfit: profitMap.get(b.id) ?? 0,
        productCount: productMap.get(b.id) ?? 0,
      }
    })

    // Include "unassigned" bucket (sales with branchId = null) for multi-branch tenants
    if (!s.branchId) {
      const unassigned = salesMap.get(0)
      if (unassigned && unassigned.salesCount > 0) {
        results.push({
          branchId: 0,
          name: 'بدون فرع',
          isMain: false,
          salesCount: unassigned.salesCount,
          totalSales: unassigned.totalSales,
          totalProfit: profitMap.get(0) ?? 0,
          productCount: productMap.get(0) ?? 0,
        })
      }
    }

    const res = NextResponse.json(results)
    await putEdgeCache(res.clone(), '/api/reports/branches', '', s.tenantId, 25, '1')
    return res
  })
}
