import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'
import { deductStock } from '@/lib/deduct-stock'
import { getTenantTimezone, localDateStrToUtcBounds, dateStrInTz } from '@/lib/tenantTime'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-09-30: توليد رقم الفاتورة جوه الـ transaction نفسه.
 *
 * المشكلة: الرقم كان بيتحسب بره الـ transaction (قراءة أعلى رقم ثم كتابة)،
 * فكاشيرين بيفطوا في نفس اللحظة بيقرّوا نفس الرقم ويتكتب مرتين (تكرار).
 * الحل: القراءة جوه الـ tx + فهرس فريد `@@unique([tenantId, invoiceNo])`
 * في الداتابيز كضمانة أخيرة — لو حصل تضارب، الـ POST بيعيد المحاولة
 * برقم جديد (retry على P2002). والسنة دلوقتي بتوقيت المحل (Tenant.timezone)
 * مش توقيت السيرفر.
 */
async function nextInvoiceNo(
  prefix: string,
  tenantId: string,
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const start = `${prefix}-${year}-`
  // Read only the latest invoice number (uses the index) instead of counting
  // every invoice of the year; avoids duplicate numbers after deletions.
  const last = await tx.sale.findFirst({
    where: { tenantId, invoiceNo: { startsWith: start } },
    orderBy: { id: 'desc' },
    select: { invoiceNo: true },
  })
  const lastSeq = last?.invoiceNo ? parseInt(last.invoiceNo.slice(start.length), 10) || 0 : 0
  const seq = (lastSeq + 1).toString().padStart(5, '0')
  return `${start}${seq}`
}

export async function GET(req: NextRequest) {
  let session: Session
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

    // 🕐 ROOT FIX (2026-09-27): "from"/"to" used to be resolved with the
    // *browser's* tzOffset — which meant two employees of the SAME shop,
    // opening this page from different devices/countries, would see
    // different sales for "today". A shop has ONE local day, so we now
    // resolve it from the tenant's own stored timezone instead (see
    // src/lib/tenantTime.ts) — consistent for everyone looking at this
    // shop's data, and correct through DST changes.
    const createdAt: { gte?: Date; lte?: Date } = {}
    if (from || to) {
      const tz = await getTenantTimezone(session.tenantId)
      if (from) createdAt.gte = localDateStrToUtcBounds(from, 'start', tz)
      if (to)   createdAt.lte = localDateStrToUtcBounds(to, 'end', tz)
    }

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
  let session: Session
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
  // 🛡️ 2026-09-30 (C4): paid سالب كان بيزوّد دين العميل بمقداره ويخصم الخزنة — مرفوض.
  if (!Number.isFinite(paid) || paid < 0) {
    return NextResponse.json({ error: 'المبلغ المدفوع غير صالح' }, { status: 400 })
  }
  // 🛡️ 2026-09-30 (C12): طريقة دفع مبلغ البيع — زي أمر الشراء بالظبط،
  // عشان الخزنة تتفصل كاش / محافظ / انستاباي على أكبر تدفق فلوس في النظام.
  const SALE_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])
  const paymentMethod = body.paymentMethod === undefined || body.paymentMethod === null || body.paymentMethod === ''
    ? 'cash'
    : String(body.paymentMethod)
  if (!SALE_METHODS.has(paymentMethod)) {
    return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
  }
  // 🛡️ 2026-09-30 (M10): تاريخ استحقاق اختياري للفاتورة الآجلة.
  let dueDate: Date | null = null
  if (body.dueDate) {
    const d = new Date(body.dueDate)
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: 'تاريخ الاستحقاق غير صالح' }, { status: 400 })
    }
    dueDate = d
  }
  // 🛡️ 2026-09-30 (M7): مفتاح عدم التكرار للأوفلاين — retry لنفس الفاتورة بيرجّع
  // الفاتورة الأصلية بدل ما يعمل خصم مخزن وخزنة ودين مكرر.
  const clientRef = body.clientRef ? String(body.clientRef).slice(0, 64) : null
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

    // 🛡️ 2026-09-30 (C5 — قرار تجاري: ترفض): مدفوع أكبر من الإجمالي مرفوض.
    // قبل كده الفرق كان بيضيع من الحسابات (بيخلش الخزنة ومفيش رصيد دائن للعميل).
    if (paid > total + 0.005) {
      return NextResponse.json(
        { error: `المدفوع (${paid}) أكبر من إجمالي الفاتورة (${Math.round(total * 100) / 100}) — لو العميل دفع زيادة سجلها دفعة على حسابه` },
        { status: 400 }
      )
    }

    // 🛡️ 2026-09-30 (M10): الحد الائتماني — لو العميل متحدد له حد وبيع آجل
    // هيعديه، البيع يترفض (بدون فرض ولا استثناء تلقائي).
    if (customerId && paid < total && customerCheck?.creditLimit != null) {
      const projected = (customerCheck.balance ?? 0) + (total - paid)
      if (projected > customerCheck.creditLimit + 0.005) {
        return NextResponse.json(
          { error: `بيع آجل هيعدي الحد الائتماني للعميل ${customerCheck.name} (الحد: ${customerCheck.creditLimit}، الرصيد الحالي: ${customerCheck.balance}، إجمالي بعد البيع: ${Math.round(projected * 100) / 100})` },
          { status: 400 }
        )
      }
    }

    // 🛡️ 2026-09-30 (M7): idempotency — نفس clientRef؟ رجّع الفاتورة الأصلية.
    if (clientRef) {
      const existing = await db.sale.findUnique({
        where: { tenantId_clientRef: { tenantId: session.tenantId, clientRef } },
        include: { items: true, customer: true },
      })
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const prefix = tenant?.invoicePrefix || 'INV'
    // 🛡️ 2026-09-30: توليد الرقم جوه الـ tx + إعادة المحاولة عند التضارب
    const tz = await getTenantTimezone(session.tenantId)
    const invYear = parseInt(dateStrInTz(new Date(), tz).slice(0, 4), 10)

    let sale: Awaited<ReturnType<typeof createSaleTx>> | null = null
    const MAX_ATTEMPTS = 5
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        sale = await createSaleTx(prefix, invYear)
        break
      } catch (e: any) {
        // 🛡️ تضارب فريد متزامن: لو السبب clientRef (أوفلاين أرسل نفس الفاتورة
        // مرتين) → النسخة الأصلية اتحفظ بالفعل، رجّعها بدل إعادة المحاولة.
        if (e?.code === 'P2002' && clientRef) {
          const existing = await db.sale.findUnique({
            where: { tenantId_clientRef: { tenantId: session.tenantId, clientRef } },
            include: { items: true, customer: true },
          })
          if (existing) {
            return NextResponse.json(existing, { status: 200 })
          }
        }
        // تضارب في الرقم الفريد (فاتورة متزامنة معانا) → جرّب تاني برقم أعلى
        if (e?.code === 'P2002' && attempt < MAX_ATTEMPTS) continue
        throw e
      }
    }

    async function createSaleTx(prefix: string, year: number) {
      return db.$transaction(async (tx) => {
        const invoiceNo = await nextInvoiceNo(prefix, session.tenantId, tx, year)
        const created = await tx.sale.create({
          data: {
            tenantId: session.tenantId,
            branchId: session.branchId ?? null,
            invoiceNo,
            customerId,
            userId: session.userId,
            total,
            paid,
            paymentMethod,
            dueDate,
            clientRef,
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
          // 🛡️ 2026-09-30 (X2): كل بيع بيسجل حركة مخزون من نوع 'sale' — كان
          // دفتر الحركات طرف واحد (البيع أكبر حركة خروج ومفيش منها أي أثر).
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
          await tx.stockMovement.create({
            data: {
              tenantId: session.tenantId,
              branchId: session.branchId ?? null,
              productId: it.productId,
              type: 'sale',
              quantity: -it.quantity, // pieces (unit factor already applied)
              refType: 'sale',
              refId: created.id,
              note: `فاتورة ${invoiceNo} — ${it.name}`,
              userId: session.userId,
            },
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
              method: paymentMethod, // 🛡️ C12: الخزنة بتتفصل بطريقة الدفع
              note: `بيع فاتورة ${invoiceNo}`,
              userId: session.userId,
            },
          })
        }

        return created
      }, { maxWait: 10000, timeout: 20000 }) // default 5s was too short over a remote DB → sale hung/failed
    }

    // ⚡ EDGE CACHE purge (2026-10-06): البيع الجديد لازم يظهر فوراً في الداشبورد
    // وديون العملاء — بنمسح مفاتيح الكاش بلا انتظار الـ TTL
    await purgeEdgeCache(
      [
        PURGE_KEYS.customersDefault,
        PURGE_KEYS.dashboard(7),
        PURGE_KEYS.dashboard(14),
        PURGE_KEYS.dashboard(30),
        PURGE_KEYS.reportsBranches, // ⚡ v12: تقرير الفروع (صفحة الفروع) بيتغير مع كل بيعة
      ],
      session.tenantId,
      '2'
    )
    // ⚡ v9: البيع بيخصم مخزون — امسح كاش قائمة المنتجات كمان (نفس فرع البائع)
    // ⚡ v10: وكمان نسخة قائمة المخزون (شاشة المخزون) عشان الكميات تفضل حية
    await purgeEdgeCache(
      [PURGE_KEYS.products(session.branchId), PURGE_KEYS.productsInventory(session.branchId)],
      session.tenantId,
      '3'
    )
    return NextResponse.json(sale, { status: 201 })
  })
}
