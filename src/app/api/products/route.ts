import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { buildDefaultUnitsData } from '@/lib/default-units'
import { getPlanContext } from '@/lib/features'
import { computeDynamicRetailPrice } from '@/lib/retail-pricing'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: All handlers wrapped in `withDb` to reuse ONE PrismaClient
 * per request on Cloudflare Workers. Without this, every `db.*` call
 * creates a new TCP+TLS+auth connection (~200-500ms each).
 *
 * Product GET specifically makes 3 sequential queries (products + variants +
 * salesAgg groupBy) — without `withDb` that was 3 separate connections =
 * ~600-1500ms just from setup, plus query time.
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
    const category = searchParams.get('category')?.trim() || ''
    // status: 'active' (default — used by POS/purchasing so disabled products
    // can't be sold or re-ordered), 'inactive', or 'all' (used by the products
    // management screen so disabled products can still be reviewed/reactivated).
    const status = searchParams.get('status') || 'active'

    const where: any = { tenantId: session.tenantId, AND: [] as any[] }
    if (status === 'active') where.active = true
    else if (status === 'inactive') where.active = false
    const branchIdParam = searchParams.get('branchId')
    if (session.branchId) {
      where.AND.push({ OR: [{ branchId: session.branchId }, { branchId: null }] })
    } else if (branchIdParam && branchIdParam !== 'all') {
      if (branchIdParam === 'none') where.branchId = null
      else where.branchId = parseInt(branchIdParam, 10)
    }
    if (search) {
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
          // A scanned/typed code that belongs to a specific color/size (variant
          // barcode) must still surface the parent product here — otherwise
          // scanning a variant's own label at the POS finds nothing at all.
          { variants: { some: { barcode: { contains: search } } } },
        ],
      })
    }
    if (category && category !== 'all') {
      where.category = category
    }

    const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
    const skip  = (page - 1) * limit

    // ── Sorting + low-stock filter (Products management screen) ──
    // sort: newest (default) | name | price_desc | price_asc | qty_asc | qty_desc | sold
    // stock: 'low' → only products with quantity <= minQuantity (incl. out of stock)
    // Both are applied BEFORE pagination so page 2 continues the same ordering.
    const sortKey = searchParams.get('sort') || 'newest'
    const lowOnly = searchParams.get('stock') === 'low'
    const orderBy: any = (() => {
      switch (sortKey) {
        case 'name': return [{ name: 'asc' }, { id: 'desc' }]
        case 'price_desc': return [{ price: 'desc' }, { id: 'desc' }]
        case 'price_asc': return [{ price: 'asc' }, { id: 'desc' }]
        case 'qty_asc': return [{ quantity: 'asc' }, { id: 'desc' }]
        case 'qty_desc': return [{ quantity: 'desc' }, { id: 'desc' }]
        default: return [{ id: 'desc' }]
      }
    })()

    // 🛡️ 2026-10-03: نجيب plan context وبيانات التسعير بالتوازي.
    // الـ dynamicRetailPrice بيتحسب فقط لو الباقة فيها capability = dynamic_retail_pricing
    // (باقة احترافية). لو الباقة أساسية نرجّع null وبالتالي الـ POS هيستخدم p.price العادي.
    const [planCtxForGet, retailPricingTenant] = await Promise.all([
      getPlanContext(session.tenantId),
      db.tenant.findUnique({
        where: { id: session.tenantId },
        select: { dynamicRetailPricingEnabled: true, defaultRetailMarginPercent: true },
      }),
    ])

    let products: any[]
    let total: number
    if (lowOnly || sortKey === 'sold') {
      // Prisma can't compare two columns in `where` (quantity <= minQuantity) and
      // can't order by an aggregate, so the ordered id list is resolved in memory
      // (ids + 2 small columns only), then just the requested page is loaded.
      const slim = await db.product.findMany({
        where,
        orderBy,
        select: { id: true, quantity: true, minQuantity: true },
      })
      let ids = slim.filter((r) => !lowOnly || r.quantity <= r.minQuantity).map((r) => r.id)
      if (sortKey === 'sold' && ids.length > 0) {
        const agg = await db.saleItem.groupBy({
          by: ['productId'],
          where: { productId: { in: ids } },
          _sum: { quantity: true },
        })
        const sold = new Map(agg.filter((a) => a.productId != null).map((a) => [a.productId as number, a._sum.quantity ?? 0]))
        const pos = new Map(ids.map((id, idx) => [id, idx]))
        ids = [...ids].sort((a, b) => (sold.get(b) ?? 0) - (sold.get(a) ?? 0) || (pos.get(a)! - pos.get(b)!))
      }
      total = ids.length
      const pageIds = ids.slice(skip, skip + limit)
      const rows = pageIds.length > 0 ? await db.product.findMany({ where: { id: { in: pageIds } } }) : []
      const byId = new Map(rows.map((r) => [r.id, r]))
      products = pageIds.map((id) => byId.get(id)).filter(Boolean) as any[]
    } else {
      const [rows, count] = await Promise.all([
        db.product.findMany({ where, orderBy, skip, take: limit }),
        db.product.count({ where }),
      ])
      products = rows
      total = count
    }
    // If the search term is an EXACT match for one of this product's variant
    // barcodes (i.e. someone scanned a specific color/size's own label), tell
    // the client which variant that is so the POS can add that exact one
    // straight to the cart instead of asking the cashier to pick again.
    let matchedVariantByProduct = new Map<number, { id: number; label: string }>()
    if (search && products.length > 0) {
      const matchingVariants = await db.productVariant.findMany({
        where: { productId: { in: products.map((p) => p.id) }, barcode: search },
        select: { id: true, productId: true, size: true, color: true },
      })
      matchedVariantByProduct = new Map(
        matchingVariants.map((v) => [
          v.productId,
          { id: v.id, label: [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}` },
        ])
      )
    }

    // إجمالي عدد الوحدات المباعة لكل منتج (من عناصر الفواتير)
    // 🚀 Skip this expensive groupBy when there are no products returned
    // (e.g. filtered out, or tenant has no products yet) — saves a query.
    let soldMap = new Map<number, number>()
    if (products.length > 0) {
      const salesAgg = await db.saleItem.groupBy({
        by: ['productId'],
        where: { productId: { in: products.map((p) => p.id) } },
        _sum: { quantity: true },
      })
      soldMap = new Map(salesAgg.filter((s) => s.productId != null).map((s) => [s.productId as number, s._sum.quantity ?? 0]))
    }

    const withSales = products.map((p) => ({
      ...p,
      soldQuantity: soldMap.get(p.id) ?? 0,
      matchedVariantId: matchedVariantByProduct.get(p.id)?.id ?? null,
      matchedVariantLabel: matchedVariantByProduct.get(p.id)?.label ?? null,
      // 🛡️ 2026-10-03: Unit-Based Dynamic Pricing — باقة احترافية فقط.
      // الشرط مزدوج: الباقة لازم فيها capability = dynamic_retail_pricing
      // + التينانت لازم فعّل الميزة من الإعدادات.
      // لو أي شرط مش متحقق → null → الـ POS يستخدم p.price العادي.
      dynamicRetailPrice:
        planCtxForGet.capabilities.includes('dynamic_retail_pricing') && retailPricingTenant
          ? computeDynamicRetailPrice(p, retailPricingTenant)
          : null,
    }))

    return NextResponse.json({
      data: withSales,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
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
      const exists = await db.product.findUnique({ where: { barcode } })
      if (exists) {
        return NextResponse.json(
          { error: 'الباركود مستخدم بالفعل' },
          { status: 400 }
        )
      }
    }
    const created = await db.product.create({
      data: {
        tenantId: session.tenantId,
        name,
        category,
        barcode,
        price,
        cost: Number(body.cost ?? 0) || 0,
        quantity: parseInt(body.quantity ?? 0, 10) || 0,
        minQuantity: parseInt(body.minQuantity ?? 1, 10) || 1,
        imagePath: body.imagePath ? String(body.imagePath) : null,
        branchId: session.branchId ?? (body.branchId ? parseInt(body.branchId, 10) : null),
        collection: body.collection ? String(body.collection).trim() || null : null,
        // 🛡️ 2026-10-03: نسبة الهامش لكل منتج — باقة احترافية فقط.
        // لو الباقة مش فيها dynamic_retail_pricing نحفظ null حتى لو الـ
        // client بعت قيمة (UI مخفي، بس حماية السيرفر أهم).
        retailMarginPercent:
          planCtx.capabilities.includes('dynamic_retail_pricing') &&
          body.retailMarginPercent !== undefined &&
          body.retailMarginPercent !== null &&
          body.retailMarginPercent !== ''
            ? Number(body.retailMarginPercent)
            : null,
      },
    })
    // 🛡️ إنشاء الوحدات تلقائياً فور حفظ المنتج (ربع/نص/دستة/ونص دستة) —
    // بس لو الباقة فيها capability = multi_unit (احترافية فقط: electronics-pro
    // أو fashion-pro). قبل الإصلاح ده كانت الوحدات بتتعمل لكل منتج في أي باقة
    // (حتى الأساسية)، وده كان بيسيب وحدات جملة جاهزة بالسعر الصح في الداتابيز
    // لعملاء ملهومش الحق فيها أصلاً حسب باقتهم.
    // سعر كل وحدة = سعر البيع × factor. بدون تدخل يدوي.
    const planCtx = await getPlanContext(session.tenantId)
    if (planCtx.capabilities.includes('multi_unit')) {
      try {
        await db.productUnit.createMany({
          data: buildDefaultUnitsData(created.id, price),
        })
      } catch {
        // تجاهل إذا كانت الوحدات موجودة مسبقاً لأي سبب
      }
    }
    // stock in movement on initial quantity
    const initialQty = parseInt(body.quantity ?? 0, 10) || 0
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
    return NextResponse.json(created, { status: 201 })
  })
}
