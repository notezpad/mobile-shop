import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

/**
 * 🔎 2026-10-18 — فحص سلامة المخزون (للمدير).
 *
 * GET  → تقرير بالمشاكل:
 *   drift     : منتجات ليها ألوان/مقاسات وكميتها الإجمالية لا تساوي مجموع مقاساتها
 *   purchases : بنود أوامر شراء على منتج ليه مقاسات من غير تحديد المقاس (الكمية ضاعت)
 *   negative  : أرصدة سالبة (منتج أو لون/مقاس)
 *   review    : عدد حركات الموظفين اليدوية اللي لسه ماتراجعتش
 * POST { action:'resync', productId } → يظبط كمية المنتج = مجموع مقاساته (وتتسجل حركة تسوية).
 */
async function __GET(sql: Sql) {
  let s
  try { s = await requireAdmin() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const branchCond = s.branchId ? sql`AND p."branchId" = ${s.branchId}` : sql``

  const [drift, purchases, negative, review] = await Promise.all([
    sql<{ productId: number; name: string; productQty: number; variantsSum: number }[]>`
      SELECT p."id" AS "productId", p."name", p."quantity"::float8 AS "productQty",
             SUM(v."quantity")::float8 AS "variantsSum"
        FROM "Product" p JOIN "ProductVariant" v ON v."productId" = p."id"
       WHERE p."tenantId" = ${s.tenantId} ${branchCond}
       GROUP BY p."id", p."name", p."quantity"
      HAVING p."quantity" <> SUM(v."quantity")
       ORDER BY ABS(p."quantity" - SUM(v."quantity")) DESC
       LIMIT 100`,
    sql<{ orderNo: string; productId: number; name: string; quantity: number; returnedQty: number; createdAt: string }[]>`
      SELECT o."orderNo", p."id" AS "productId", p."name", i."quantity"::float8 AS "quantity",
             i."returnedQty"::float8 AS "returnedQty",
             to_char(o."createdAt", 'YYYY-MM-DD') AS "createdAt"
        FROM "PurchaseOrderItem" i
        JOIN "PurchaseOrder" o ON o."id" = i."purchaseOrderId"
        JOIN "Product" p ON p."id" = i."productId"
       WHERE o."tenantId" = ${s.tenantId} AND i."variantId" IS NULL ${branchCond}
         AND EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")
       ORDER BY o."createdAt" DESC
       LIMIT 100`,
    sql<{ kind: string; productId: number; name: string; quantity: number }[]>`
      SELECT 'product' AS kind, p."id" AS "productId", p."name", p."quantity"::float8 AS "quantity"
        FROM "Product" p WHERE p."tenantId" = ${s.tenantId} AND p."quantity" < 0 ${branchCond}
      UNION ALL
      SELECT 'variant', p."id", p."name" || ' — ' || concat_ws(' / ', v."color", v."size"), v."quantity"::float8
        FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
       WHERE p."tenantId" = ${s.tenantId} AND v."quantity" < 0 ${branchCond}
       LIMIT 100`,
    sql<{ cnt: number }[]>`
      SELECT COUNT(*)::int AS cnt FROM "StockMovement" m
       WHERE m."tenantId" = ${s.tenantId} AND m."needsReview" = true
       ${s.branchId ? sql`AND m."branchId" = ${s.branchId}` : sql``}`,
  ])

  return NextResponse.json({
    drift,
    purchases,
    negative,
    reviewCount: review[0]?.cnt ?? 0,
    ok: drift.length === 0 && purchases.length === 0 && negative.length === 0,
  })
}

async function __POST(req: NextRequest) {
  let s
  try { s = await requireAdmin() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const b = await req.json().catch(() => null)
  if (b?.action !== 'resync') return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  const productId = parseInt(b?.productId, 10)
  if (!productId) return NextResponse.json({ error: 'المنتج مطلوب' }, { status: 400 })

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product || product.tenantId !== s.tenantId) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
  if (s.branchId && product.branchId && product.branchId !== s.branchId) {
    return NextResponse.json({ error: 'لا صلاحية على منتجات فرع آخر' }, { status: 403 })
  }

  const out = await db.$transaction(async (tx) => {
    const agg = await tx.productVariant.aggregate({ where: { productId }, _sum: { quantity: true }, _count: true })
    if (agg._count === 0) return { changed: false as const }
    const sum = agg._sum.quantity ?? 0
    const diff = sum - product.quantity
    if (diff === 0) return { changed: false as const }
    await syncProductQuantityFromVariants(tx, productId)
    await tx.stockMovement.create({
      data: {
        tenantId: s.tenantId,
        branchId: product.branchId ?? s.branchId ?? null,
        productId,
        type: diff > 0 ? 'in' : 'out',
        quantity: diff,
        refType: 'manual',
        reasonCode: 'resync',
        note: `مزامنة كمية المنتج مع مجموع مقاساته (كانت ${product.quantity} وبقت ${sum})`,
        userId: s.userId,
      },
    })
    return { changed: true as const, from: product.quantity, to: sum }
  })
  await purgeEdgeCache([PURGE_KEYS.productsInventory(s.branchId)], s.tenantId, '3')
  return NextResponse.json({ ok: true, ...out })
}

export async function GET() {
  return withSql((sql) => __GET(sql))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
