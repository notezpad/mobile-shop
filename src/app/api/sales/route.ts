import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, localDateStrToUtcBounds, dateStrInTz } from '@/lib/tenantTime'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { withSql, isUniqueViolation } from '@/lib/sql'

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

export async function GET(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // 🔒 RBAC: رؤية التكاليف
  const canViewProfits = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.canViewProfits === true

  // ⚡ 2026-10-17 (الخطوتان 1 + 4): GET بقى SQL مباشر (postgres.js) + رد مخفّف
  // — كل فاتورة بترجع بالحقول اللي SalesHistoryView.tsx بتعرضها فعلًا فقط:
  //   Sale: id, invoiceNo, total, paid, status, createdAt, refunded, paymentMethod
  //   SaleItem: id, name, price, quantity, cost, unitLabel, unitQuantity, pieceLabel, returnedQty
  //   Customer: id, name, phone
  //   + userName من join بدل استعلام users منفصل
  // بدون تغيير الحدود (limit) أو كسر كاش الأوفلاين — نفس { data, total, page,
  // limit, totalPages } ومفتاح الكاش زي ما هو.
  return withSql(async (sql) => {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    // 🕐 ROOT FIX (2026-09-27): "today" is the tenant's own local day
    // (Tenant.timezone) — consistent for everyone, DST-safe.
    const createdAt: { gte?: Date; lte?: Date } = {}
    if (from || to) {
      const tz = await getTenantTimezone(session.tenantId)
      if (from) createdAt.gte = localDateStrToUtcBounds(from, 'start', tz)
      if (to)   createdAt.lte = localDateStrToUtcBounds(to, 'end', tz)
    }

    const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
    const skip  = (page - 1) * limit

    const rangeParts = [sql`"tenantId" = ${session.tenantId}`]
    if (createdAt.gte) rangeParts.push(sql`AND "createdAt" >= ${createdAt.gte}`)
    if (createdAt.lte) rangeParts.push(sql`AND "createdAt" <= ${createdAt.lte}`)
    const rangeWhere = rangeParts

    const [saleRows, cnt] = await Promise.all([
      sql<any[]>`
        SELECT s."id", s."invoiceNo", s."total", s."paid", s."status",
               s."createdAt", s."refunded", s."paymentMethod",
               (SELECT json_build_object('id', c."id", 'name', c."name", 'phone', c."phone")
                FROM "Customer" c WHERE c."id" = s."customerId") AS customer,
               (SELECT u."name" FROM "User" u WHERE u."id" = s."userId") AS "userName"
        FROM "Sale" s
        WHERE ${rangeWhere}
        ORDER BY s."id" DESC
        LIMIT ${limit} OFFSET ${skip}`,
      sql<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt FROM "Sale" WHERE ${rangeWhere}`,
    ])
    const total = Number(cnt[0]?.cnt ?? 0)

    // عناصر الصفحة في استعلام واحد (بدل include لكل فاتورة)
    const saleIds = saleRows.map((r) => r.id)
    const itemRows = saleIds.length
      ? await sql<any[]>`
          SELECT "id", "saleId", "name", "price", "quantity", "cost",
                 "unitLabel", "unitQuantity", "pieceLabel", "returnedQty"
          FROM "SaleItem"
          WHERE "saleId" IN ${sql(saleIds)}
          ORDER BY "id" ASC`
      : []
    const itemsBySale = new Map<number, any[]>()
    for (const it of itemRows) {
      const list = itemsBySale.get(it.saleId) ?? []
      list.push(it)
      itemsBySale.set(it.saleId, list)
    }

    const result = saleRows.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      total: s.total,
      paid: s.paid,
      status: s.status,
      createdAt: s.createdAt,
      refunded: s.refunded,
      paymentMethod: s.paymentMethod,
      userName: s.userName ?? null,
      customer: s.customer ?? null,
      // 🔒 RBAC: نخفي تكلفة المنتجات لمن لا يملك صلاحية رؤية الأرباح
      items: (itemsBySale.get(s.id) ?? []).map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        cost: canViewProfits ? it.cost : null,
        unitLabel: it.unitLabel ?? null,
        unitQuantity: it.unitQuantity ?? null,
        pieceLabel: it.pieceLabel ?? null,
        returnedQty: it.returnedQty ?? 0,
      })),
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

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 5): إعادة كتابة POST /api/sales —
 * أثقل مسار كتابة في النظام (بيحصل مع كل فاتورة بيع).
 *
 * القديم: مُصادقة → تحميل منتجات/وحدات/متغيرات/عميل/محل (5 استعلامات Prisma)
 *   → حلقة تحقق لكل صنف → transaction برisma جواها توليد الرقم + إنشاء
 *   الفاتورة + الأصناف + (لكل صنف: خصم مخزون ذرّي + مزامنة إجمالي المنتج +
 *   حركة مخزون) + دين العميل + قيد الخزنة = 15-40 استعلام متسلسل عبر Prisma
 *   wasm — بيتجاوز حصة CPU (10ms) فيطلع 503 عشوائي وقت الزحمة.
 *
 * الجديد: نفس التحققات ونفس رسائل الخطأ بالظبط، لكن الحفظ كله بيحصل في
 * **دالة Postgres واحدة** (prisma/sql/create-sale.sql) تتنفذ باستدعاء واحد
 * داخل transaction في الداتابيز — الـ Worker بيبعت الـ payload وبيستقبل
 * الرد الجاهز. إعادة المحاولة عند تضارب الرقم الفريد بقت على SQLSTATE 23505
 * (بديل P2002)، وتضارب clientRef (أوفلاين) الدالة نفسها بترجع الفاتورة
 * الأصلية بدون استثناء.
 */
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

  return withSql(async (sql) => {
    // load products scoped to tenant (⚡ استعلام SQL خفيف بدل Prisma)
    const ids = body.items
      .map((i: any) => parseInt(i.productId, 10))
      .filter((n: number) => !isNaN(n))

    // batch-load all units referenced by the cart in ONE query
    const unitIds = body.items
      .map((i: any) => i.unitId ? parseInt(i.unitId, 10) : null)
      .filter((id: number | null): id is number => id !== null && !isNaN(id))

    // batch-load all variants (colors/sizes) referenced by the cart in ONE query
    const variantIds = body.items
      .map((i: any) => i.variantId ? parseInt(i.variantId, 10) : null)
      .filter((id: number | null): id is number => id !== null && !isNaN(id))

    type ProductRow = {
      id: number
      name: string
      cost: number
      quantity: number
      unitLabel: string | null
    }
    type UnitRow = { id: number; productId: number; name: string; factor: number }
    type VariantRow = { id: number; productId: number; quantity: number }
    type CustomerRow = {
      id: number
      tenantId: string
      name: string
      balance: number | null
      creditLimit: number | null
    }

    const [products, units, variants, customerCheck, tenantRows] = await Promise.all([
      (ids.length
        ? sql<ProductRow[]>`
            SELECT "id", "name", "cost", "quantity", "unitLabel"
            FROM "Product"
            WHERE "id" IN ${sql(ids)} AND "tenantId" = ${session.tenantId}`
        : Promise.resolve([] as ProductRow[])),
      // batch-load all units needed in ONE query
      (unitIds.length > 0
        ? sql<UnitRow[]>`
            SELECT "id", "productId", "name", "factor"
            FROM "ProductUnit"
            WHERE "id" IN ${sql(unitIds)}`
        : Promise.resolve([] as UnitRow[])),
      // batch-load all variants referenced by the cart in ONE query
      (variantIds.length > 0
        ? sql<VariantRow[]>`
            SELECT "id", "productId", "quantity"
            FROM "ProductVariant"
            WHERE "id" IN ${sql(variantIds)}`
        : Promise.resolve([] as VariantRow[])),
      // validate customer in parallel with products
      (customerId
        ? sql<CustomerRow[]>`
            SELECT "id", "tenantId", "name", "balance", "creditLimit"
            FROM "Customer"
            WHERE "id" = ${customerId} LIMIT 1`
        : Promise.resolve([] as CustomerRow[])),
      // load tenant prefix in parallel instead of after everything else
      sql<{ invoicePrefix: string | null }[]>`
        SELECT "invoicePrefix" FROM "Tenant" WHERE "id" = ${session.tenantId} LIMIT 1`,
    ])

    // validate customer
    if (customerId) {
      if (!customerCheck[0] || customerCheck[0].tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'العميل غير صالح' }, { status: 400 })
      }
    }

    const productMap = new Map<number, ProductRow>(products.map((p) => [p.id, p]))
    const unitMap = new Map<number, UnitRow>(units.map((u) => [u.id, u]))
    const variantMap = new Map<number, VariantRow>(variants.map((v) => [v.id, v]))

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
      // 🥬 لقطة وحدة المنتج (علبة/كيس..) وقت البيع — null = قطعة
      pieceLabel: string | null
      variantId: number | null
    }> = []

    for (const it of body.items) {
      const p = productMap.get(parseInt(it.productId, 10))
      if (!p) {
        return NextResponse.json({ error: 'منتج غير موجود في السلة' }, { status: 400 })
      }
      // 🥬 2026-10-12: الكمية بقيت Float — منتجات البيع بالوزن بتتباع بكسور
      // (لحمة 1.65 كيلو). منتجات القطع/الوحدات بتفضل أعداد صحيحة زي ما هي.
      // بنسمح لحد 3 خانات عشرية (جرام) ونشيل أي ضوضاء عائمة.
      const qty = Math.round((Number(it.quantity) || 0) * 1000) / 1000
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
      // variant no longer touches Product.quantity directly.
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
      if (totalPieces > stockCeiling + 1e-9) {
        return NextResponse.json(
          { error: `الكمية المطلوبة من ${p.name} غير متوفرة (المتاح: ${Math.round(stockCeiling * 1000) / 1000})` },
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
        pieceLabel: p.unitLabel ?? null,
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
    if (paid > total + 0.005) {
      return NextResponse.json(
        { error: `المدفوع (${paid}) أكبر من إجمالي الفاتورة (${Math.round(total * 100) / 100}) — لو العميل دفع زيادة سجلها دفعة على حسابه` },
        { status: 400 }
      )
    }

    // 🛡️ 2026-09-30 (M10): الحد الائتماني — لو العميل متحدد له حد وبيع آجل
    // هيعديه، البيع يترفض (بدون فرض ولا استثناء تلقائي).
    if (customerId && paid < total && customerCheck[0]?.creditLimit != null) {
      const projected = (customerCheck[0].balance ?? 0) + (total - paid)
      if (projected > customerCheck[0].creditLimit + 0.005) {
        return NextResponse.json(
          { error: `بيع آجل هيعدي الحد الائتماني للعميل ${customerCheck[0].name} (الحد: ${customerCheck[0].creditLimit}، الرصيد الحالي: ${customerCheck[0].balance}، إجمالي بعد البيع: ${Math.round(projected * 100) / 100})` },
          { status: 400 }
        )
      }
    }

    // 🛡️ 2026-09-30 (M7): idempotency — نفس clientRef؟ رجّع الفاتورة الأصلية.
    // (⚡ استعلامات SQL خفيفة بدل Prisma — نفس شكل include القديم:
    //  كل أعمدة Sale + SaleItem + Customer، بدون variant)
    if (clientRef) {
      const existingRows = await sql<any[]>`
        SELECT * FROM "Sale"
        WHERE "tenantId" = ${session.tenantId} AND "clientRef" = ${clientRef}
        LIMIT 1`
      const existing = existingRows[0]
      if (existing) {
        const [exItems, exCustomer] = await Promise.all([
          sql<any[]>`SELECT * FROM "SaleItem" WHERE "saleId" = ${existing.id} ORDER BY "id" ASC`,
          (existing.customerId
            ? sql<any[]>`SELECT * FROM "Customer" WHERE "id" = ${existing.customerId} LIMIT 1`
            : Promise.resolve([] as any[])),
        ])
        return NextResponse.json(
          { ...existing, items: exItems, customer: exCustomer[0] ?? null },
          { status: 200 }
        )
      }
    }

    const prefix = tenantRows[0]?.invoicePrefix || 'INV'
    // 🛡️ 2026-09-30: السنة بتوقيت المحل (Tenant.timezone) — نفس القديم
    const tz = await getTenantTimezone(session.tenantId)
    const invYear = parseInt(dateStrInTz(new Date(), tz).slice(0, 4), 10)

    // ⚡ THE BIG ONE: الحفظ كله في استدعاء واحد لدالة Postgres (transaction
    // داخلية) — الترقيم، الفاتورة، الأصناف، الخصم الذرّي للمخزون، مزامنة
    // الإجمالي، حركات المخزون، دين العميل، قيد الخزنة.
    // شوف prisma/sql/create-sale.sql
    const payload = {
      tenantId: session.tenantId,
      branchId: session.branchId ?? null,
      userId: session.userId,
      customerId,
      total,
      paid,
      paymentMethod,
      dueDate,
      clientRef,
      prefix,
      year: invYear,
      items: itemsData,
    }

    let sale: any = null
    const MAX_ATTEMPTS = 5
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // ⚠️ لازم نمرر الكائن عبر sql.json() (مش JSON.stringify نصيًا) —
        // postgres.js بيسلسله بصيغة JSON صحيحة على السلك.
        const rows = await sql<{ result: any }[]>`
          SELECT create_sale(${sql.json(payload)}::jsonb) AS result`
        sale = rows[0]?.result
        break
      } catch (e: any) {
        // تضارب رقم فاتورة متزامن معانا (SQLSTATE 23505 بديل P2002) →
        // جرّب تاني برقم أعلى (الدالة نفسها بتولّد رقم أعلى في كل محاولة).
        // تضارب clientRef مش بيوصلك هنا أصلاً — الدالة بترجّع الأصلية.
        if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) continue
        throw e
      }
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
