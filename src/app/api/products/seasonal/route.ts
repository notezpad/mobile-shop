import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse, getPlanContext } from '@/lib/features'
import { purgeCatalogCaches } from '@/lib/edgeCache'
import { withSql, type Sql } from '@/lib/sql'
import { applySecurityHeaders } from '@/lib/security-headers'
import { closeSeasonBulk, openSeasonBulk } from '@/lib/bulk-sql'
import {
  SEASON_LABELS,
  canUseSeasonal,
  isSeasonValue,
  parseClosedSeasons,
  roundQty,
  type SeasonValue,
} from '@/lib/seasonal'

export const dynamic = 'force-dynamic'

/**
 * 👕 2026-10-22 — «المخزن الداخلي» للمواسم (باقات الملابس فقط).
 *
 * GET  /api/products/seasonal?mode=state               → حالة المواسم المقفولة + إحصايات النايم لكل موسم
 * GET  /api/products/seasonal?season=SUMMER            → ملخص إغلاق الموسم (كم منتج/قطعة/قيمة)
 * GET  /api/products/seasonal?mode=open&season=WINTER  → قائمة أصناف الموسم النايمة في المخزن (لفتحه)
 * POST /api/products/seasonal { action:'close', season:'SUMMER' }
 *      → كل أصناف الموسم المعروضة بتدخل المخزن الداخلي + حركة warehouse_in لكل منتج
 * POST /api/products/seasonal { action:'open', season:'WINTER', items:[{ productId, qty }] }
 *      → إرجاع كميات محددة للعرض + حركة warehouse_out لكل منتج
 *
 * القاعدة المحاسبية: النقل معرض ↔ مخزن = حركة موقع مش حركة مال —
 * مفيش شراء ولا بيع ولا كاش، والتكلفة زي ما هي (نفس قاعدة رصيد افتتاحي).
 * الإغلاق والفتح أدمن فقط (قرار مالك بتأثير على كل الكتالوج).
 *
 * ⚡ v2 (تقليل CPU):
 *  - الإغلاق/الفتح كانوا بيلفّوا على كل منتج بـ ٢–٥ استعلامات Prisma جوه transaction
 *    (١٠٠٠ منتج ≈ ٢٥٠٠–٥٠٠٠ استعلام). دلوقتي عدد ثابت تقريبًا (٦–٩ استعلامات)
 *    — انظر closeSeasonBulk / openSeasonBulk في src/lib/bulk-sql.ts.
 *  - requireFashionSession كان بيعمل db.$queryRaw (Prisma) فكل طلب هنا — حتى GET
 *    الخفيف — كان بيبني PrismaClient + يحمّل محرك الـ WASM. دلوقتي بيقرا نوع
 *    النشاط من getPlanContext (postgres.js + كاش جوه الـ isolate).
 *  - حد الفتح كان 500 صنف (والقايمة LIMIT 500) → أي موسم فيه أكتر من 500 صنف
 *    ماكانش ينفع يتفتح كله. اترفع لـ MAX_OPEN_ITEMS.
 */

/** أقصى عدد أصناف في قايمة/طلب فتح الموسم الواحد */
const MAX_OPEN_ITEMS = 2000

async function requireFashionSession() {
  const s = await requireAuth()
  const ctx = await getPlanContext(s.tenantId)
  if (!canUseSeasonal(ctx.businessType)) {
    const err = new Error('الميزة دي متاحة لباقات الملابس فقط') as Error & { status?: number }
    err.status = 403
    throw err
  }
  return s
}

function featureGuard(e: unknown): { status: number; body: { error: string } } | null {
  const fe = featureErrorResponse(e)
  if (fe) return fe
  const err = e as Error & { status?: number }
  if (err?.status) return { status: err.status, body: { error: err.message } }
  const ae = authErrorResponse(e)
  if (ae) return { status: ae.status, body: ae.body }
  return null
}

/** الموسم المسموح به للإغلاق/الفتح — «طوال السنة» مالوش إغلاق */
function seasonOf(value: unknown): SeasonValue | null {
  return isSeasonValue(value) && value !== 'ALL_YEAR' ? value : null
}

async function __GET(req: NextRequest) {
  return withSql(async (sql: Sql) => {
    let s
    try {
      s = await requireFashionSession()
      await requireModule(s, 'inventory')
    } catch (e) {
      const g = featureGuard(e)
      if (g) return NextResponse.json(g.body, { status: g.status })
      throw e
    }
    const { searchParams } = new URL(req.url)

    // 🧠 حالة المواسم — بتغذي الفلتر الذكي في شاشة المنتجات (الشغال الآن)
    if (searchParams.get('mode') === 'state') {
      // الاستعلامين مستقلين — بالتوازي
      const [trows, stats] = await Promise.all([
        sql<{ closedSeasons: string | null }[]>`
          SELECT "closedSeasons" FROM "Tenant" WHERE "id" = ${s.tenantId} LIMIT 1`,
        // إحصايات النايم في المخزن لكل موسم (للبانر الذكي)
        sql<{ season: string; products: number; pieces: number; value: number }[]>`
          SELECT "season", COUNT(*)::int AS products,
                 COALESCE(SUM("quantity" - "displayQty"), 0)::float8 AS pieces,
                 COALESCE(SUM(("quantity" - "displayQty") * "cost"), 0)::float8 AS value
          FROM "Product"
          WHERE "tenantId" = ${s.tenantId} AND "active" = true
            AND "season" IN ('SUMMER', 'WINTER')
            AND ("quantity" - "displayQty") > 0
          GROUP BY "season"`,
      ])
      const closed = parseClosedSeasons(trows[0]?.closedSeasons)
      const bySeason: Record<string, { products: number; pieces: number; value: number }> = {}
      for (const r of stats) bySeason[r.season] = { products: r.products, pieces: roundQty(r.pieces), value: roundQty(r.value) }
      return NextResponse.json({
        closedSeasons: closed,
        seasons: {
          SUMMER: bySeason.SUMMER ?? { products: 0, pieces: 0, value: 0 },
          WINTER: bySeason.WINTER ?? { products: 0, pieces: 0, value: 0 },
        },
      })
    }

    const mode = searchParams.get('mode') === 'open' ? 'open' : 'close'
    const season = seasonOf(searchParams.get('season'))
    if (!season) {
      return NextResponse.json(
        { error: 'اختار موسم صحيح (صيفي أو شتوي) — «طوال السنة» مالوش إغلاق' },
        { status: 400 },
      )
    }
    const label = SEASON_LABELS[season]

    if (mode === 'open') {
      // أصناف الموسم اللي عليها مخزون في المخزن الداخلي (المعروض أقل من الإجمالي)
      const rows = await sql<
        {
          id: number
          name: string
          quantity: number
          displayQty: number
          warehouseQty: number
          variantCount: number
        }[]
      >`
        SELECT p."id", p."name", p."quantity", p."displayQty",
               ROUND((p."quantity" - p."displayQty")::numeric, 3)::float8 AS "warehouseQty",
               (SELECT COUNT(*)::int FROM "ProductVariant" v WHERE v."productId" = p."id") AS "variantCount"
        FROM "Product" p
        WHERE p."tenantId" = ${s.tenantId} AND p."active" = true AND p."season" = ${season}
          AND (p."quantity" - p."displayQty") > 0
        ORDER BY p."name" ASC
        LIMIT ${MAX_OPEN_ITEMS}`
      return NextResponse.json({ season, label, items: rows })
    }

    // 🧠 للملخص الذكي: هل الموسم التاني مقفول برضه؟ (تحذير جوا المعالج) + ملخص الإغلاق — بالتوازي
    const [trows, rows] = await Promise.all([
      sql<{ closedSeasons: string | null }[]>`
        SELECT "closedSeasons" FROM "Tenant" WHERE "id" = ${s.tenantId} LIMIT 1`,
      // ملخص الإغلاق: كام منتج معروض من الموسم ده + كام قطعة + قيمتها بالتكلفة
      sql<{ products: number; pieces: number; value: number }[]>`
        SELECT COUNT(*)::int AS products,
               COALESCE(SUM("displayQty"), 0)::float8 AS pieces,
               COALESCE(SUM("displayQty" * "cost"), 0)::float8 AS value
        FROM "Product"
        WHERE "tenantId" = ${s.tenantId} AND "active" = true AND "season" = ${season}
          AND "displayQty" > 0`,
    ])
    const closedNow = parseClosedSeasons(trows[0]?.closedSeasons)
    const otherSeasonClosed = closedNow.includes(season === 'SUMMER' ? 'WINTER' : 'SUMMER')
    return NextResponse.json({ season, label, otherSeasonClosed, ...rows[0] })
  })
}

async function __POST(req: NextRequest) {
  return withSql(async (sql: Sql) => {
    let s
    try {
      s = await requireFashionSession()
      await requireAdmin()
      await requireModule(s, 'inventory')
    } catch (e) {
      const g = featureGuard(e)
      if (g) return NextResponse.json(g.body, { status: g.status })
      throw e
    }

    const body = await req.json().catch(() => null)
    const action = body?.action === 'open' ? 'open' : body?.action === 'close' ? 'close' : null
    if (!action) return NextResponse.json({ error: 'action لازم يكون close أو open' }, { status: 400 })
    const season = seasonOf(body?.season)
    if (!season) {
      return NextResponse.json(
        { error: 'اختار موسم صحيح (صيفي أو شتوي) — «طوال السنة» مالوش إغلاق' },
        { status: 400 },
      )
    }
    const label = SEASON_LABELS[season]
    const ctx = { tenantId: s.tenantId, userId: s.userId ?? null, season, label }

    // 🛡️ أخطاء التحقق (400/404/409 متعمدة) لازم تطلع للعميل بنفس المعنى — SeasonError.status
    let result: { products: number; pieces: number }
    try {
      if (action === 'close') {
        result = await closeSeasonBulk(sql, ctx)
      } else {
        const items = Array.isArray(body?.items) ? body.items : []
        if (items.length === 0) {
          return NextResponse.json({ error: 'حدّد الأصناف والكميات اللي هتترجع للعرض' }, { status: 400 })
        }
        result = await openSeasonBulk(sql, ctx, items.slice(0, MAX_OPEN_ITEMS))
      }
    } catch (e) {
      const g = featureGuard(e)
      if (g) return NextResponse.json(g.body, { status: g.status })
      throw e
    }

    // ⚡ مسح الكاش — الكتالوج وقايمة المخزون (المعروض اتغير)
    // (purgeCatalogCaches بيمسح productsInventory بالفعل — كان بيتمسح مرتين)
    await purgeCatalogCaches(s.tenantId, s.branchId).catch(() => {})

    return NextResponse.json({
      ok: true,
      action,
      season,
      label,
      products: result.products,
      pieces: result.pieces,
      message:
        action === 'close'
          ? `اتقفل موسم ${label}: ${result.products} صنف و ${result.pieces} قطعة دخلت المخزن الداخلي`
          : `اتفتح موسم ${label}: ${result.products} صنف و ${result.pieces} قطعة رجعت للعرض`,
    })
  })
}

export async function GET(req: NextRequest) {
  return applySecurityHeaders(await __GET(req))
}

export async function POST(req: NextRequest) {
  return applySecurityHeaders(await __POST(req))
}
