import { cleanUnitLabel, guessUnitLabel } from '@/lib/unit-label'
import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { buildDefaultUnitsData } from '@/lib/default-units'
import { getPlanContext, assertWithinPlanLimit, featureErrorResponse, requireModule, requireModuleWritePermission } from '@/lib/features'
import { computeDynamicRetailPrice } from '@/lib/retail-pricing'
import { matchEdgeCache, putEdgeCache, purgeCatalogCaches } from '@/lib/edgeCache'
import { runNonBlocking, trackServerEvent, extractRequestContext } from '@/lib/tracking/server'
import { TRACKING_EVENTS } from '@/lib/tracking/types'
import { withSql, type Sql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): GET بقى SQL مباشر عبر postgres.js —
 * ده أثقل GET في التطبيق (بحث/فلترة/ترتيب/تجميع مباع/تسعير ديناميكي) وكان
 * بيشغّل Prisma wasm + 3-5 استعلامات في كل طلب. نفس المنطق ونفس شكل الرد
 * { data, total, page, limit, totalPages } بالظبط، بما فيها:
 *   - ILIKE للبحث في الاسم/الباركود (كان mode:'insensitive')
 *   - LIKE حساس الحروف للباركود بتاع المتغيرات (كان بدون mode)
 *   - نفس ترتيبات sort وlow-stock وsold
 *   - نفس كاش الحافة ومفاتيحه
 * POST فضل Prisma (عملية نادرة).
 */

/** Ensure a category row exists for the given name (auto-create feature) — tenant scoped. */
export async function ensureCategory(
  name: string | null | undefined,
  tenantId: string
): Promise<string | null> {
  if (!name || !name.trim()) return null
  const clean = name.trim()
  const existing = await db.category.findFirst({
    where: { tenantId, name: clean },
  })
  if (!existing) {
    await db.category.create({ data: { tenantId, name: clean } })
  }
  return clean
}

/** يبني شرط الـ WHERE المشترك (نفس where القديم حرفيًا) — مصفوفة fragments
 * (postgres.js 3.4: المصفوفة بتتربط بمسافات، فالـ AND جزء من كل شرط). */
function buildWhere(
  sql: Sql,
  tenantId: string,
  status: string,
  hasSessionBranch: boolean,
  sessionBranchId: number | null,
  branchIdParam: string | null,
  search: string,
  category: string,
) {
  const parts = [sql`"tenantId" = ${tenantId}`]
  if (status === 'active') parts.push(sql`AND "active" = true`)
  else if (status === 'inactive') parts.push(sql`AND "active" = false`)

  if (hasSessionBranch) {
    parts.push(sql`AND ("branchId" = ${sessionBranchId} OR "branchId" IS NULL)`)
  } else if (branchIdParam && branchIdParam !== 'all') {
    if (branchIdParam === 'none') parts.push(sql`AND "branchId" IS NULL`)
    else parts.push(sql`AND "branchId" = ${parseInt(branchIdParam, 10)}`)
  }

  if (search) {
    const pattern = `%${search}%`
    parts.push(sql`AND (
      "name" ILIKE ${pattern}
      OR "barcode" ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = "Product"."id" AND v."barcode" LIKE ${pattern})
    )`)
  }
  if (category && category !== 'all') {
    parts.push(sql`AND "category" = ${category}`)
  }
  return parts
}

function buildOrderBy(sql: Sql, sortKey: string) {
  switch (sortKey) {
    case 'name': return sql`"name" ASC, "id" DESC`
    case 'price_desc': return sql`"price" DESC, "id" DESC`
    case 'price_asc': return sql`"price" ASC, "id" DESC`
    case 'qty_asc': return sql`"quantity" ASC, "id" DESC`
    case 'qty_desc': return sql`"quantity" DESC, "id" DESC`
    default: return sql`"id" DESC`
  }
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

    // saleh-mowazaf: module 'products'
    try { requireModule(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    // 🔒 RBAC: رؤية التكاليف
    const canViewProfits = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.canViewProfits === true

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''
    const status = searchParams.get('status') || 'active'
    const branchIdParam = searchParams.get('branchId')

    const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
    const skip  = (page - 1) * limit

    const sortKey = searchParams.get('sort') || 'newest'
    const lowOnly = searchParams.get('stock') === 'low'
    const metaSlim = searchParams.get('meta') === 'slim'

    // ── كاش الحافة (نفس المفاتيح والشروط القديمة حرفيًا) ──
    const invCacheable =
      metaSlim &&
      !search &&
      !category &&
      status === 'all' &&
      sortKey === 'newest' &&
      !lowOnly
    const invQuery = `branch=${session.branchId ?? 0}&inv=1&page=${page}`
    if (invCacheable) {
      const invHit = await matchEdgeCache('/api/products', invQuery, session.tenantId, canViewProfits ? '4' : '4n')
      if (invHit) return invHit
    }

    const cacheable =
      !search &&
      !category &&
      !branchIdParam &&
      status === 'active' &&
      !searchParams.has('page') &&
      !searchParams.has('limit') &&
      !searchParams.has('sort') &&
      !searchParams.has('stock')
    const cacheQuery = `branch=${session.branchId ?? 0}`
    if (cacheable) {
      const hit = await matchEdgeCache('/api/products', cacheQuery, session.tenantId, canViewProfits ? '4' : '4n')
      if (hit) return hit
    }

    const orderBy = buildOrderBy(sql, sortKey)
    const where = buildWhere(
      sql, session.tenantId, status,
      Boolean(session.branchId), session.branchId, branchIdParam,
      search, category,
    )

    // ⚡ v10: في وضع slim (شاشة المخزون) plan context والتسعير مش محتاجين
    const [planCtxForGet, retailPricingTenant] = metaSlim
      ? [null as never, null as never]
      : await Promise.all([
          getPlanContext(session.tenantId),
          (async () => {
            const t = await sql<{ dynamicRetailPricingEnabled: boolean; defaultRetailMarginPercent: number }[]>`
              SELECT "dynamicRetailPricingEnabled", "defaultRetailMarginPercent"
              FROM "Tenant" WHERE "id" = ${session.tenantId} LIMIT 1`
            return t[0] ?? null
          })(),
        ])

    let products: any[]
    let total: number
    if (lowOnly || sortKey === 'sold') {
      // نفس منطق القديم: قائمة مختصرة (id/كميات) للفلترة والترتيب في الذاكرة،
      // وبعدين جلب صفوف الصفحة المطلوبة فقط.
      const slim = await sql<{ id: number; quantity: number; minQuantity: number }[]>`
        SELECT "id", "quantity", "minQuantity" FROM "Product"
        WHERE ${where} ORDER BY ${orderBy}`
      let ids = slim.filter((r) => !lowOnly || r.quantity <= r.minQuantity).map((r) => r.id)
      if (sortKey === 'sold' && ids.length > 0) {
        const agg = await sql<{ productId: number | null; sold: number }[]>`
          SELECT "productId", COALESCE(SUM("quantity"), 0)::float8 AS sold
          FROM "SaleItem"
          WHERE "productId" IN ${sql(ids)}
          GROUP BY "productId"`
        const sold = new Map(agg.filter((a) => a.productId != null).map((a) => [Number(a.productId), a.sold ?? 0]))
        const pos = new Map(ids.map((id, idx) => [id, idx]))
        ids = [...ids].sort((a, b) => (sold.get(b) ?? 0) - (sold.get(a) ?? 0) || (pos.get(a)! - pos.get(b)!))
      }
      total = ids.length
      const pageIds = ids.slice(skip, skip + limit)
      const rows = pageIds.length > 0
        ? await sql<any[]>`SELECT * FROM "Product" WHERE "id" IN ${sql(pageIds)}`
        : []
      const byId = new Map(rows.map((r) => [Number(r.id), r]))
      products = pageIds.map((id) => byId.get(id)).filter(Boolean) as any[]
    } else {
      const [rows, cnt] = await Promise.all([
        sql<any[]>`SELECT * FROM "Product" WHERE ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${skip}`,
        sql<{ cnt: number }[]>`SELECT COUNT(*)::int AS cnt FROM "Product" WHERE ${where}`,
      ])
      products = rows
      total = Number(cnt[0]?.cnt ?? 0)
    }

    // If the search term is an EXACT match for one of this product's variant
    // barcodes → matchedVariantId/Label (نفس سلوك القديم).
    let matchedVariantByProduct = new Map<number, { id: number; label: string }>()
    if (search && products.length > 0) {
      const matchingVariants = await sql<{ id: number; productId: number; size: string | null; color: string | null }[]>`
        SELECT "id", "productId", "size", "color" FROM "ProductVariant"
        WHERE "productId" IN ${sql(products.map((p) => p.id))} AND "barcode" = ${search}`
      matchedVariantByProduct = new Map(
        matchingVariants.map((v) => [
          Number(v.productId),
          { id: v.id, label: [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}` },
        ])
      )
    }

    // إجمالي عدد الوحدات المباعة لكل منتج (⚡ يتسكب في وضع slim — زي القديم)
    let soldMap = new Map<number, number>()
    if (products.length > 0 && !metaSlim) {
      const salesAgg = await sql<{ productId: number | null; sold: number }[]>`
        SELECT "productId", COALESCE(SUM("quantity"), 0)::float8 AS sold
        FROM "SaleItem"
        WHERE "productId" IN ${sql(products.map((p) => p.id))}
        GROUP BY "productId"`
      soldMap = new Map(salesAgg.filter((s) => s.productId != null).map((s) => [Number(s.productId), s.sold ?? 0]))
    }

    const withSales = products.map((p) => ({
      ...p,
      soldQuantity: soldMap.get(Number(p.id)) ?? 0,
      matchedVariantId: matchedVariantByProduct.get(Number(p.id))?.id ?? null,
      matchedVariantLabel: matchedVariantByProduct.get(Number(p.id))?.label ?? null,
      dynamicRetailPrice: metaSlim
        ? null
        : planCtxForGet.capabilities.includes('dynamic_retail_pricing') && retailPricingTenant
          ? computeDynamicRetailPrice(p, retailPricingTenant)
          : null,
    }))

    // 🔒 RBAC: نخفي حقل التكلفة لمن لا يملك صلاحية رؤية الأرباح
    const withSalesSanitized = canViewProfits
      ? withSales
      : withSales.map(({ cost: _c, ...p }: any) => ({ ...p, cost: null }))

    const listRes = NextResponse.json({
      data: withSalesSanitized,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
    if (invCacheable) {
      await putEdgeCache(listRes.clone(), '/api/products', invQuery, session.tenantId, 20, canViewProfits ? '4' : '4n')
    } else if (cacheable) {
      await putEdgeCache(listRes.clone(), '/api/products', cacheQuery, session.tenantId, 20, canViewProfits ? '4' : '4n')
    }
    return listRes
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

    // saleh-kateb-mowazaf: module 'products'
    try { requireModuleWritePermission(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }
    // 🛡️ 2026-10-10 FIX: فحص حد المنتجات (maxProducts)
    try {
      await assertWithinPlanLimit(session, 'products')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
    }
    const name = String(body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
    }
    const price = Number(body.price)
    if (isNaN(price) || price < 0) {
      return NextResponse.json({ error: 'سعر البيع غير صالح' }, { status: 400 })
    }
    // auto-create category inline if it doesn't exist
    let category: string | null = null
    if (body.category && String(body.category).trim()) {
      category = await ensureCategory(String(body.category), session.tenantId)
    }
    const barcode = body.barcode ? String(body.barcode).trim() || null : null
    // ensure unique barcode (treat empty as null)
    if (barcode) {
      // 🏬 2026-10-18: الباركود فريد جوه (المحل + الفرع) — نفس الباركود مسموح في فرع تاني
      const targetBranch = session.branchId ?? (body.branchId ? parseInt(body.branchId, 10) : null)
      const exists = await db.product.findFirst({
        where: { tenantId: session.tenantId, barcode, branchId: targetBranch || null },
        select: { id: true },
      })
      if (exists) {
        return NextResponse.json(
          { error: 'الباركود مستخدم بالفعل' },
          { status: 400 }
        )
      }
    }
    const planCtx = await getPlanContext(session.tenantId)
    const created = await db.product.create({
      data: {
        tenantId: session.tenantId,
        name,
        category,
        barcode,
        price,
        cost: Number(body.cost ?? 0) || 0,
        quantity: Math.round((Number(body.quantity ?? 0) || 0) * 1000) / 1000,
        minQuantity: Math.round((Number(body.minQuantity ?? 1) || 0) * 100) / 100 || 1,
        soldByWeight:
          planCtx.businessType === 'food' &&
          (body.soldByWeight === true || body.soldByWeight === 'true'),
        unitLabel:
          planCtx.businessType === 'food' &&
          !(body.soldByWeight === true || body.soldByWeight === 'true')
            ? body.unitLabel === undefined
              ? guessUnitLabel(name)
              : cleanUnitLabel(body.unitLabel)
            : null,
        imagePath: body.imagePath ? String(body.imagePath) : null,
        branchId: session.branchId ?? (body.branchId ? parseInt(body.branchId, 10) : null),
        collection: body.collection ? String(body.collection).trim() || null : null,
        retailMarginPercent:
          planCtx.capabilities.includes('dynamic_retail_pricing') &&
          body.retailMarginPercent !== undefined &&
          body.retailMarginPercent !== null &&
          body.retailMarginPercent !== ''
            ? Number(body.retailMarginPercent)
            : null,
      },
    })
    // 🛡️ إنشاء الوحدات تلقائياً (باقة multi_unit احترافية — غذائية مستثناة)
    if (planCtx.capabilities.includes('multi_unit') && planCtx.businessType !== 'food') {
      try {
        await db.productUnit.createMany({
          data: buildDefaultUnitsData(created.id, price),
        })
      } catch {
        // تجاهل إذا كانت الوحدات موجودة مسبقاً لأي سبب
      }
    }
    // stock in movement on initial quantity
    const initialQty = Math.round((Number(body.quantity ?? 0) || 0) * 1000) / 1000
    if (initialQty > 0) {
      await db.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: created.branchId,
          productId: created.id,
          type: 'in',
          quantity: initialQty,
          refType: 'manual',
          note: 'رصيد افتتاحي',
          userId: session.userId,
        },
      })
    }
    // ⚡ v9: مسح كاش الكتالوج فوراً بعد إضافة منتج
    await purgeCatalogCaches(session.tenantId, session.branchId)

    // 📊 أول منتج للمحل → حدث AddedFirstProduct (لا يوقف إضافة المنتج أبداً)
    if (session.role !== 'SUPER_ADMIN') {
      try {
        const total = await db.product.count({ where: { tenantId: session.tenantId } })
        if (total === 1) {
          const reqCtx = extractRequestContext(req.headers)
          const parts = (session.name || '').trim().split(/\s+/)
          runNonBlocking(() => trackServerEvent({
            eventName: TRACKING_EVENTS.AddedFirstProduct,
            eventId: `first-product-${session.tenantId}`,
            params: { contentType: 'product' },
            context: {
              ...reqCtx,
              email: session.email,
              firstName: parts[0] || undefined,
              lastName: parts.slice(1).join(' ') || undefined,
              externalId: session.userId,
            },
          }))
        }
      } catch { /* التتبع لا يوقف إضافة المنتج أبداً */ }
    }
    return NextResponse.json(created, { status: 201 })
  })
}
