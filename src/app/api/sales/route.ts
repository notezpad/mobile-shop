import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'
import { deductStock } from '@/lib/deduct-stock'

export const dynamic = 'force-dynamic'

async function nextInvoiceNo(
  prefix: string,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear()
  // Read only the latest invoice number (uses the index) instead of counting
  // every invoice of the year; avoids duplicate numbers after deletions.
  const start = `${prefix}-${year}-`
  const last = await db.sale.findFirst({
    where: { tenantId, invoiceNo: { startsWith: start } },
    orderBy: { id: 'desc' },
    select: { invoiceNo: true },
  })
  const lastSeq = last?.invoiceNo ? parseInt(last.invoiceNo.slice(start.length), 10) || 0 : 0
  const seq = (lastSeq + 1).toString().padStart(5, '0')
  return `${prefix}-${year}-${seq}`
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  return withDb(async () => {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const tzOffset = parseInt(searchParams.get('tzOffset') ?? '0', 10)

    function localDateToUTC(dateStr: string, time: string, offsetMinutes: number): Date {
      const utcMs = new Date(`${dateStr}T${time}Z`).getTime()
      return new Date(utcMs + offsetMinutes * 60 * 1000)
    }

    const createdAt: { gte?: Date; lte?: Date } = {}
    if (from) createdAt.gte = localDateToUTC(from, '00:00:00.000', tzOffset)
    if (to)   createdAt.lte = localDateToUTC(to,   '23:59:59.999', tzOffset)

    const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
    const skip  = (page - 1) * limit

    const where = {
      tenantId: session.tenantId,
      ...(from || to ? { createdAt } : {}),
    }

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        orderBy: { id: 'desc' },
        include: { items: true, customer: true },
        skip,
        take: limit,
      }),
      db.sale.count({ where }),
    ])

    const userIds = [...new Set(sales.map((s) => s.userId).filter(Boolean))] as string[]
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []
    const userNameById = new Map(users.map((u) => [u.id, u.name]))
    const result = sales.map((s) => ({
      ...s,
      userName: s.userId ? (userNameById.get(s.userId) ?? null) : null,
    }))
    return NextResponse.json({
      data: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  })
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: 'السلة فارغة' },
      { status: 400 }
    )
  }
  const paid = Number(body.paid ?? 0) || 0
  let customerId: number | null = null
  if (body.customerId) {
    customerId = parseInt(body.customerId, 10) || null
  }

  return withDb(async () => {
    // load products scoped to tenant
    const ids = body.items
      .map((i: any) => parseInt(i.productId, 10))
      .filter((n: number) => !isNaN(n))

    // FIXED: Collect all unitIds first, then batch-fetch in ONE query instead of
    // one db.productUnit.findUnique per cart item (N+1 problem)
    const unitIds = body.items
      .map((i: any) => i.unitId ? parseInt(i.unitId, 10) : null)
      .filter((id: number | null): id is number => id !== null && !isNaN(id))

    // FIXED: same batch pattern as units — collect variant ids referenced by
    // the cart, then load them all in ONE query instead of one lookup per item.
    const variantIds = body.items
      .map((i: any) => i.variantId ? parseInt(i.variantId, 10) : null)
      .filter((id: number | null): id is number => id !== null && !isNaN(id))

    // FIXED: تعريف نوع صريح لـ ProductUnit مطابق لموديل prisma/schema.prisma.
    // السبب: في هذه البيئة، Prisma Client المولّد (node_modules/.prisma/client)
    // كان مجرد stub فارغ (بدون تشغيل `prisma generate` بنجاح)، فكانت كل
    // استدعاءات db.productUnit.* تُستنتَج كنوع {} بدون خصائص، فيفشل الوصول
    // إلى unit.productId / unit.name / unit.factor. تعريف الشكل هنا صراحةً
    // يفصل نوع البيانات المستخدمة في هذا الملف عن جودة توليد Prisma Client،
    // ولا يغيّر أي سلوك وقت التشغيل (نفس الاستعلام بالظبط).
    type ProductUnitRow = {
      id: number
      productId: number
      name: string
      price: number | null
      barcode: string | null
      factor: number
      active: boolean
      createdAt: Date
    }

    // Same reasoning as ProductUnitRow above — explicit shape so this file's
    // typing doesn't depend on how well `prisma generate` ran in this sandbox.
    type ProductVariantRow = {
      id: number
      productId: number
      size: string | null
      color: string | null
      barcode: string | null
      quantity: number
      createdAt: Date
    }

    const [products, units, variants, customerCheck, tenant] = await Promise.all([
      db.product.findMany({
        where: { id: { in: ids }, tenantId: session.tenantId },
      }),
      // FIXED: batch-load all units needed in ONE query
      (unitIds.length > 0
        ? db.productUnit.findMany({ where: { id: { in: unitIds } } })
        : Promise.resolve([])) as Promise<ProductUnitRow[]>,
      // batch-load all variants (colors/sizes) referenced by the cart in ONE query
      (variantIds.length > 0
        ? db.productVariant.findMany({ where: { id: { in: variantIds } } })
        : Promise.resolve([])) as Promise<ProductVariantRow[]>,
      // FIXED: validate customer in parallel with products, not sequentially after
      customerId
        ? db.customer.findUnique({ where: { id: customerId } })
        : Promise.resolve(null),
      // FIXED: load tenant prefix in parallel instead of after everything else
      db.tenant.findUnique({
        where: { id: session.tenantId },
        select: { invoicePrefix: true },
      }),
    ])

    // validate customer
    if (customerId) {
      if (!customerCheck || customerCheck.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'العميل غير صالح' }, { status: 400 })
      }
    }

    const productMap = new Map<number, (typeof products)[number]>(products.map((p) => [p.id, p]))
    const unitMap = new Map(units.map((u) => [u.id, u]))
    const variantMap = new Map(variants.map((v) => [v.id, v]))

    // Pre-check capability if any item references a unitId.
    const hasUnits = body.items.some((i: any) => i.unitId)
    if (hasUnits) {
      try {
        await requireCapability(session, 'multi_unit')
      } catch (e) {
        const fErr = featureErrorResponse(e)
        if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
        throw e
      }
    }
    const hasVariants = body.items.some((i: any) => i.variantId)
    if (hasVariants) {
      try {
        await requireCapability(session, 'variants')
      } catch (e) {
        const fErr = featureErrorResponse(e)
        if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
        throw e
      }
    }

    let total = 0

    const itemsData: Array<{
      productId: number
      name: string
      price: number
      cost: number
      quantity: number
      unitsEntered: number
      unitId: number | null
      unitLabel: string | null
      unitQuantity: number | null
      variantId: number | null
    }> = []

    for (const it of body.items) {
      const p = productMap.get(parseInt(it.productId, 10))
      if (!p) {
        return NextResponse.json({ error: 'منتج غير موجود في السلة' }, { status: 400 })
      }
      const qty = parseInt(it.quantity, 10)
      if (!qty || qty <= 0) {
        return NextResponse.json({ error: `كمية غير صالحة للمنتج ${p.name}` }, { status: 400 })
      }

      let unitId: number | null = null
      let unitLabel: string | null = null
      let unitQuantity: number | null = null
      let totalPieces = qty
      let unitFactor = 1
      let variantId: number | null = null

      // If this line is a specific color/size, validate it and use ITS stock
      // as the ceiling — not the product's aggregate quantity. Selling a
      // variant no longer touches Product.quantity directly (see deductStock).
      if (it.variantId) {
        const vid = parseInt(it.variantId, 10)
        const variant = variantMap.get(vid)
        if (!variant || variant.productId !== p.id) {
          return NextResponse.json(
            { error: `متغير (لون/مقاس) غير صالح للمنتج ${p.name}` },
            { status: 400 }
          )
        }
        variantId = variant.id
      }

      if (it.unitId) {
        const uid = parseInt(it.unitId, 10)
        // FIXED: use pre-loaded unitMap instead of await db.productUnit.findUnique per item
        const unit = unitMap.get(uid)
        if (!unit || unit.productId !== p.id) {
          return NextResponse.json(
            { error: `وحدة بيع غير صالحة للمنتج ${p.name}` },
            { status: 400 }
          )
        }
        unitId = unit.id
        unitLabel = unit.name
        unitQuantity = qty
        unitFactor = unit.factor
        totalPieces = unit.factor * qty
      }

      const stockCeiling = variantId != null ? (variantMap.get(variantId)!.quantity) : p.quantity
      if (totalPieces > stockCeiling) {
        return NextResponse.json(
          { error: `الكمية المطلوبة من ${p.name} غير متوفرة (المتاح: ${stockCeiling})` },
          { status: 400 }
        )
      }

      const price = Number(it.price)
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: `سعر غير صالح للمنتج ${p.name}` }, { status: 400 })
      }
      total += price * qty

      const pricePerPiece = price / unitFactor

      itemsData.push({
        productId: p.id,
        name: p.name,
        price: pricePerPiece,
        cost: p.cost,
        quantity: totalPieces,
        unitsEntered: qty,
        unitId,
        unitLabel,
        unitQuantity,
        variantId,
      })
    }

    if (paid < total && !customerId) {
      return NextResponse.json(
        { error: 'البيع بالآجل لازم يكون مرتبط بعميل' },
        { status: 400 }
      )
    }

    const prefix = tenant?.invoicePrefix || 'INV'
    const invoiceNo = await nextInvoiceNo(prefix, session.tenantId)

    const sale = await db.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          tenantId: session.tenantId,
          branchId: session.branchId ?? null,
          invoiceNo,
          customerId,
          userId: session.userId,
          total,
          paid,
          status: 'مكتملة',
          items: {
            create: itemsData.map((i) => ({
              productId: i.productId,
              name: i.name,
              price: i.price,
              cost: i.cost,
              quantity: i.quantity,
              unitId: i.unitId,
              unitLabel: i.unitLabel,
              unitQuantity: i.unitQuantity,
              variantId: i.variantId,
            })),
          },
        },
        include: { items: { include: { variant: true } }, customer: true },
      })

      for (const it of itemsData) {
        await deductStock(tx, {
          tenantId: session.tenantId,
          branchId: session.branchId ?? null,
          userId: session.userId,
          productId: it.productId,
          quantity: it.unitsEntered,
          unitId: it.unitId,
          variantId: it.variantId,
          refType: 'sale',
          refId: created.id,
          note: `فاتورة ${invoiceNo}`,
        })
      }

      if (customerId && paid < total) {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: total - paid } },
        })
      }

      if (paid > 0) {
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: 'sale',
            refId: created.id,
            amount: paid,
            note: `بيع فاتورة ${invoiceNo}`,
            userId: session.userId,
          },
        })
      }

      return created
    }, { maxWait: 10000, timeout: 20000 }) // default 5s was too short over a remote DB → sale hung/failed

    return NextResponse.json(sale, { status: 201 })
  })
}
