import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql } from '@/lib/sql'
import { productBranchScopeSql } from '@/lib/branch-scope'

export const dynamic = 'force-dynamic'

/**
 * إحصائيات المخزون من السيرفر على كل الأصناف (مش أول 100).
 * الواجهة (useInventoryData) بتنادي GET /api/products/stats.
 * - موظف الفرع: نطاق فرعه بس.
 * - المدير: كل الفروع، أو فرع واحد لو اتبعت ?branchId=<id> (أو none = بدون فرع).
 * - التكلفة والقيم المبنية عليها = null لمن لا يملك صلاحية رؤية الأرباح.
 */
export async function GET(req: NextRequest) {
  return withSql(async (sql) => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try {
      await requireModule(session, 'products')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
    }

    const canSeeCost =
      session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.canViewProfits === true

    const branchParam = new URL(req.url).searchParams.get('branchId')
    const scope = session.branchId
      ? sql`AND ${productBranchScopeSql(sql, session.tenantId, session.branchId)}`
      : branchParam === 'none'
        ? sql`AND "branchId" IS NULL`
        : branchParam && branchParam !== 'all' && Number.isFinite(parseInt(branchParam, 10))
          ? sql`AND "branchId" = ${parseInt(branchParam, 10)}`
          : sql``

    const rows = await sql<Record<string, number>[]>`
      SELECT
        COUNT(*)::int AS "totalItems",
        COUNT(*) FILTER (WHERE "quantity" <= "minQuantity")::int AS "lowStock",
        COUNT(*) FILTER (WHERE "quantity" <= 0)::int AS "outOfStock",
        COALESCE(SUM("cost" * "quantity"), 0)::float8 AS "totalValueCost",
        COALESCE(SUM("price" * "quantity"), 0)::float8 AS "totalValuePrice",
        COUNT(*) FILTER (WHERE COALESCE("displayQty", "quantity") < "quantity")::int AS "warehouseItems",
        COALESCE(SUM(CASE WHEN COALESCE("displayQty", "quantity") < "quantity"
                          THEN "quantity" - COALESCE("displayQty", "quantity") ELSE 0 END), 0)::float8 AS "warehousePieces",
        COALESCE(SUM(CASE WHEN COALESCE("displayQty", "quantity") < "quantity"
                          THEN ("quantity" - COALESCE("displayQty", "quantity")) * "cost" ELSE 0 END), 0)::float8 AS "warehouseValue"
      FROM "Product"
      WHERE "tenantId" = ${session.tenantId} ${scope}`

    const r = rows[0] ?? {}
    return NextResponse.json({
      totalItems: Number(r.totalItems ?? 0),
      lowStock: Number(r.lowStock ?? 0),
      outOfStock: Number(r.outOfStock ?? 0),
      totalValueCost: canSeeCost ? Number(r.totalValueCost ?? 0) : null,
      totalValuePrice: Number(r.totalValuePrice ?? 0),
      warehouseItems: Number(r.warehouseItems ?? 0),
      warehousePieces: Number(r.warehousePieces ?? 0),
      warehouseValue: canSeeCost ? Number(r.warehouseValue ?? 0) : null,
      canSeeCost,
    })
  })
}
