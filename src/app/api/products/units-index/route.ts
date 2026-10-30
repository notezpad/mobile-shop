import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse, getPlanContext } from '@/lib/features'
import { withSql } from '@/lib/sql'
import { branchScopeSql } from '@/lib/branch-scope'

export const dynamic = 'force-dynamic'

/**
 * 📦 فهرس وحدات الجملة (كرتونة/دستة...) — الندّ الشامل لوحدات المنتجات.
 *
 * ⚡ 2026-10-31 (ملصقات الباركود): بيدعم `?ids=1,2,3` — بيرجّع وحدات المنتجات دي
 * كلها في طلب واحد، بدل ما دايلوج الطباعة يبعت طلب لكل منتج مختار (100 منتج = 100 طلب).
 * بيدعم كمان cursor/limit زي variants-index بالظبط (للـ prewarm مستقبلاً).
 *
 * 🏬 عزل الفروع: الوحدات بتورّث فرع المنتج — موظف فرع بيشوف وحدات منتجات فرعه بس
 * (والغير مسندة لو فرعه هو الرئيسي)، نفس قاعدة branch-scope.
 *
 * الباقات اللي مفيهاش multi_unit بترجّع قايمة فاضية (مش خطأ) — نفس سلوك
 * GET /api/products/[id]/units.
 */
type Row = {
  id: number
  productId: number
  name: string
  price: number | null
  barcode: string | null
  factor: number
  active: boolean
}

/** أقصى عدد ids في طلب واحد — نفس حد variants-index. */
const MAX_IDS = 300

function parseIds(raw: string | null): number[] {
  if (!raw) return []
  const list = raw
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
  return [...new Set(list)].slice(0, MAX_IDS)
}

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

    // نفس شرط الباقة في GET /api/products/[id]/units: مفيش multi_unit → فاضية بهدوء
    try {
      const planCtx = await getPlanContext(session.tenantId)
      if (!planCtx.capabilities.includes('multi_unit')) {
        return NextResponse.json({ data: [], nextCursor: null })
      }
    } catch {
      return NextResponse.json({ data: [], nextCursor: null })
    }

    // 🏬 نطاق الفرع على منتج الوحدة
    const branchFilter = branchScopeSql(sql, session.tenantId, session.branchId, 'p."branchId"')

    const sp = req.nextUrl.searchParams
    const ids = parseIds(sp.get('ids'))

    if (ids.length > 0) {
      const rows = await sql<Row[]>`
        SELECT u."id", u."productId", u."name", u."price", u."barcode", u."factor", u."active"
        FROM "ProductUnit" u
        JOIN "Product" p ON p."id" = u."productId"
        WHERE p."tenantId" = ${session.tenantId}
          AND u."productId" IN ${sql(ids)}
          AND ${branchFilter}
        ORDER BY u."id" ASC`
      return NextResponse.json({ data: rows, nextCursor: null })
    }

    const cursor = Math.max(0, parseInt(sp.get('cursor') || '0', 10) || 0)
    const limit = Math.min(5000, Math.max(1, parseInt(sp.get('limit') || '2000', 10) || 2000))

    const rows = await sql<Row[]>`
      SELECT u."id", u."productId", u."name", u."price", u."barcode", u."factor", u."active"
      FROM "ProductUnit" u
      JOIN "Product" p ON p."id" = u."productId"
      WHERE p."tenantId" = ${session.tenantId} AND u."id" > ${cursor}
        AND ${branchFilter}
      ORDER BY u."id" ASC
      LIMIT ${limit}`
    const nextCursor = rows.length === limit ? Number(rows[rows.length - 1].id) : null
    return NextResponse.json({ data: rows, nextCursor })
  })
}
