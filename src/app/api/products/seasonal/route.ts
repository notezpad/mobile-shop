import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { purgeCatalogCaches, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { withSql, type Sql } from '@/lib/sql'
import {
  SEASON_LABELS,
  WAREHOUSE_IN,
  WAREHOUSE_OUT,
  canUseSeasonal,
  isSeasonValue,
  roundQty,
  type SeasonValue,
} from '@/lib/seasonal'

export const dynamic = 'force-dynamic'

/**
 * 👕 2026-10-22 — «المخزن الداخلي» للمواسم (باقات الملابس فقط).
 *
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
 */

async function requireFashionSession() {
  const s = await requireAuth()
  const plan = await db.$queryRaw<{ businessType: string }[]>`
    SELECT p."businessType" FROM "Subscription" sub
    JOIN "Plan" p ON p."id" = sub."planId"
    WHERE sub."tenantId" = ${s.tenantId} AND sub."status" = 'active'
    ORDER BY sub."endDate" DESC LIMIT 1`
  const businessType = plan[0]?.businessType ?? 'electronics'
  if (!canUseSeasonal(businessType)) {
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
  let s
  try {
    s = await requireFashionSession()
  } catch (e) {
    const g = featureGuard(e)
    if (g) return NextResponse.json(g.body, { status: g.status })
    throw e
  }
  try {
    await requireModule(s, 'inventory')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }
  return withSql(async (sql: Sql) => {
    const { searchParams } = new URL(req.url)
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
        LIMIT 500`
      return NextResponse.json({ season, label, items: rows })
    }

    // ملخص الإغلاق: كام منتج معروض من الموسم ده + كام قطعة + قيمتها بالتكلفة
    const rows = await sql<{ products: number; pieces: number; value: number }[]>`
      SELECT COUNT(*)::int AS products,
             COALESCE(SUM("displayQty"), 0)::float8 AS pieces,
             COALESCE(SUM("displayQty" * "cost"), 0)::float8 AS value
      FROM "Product"
      WHERE "tenantId" = ${s.tenantId} AND "active" = true AND "season" = ${season}
        AND "displayQty" > 0`
    return NextResponse.json({ season, label, ...rows[0] })
  })
}

async function __POST(req: NextRequest) {
  let s
  try {
    s = await requireFashionSession()
    await requireAdmin()
  } catch (e) {
    const g = featureGuard(e)
    if (g) return NextResponse.json(g.body, { status: g.status })
    throw e
  }
  try {
    await requireModule(s, 'inventory')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
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

  // 🛡️ أخطاء المعاملة (400/404/409 متعمدة جواها) لازم تطلع للعميل بنفس المعنى —
  // من غير اللف ده أي رفض مُتحقَّق منه كان هيطلع 500 غامض.
  let result: {
    action: string
    label: string
    products: number
    pieces: number
    moved: { id: number; name: string; qty: number }[]
  }
  try {
    result = await db.$transaction(
    async (tx) => {
      if (action === 'close') {
        // ── إغلاق الموسم: كل المعروض من أصناف الموسم بيدخل المخزن الداخلي ──
        // FOR UPDATE = حماية من بيع متوازي أثناء الترحيل (قفل على الصفوف)
        const products = await tx.$queryRaw<
          {
            id: number
            name: string
            branchId: number | null
            displayQty: number
            variantCount: number
          }[]
        >`
          SELECT p."id", p."name", p."branchId", p."displayQty",
                 (SELECT COUNT(*)::int FROM "ProductVariant" v WHERE v."productId" = p."id") AS "variantCount"
          FROM "Product" p
          WHERE p."tenantId" = ${s.tenantId} AND p."active" = true AND p."season" = ${season}
            AND p."displayQty" > 0
          ORDER BY p."id"
          FOR UPDATE`

        let pieces = 0
        const moved: { id: number; name: string; qty: number }[] = []
        for (const p of products) {
          const qty = roundQty(p.displayQty)
          if (qty <= 0) continue
          if (p.variantCount > 0) {
            // منتج بمقاسات: المعروض على مستوى المقاسات — بنصفّرهم كلهم مع المنتج
            await tx.$executeRaw`
              UPDATE "ProductVariant" SET "displayQty" = 0 WHERE "productId" = ${p.id} AND "displayQty" > 0`
          }
          await tx.$executeRaw`
            UPDATE "Product" SET "displayQty" = 0 WHERE "id" = ${p.id} AND "displayQty" > 0`
          // 🧾 حركة موقع (مش حركة مال): الكمية دخلت المخزن الداخلي — موجبة زي transfer_in
          await tx.stockMovement.create({
            data: {
              tenantId: s.tenantId,
              branchId: p.branchId,
              productId: p.id,
              type: WAREHOUSE_IN,
              quantity: qty,
              refType: 'season',
              note: `إغلاق الموسم (${label}) — نقل ${qty} للمخزن الداخلي`,
              userId: s.userId,
            },
          })
          pieces += qty
          moved.push({ id: p.id, name: p.name, qty })
        }
        return { action, label, products: moved.length, pieces: roundQty(pieces), moved }
      }

      // ── فتح الموسم: إرجاع كميات محددة للعرض ──
      const items = Array.isArray(body?.items) ? body.items : []
      if (items.length === 0) {
        const err = new Error('حدّد الأصناف والكميات اللي هتترجع للعرض') as Error & { status?: number }
        err.status = 400
        throw err
      }
      const opened: { id: number; name: string; qty: number }[] = []
      let pieces = 0
      for (const raw of items.slice(0, 500)) {
        const pid = parseInt(String(raw?.productId ?? ''), 10)
        const qty = roundQty(Number(raw?.qty) || 0)
        if (!pid || qty <= 0) {
          const err = new Error('كمية غير صالحة لأحد الأصناف') as Error & { status?: number }
          err.status = 400
          throw err
        }
        const p = await tx.product.findFirst({
          where: { id: pid, tenantId: s.tenantId },
          select: {
            id: true,
            name: true,
            branchId: true,
            quantity: true,
            displayQty: true,
            active: true,
          },
        })
        if (!p || !p.active) {
          const err = new Error('منتج غير موجود أو موقوف') as Error & { status?: number }
          err.status = 404
          throw err
        }
        const whQty = roundQty(p.quantity - p.displayQty)
        if (qty > whQty + 1e-9) {
          const err = new Error(
            `الكمية المطلوبة من «${p.name}» أكبر من اللي في المخزن الداخلي (المتاح: ${whQty})`,
          ) as Error & { status?: number }
          err.status = 400
          throw err
        }
        const variantCount = await tx.productVariant.count({ where: { productId: p.id } })
        if (variantCount > 0) {
          // منتج بمقاسات: الفتح كله أو لا شيء (كمية الطلب = كل اللي في المخزن)
          if (Math.abs(qty - whQty) > 1e-9) {
            const err = new Error(
              `«${p.name}» له ألوان ومقاسات — بيتفتح كامل (${whQty}) أو مش بيتفتح`,
            ) as Error & { status?: number }
            err.status = 400
            throw err
          }
          await tx.$executeRaw`
            UPDATE "ProductVariant" SET "displayQty" = "quantity" WHERE "productId" = ${p.id}`
          await tx.$executeRaw`
            UPDATE "Product" SET "displayQty" = "quantity" WHERE "id" = ${p.id}`
        } else {
          // ⚛️ شرط ذري: مفيش حد تاني حرك المخزون بين الفحص والتحديث
          const upd = await tx.$executeRaw`
            UPDATE "Product"
            SET "displayQty" = "displayQty" + ${qty}
            WHERE "id" = ${p.id} AND ("quantity" - "displayQty") >= ${qty}`
          if (upd !== 1) {
            const err = new Error(
              `الكمية اتغيّرت أثناء العملية لـ«${p.name}» — حدّث الشاشة وحاول تاني`,
            ) as Error & { status?: number }
            err.status = 409
            throw err
          }
        }
        await tx.stockMovement.create({
          data: {
            tenantId: s.tenantId,
            branchId: p.branchId,
            productId: p.id,
            type: WAREHOUSE_OUT,
            quantity: qty,
            refType: 'season',
            note: `فتح الموسم (${label}) — إرجاع ${qty} للعرض`,
            userId: s.userId,
          },
        })
        pieces += qty
        opened.push({ id: p.id, name: p.name, qty })
      }
      return { action, label, products: opened.length, pieces: roundQty(pieces), moved: opened }
    },
    { timeout: 60_000, maxWait: 15_000 },
    )
  } catch (e) {
    const g = featureGuard(e)
    if (g) return NextResponse.json(g.body, { status: g.status })
    throw e
  }

  // ⚡ مسح الكاش — الكتالوج وقايمة المخزون (المعروض اتغير)
  await purgeCatalogCaches(s.tenantId, s.branchId).catch(() => {})
  await purgeEdgeCache([PURGE_KEYS.productsInventory(s.branchId)], s.tenantId, '3').catch(() => {})

  return NextResponse.json({
    ok: true,
    action: result.action,
    season,
    label: result.label,
    products: result.products,
    pieces: result.pieces,
    message:
      result.action === 'close'
        ? `اتقفل موسم ${result.label}: ${result.products} صنف و ${result.pieces} قطعة دخلت المخزن الداخلي`
        : `اتفتح موسم ${result.label}: ${result.products} صنف و ${result.pieces} قطعة رجعت للعرض`,
  })
}

export async function GET(req: NextRequest) {
  return withDb(async () => __GET(req))
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
