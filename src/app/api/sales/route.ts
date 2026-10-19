import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireCapability, requireModule, requireModuleWritePermission, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, localDateStrToUtcBounds, dateStrInTz } from '@/lib/tenantTime'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { withSql, isUniqueViolation, type Sql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // 🔐 صلاحيات الموظف: موديول 'sales'
  try { requireModule(session, 'sales') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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

// ─────────────────────────────────────────────────────────────────────────────
// أنواع صفوف SQL — نفس الحقول المستخدمة فعليًا من كائنات Prisma القديمة
// ─────────────────────────────────────────────────────────────────────────────
type ProductRow = {
  id: number
  name: string
  cost: number
  quantity: number
  unitLabel: string | null
}
type ProductUnitRow = {
  id: number
  productId: number
  name: string
  factor: number
}
type ProductVariantRow = {
  id: number
  productId: number
  quantity: number
}
type CustomerRow = {
  id: number
  tenantId: string
  name: string
  balance: number
  creditLimit: number | null
}

/**
 * 🛡️ (M7) جلب فاتورة كاملة بمفتاح الأوفلاين clientRef عبر دالة get_sale_by_ref
 * — نفس شكل sale.findUnique({ where: tenantId_clientRef, include: { items:
 * { include: { variant } }, customer } }) القديم بالظبط.
 */
async function fetchSaleByClientRef(sql: Sql, tenantId: string, clientRef: string) {
  const rows = await sql<{ sale: any }[]>`
    SELECT get_sale_by_ref(${tenantId}, ${clientRef}) AS sale`
  return rows[0]?.sale ?? null
}

export async function POST(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // ✍️ صلاحيات كتابة الموظف: موديول 'pos'
  try { requireModuleWritePermission(session, 'pos') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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

  // ⚡ 2026-10-17: POST بقى SQL مباشر + RPC واحد (create_sale) — نفس ترتيب
  // التحقق ونفس رسائل الخطأ بالظبط، بس بدل 8-30 استعلام Prisma متسلسل +
  // $transaction كبيرة، كله بقى: 4-5 استعلامات قراءة خفيفة + استدعاء واحد
  // جوه الداتابيز بيقفل الفاتورة والمخزون والدين والخزنة مرة واحدة.
  return withSql(async (sql) => {
    // load products scoped to tenant
    const ids = body.items
      .map((i: any) => parseInt(i.productId, 10))
      .filter((n: number) => !isNaN(n))

    // Collect all unitIds/variantIds first, then batch-fetch in ONE query
    // instead of one lookup per cart item (N+1 problem — زي القديم بالظبط)
    const unitIds = body.items
      .map((i: any) => i.unitId ? parseInt(i.unitId, 10) : null)
      .filter((id: number | null): id is number => id !== null && !isNaN(id))

    const variantIds = body.items
      .map((i: any) => i.variantId ? parseInt(i.variantId, 10) : null)
      .filter((id: number | null): id is number => id !== null && !isNaN(id))

    // 🎨 2026-10-18: منتجات في السلة من غير variantId — لو ليها ألوان/مقاسات لازم تترفض،
    // وإلا الخصم بيروح على Product.quantity وبيتمسح (يرجع المخزون) عند أول مزامنة للمقاسات.
    // (الـ POS بيجبر اختيار المقاس، ده حماية للطلبات القديمة/الأوفلاين/الـ API)
    const noVariantProductIds = body.items
      .filter((i: any) => !i.variantId)
      .map((i: any) => parseInt(i.productId, 10))
      .filter((n: number) => !isNaN(n))

    const [products, units, variants, customerRows, tenantRows, variantProductRows] = await Promise.all([
      (ids.length > 0
        ? sql<ProductRow[]>`
            SELECT "id", "name", "cost", "quantity", "unitLabel"
            FROM "Product"
            WHERE "tenantId" = ${session.tenantId} AND "id" IN ${sql(ids)}`
        : Promise.resolve([] as ProductRow[])),
      (unitIds.length > 0
        ? sql<ProductUnitRow[]>`
            SELECT "id", "productId", "name", "factor"
            FROM "ProductUnit"
            WHERE "id" IN ${sql(unitIds)}`
        : Promise.resolve([] as ProductUnitRow[])),
      (variantIds.length > 0
        ? sql<ProductVariantRow[]>`
            SELECT "id", "productId", "quantity"
            FROM "ProductVariant"
            WHERE "id" IN ${sql(variantIds)}`
        : Promise.resolve([] as ProductVariantRow[])),
      (customerId
        ? sql<CustomerRow[]>`
            SELECT "id", "tenantId", "name", "balance", "creditLimit"
            FROM "Customer"
            WHERE "id" = ${customerId}`
        : Promise.resolve([] as CustomerRow[])),
      sql<{ invoicePrefix: string }[]>`
        SELECT "invoicePrefix" FROM "Tenant" WHERE "id" = ${session.tenantId}`,
      (noVariantProductIds.length > 0
        ? sql<{ productId: number }[]>`
            SELECT DISTINCT "productId" FROM "ProductVariant"
            WHERE "productId" IN ${sql(noVariantProductIds)}`
        : Promise.resolve([] as { productId: number }[])),
    ])
    const productsWithVariants = new Set<number>(variantProductRows.map((r) => Number(r.productId)))

    // validate customer
    const customerCheck = customerRows[0] ?? null
    if (customerId) {
      if (!customerCheck || customerCheck.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'العميل غير صالح' }, { status: 400 })
      }
    }

    const productMap = new Map<number, ProductRow>(products.map((p) => [p.id, p]))
    const unitMap = new Map<number, ProductUnitRow>(units.map((u) => [u.id, u]))
    const variantMap = new Map<number, ProductVariantRow>(variants.map((v) => [v.id, v]))

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
      } else if (productsWithVariants.has(p.id)) {
        return NextResponse.json(
          { error: `المنتج "${p.name}" له ألوان ومقاسات — اختار اللون/المقاس قبل البيع` },
          { status: 400 }
        )
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
      const existing = await fetchSaleByClientRef(sql, session.tenantId, clientRef)
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const prefix = tenantRows[0]?.invoicePrefix || 'INV'
    // 🛡️ رقم الفاتورة بيتركب جوه الدالة + إعادة المحاولة عند التضارب
    const tz = await getTenantTimezone(session.tenantId)
    const invYear = parseInt(dateStrInTz(new Date(), tz).slice(0, 4), 10)

    const payload = {
      tenantId: session.tenantId,
      branchId: session.branchId ?? null,
      userId: session.userId,
      customerId,
      total,
      paid,
      paymentMethod,
      dueDate: dueDate ? dueDate.toISOString() : null,
      clientRef,
      year: invYear,
      prefix,
      items: itemsData,
    }

    let sale: any = null
    const MAX_ATTEMPTS = 5
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // ⚠️ لازم نمرر الكائن عبر sql.json() (مش JSON.stringify نصيًا) —
        // postgres.js بيسلسله بصيغة JSON صحيحة على السلك (نفس درس أمر الشراء).
        const rows = await sql<{ sale: any }[]>`
          SELECT create_sale(${sql.json(payload)}::jsonb) AS sale`
        sale = rows[0]?.sale
        break
      } catch (e: any) {
        // 🛡️ تضارب فريد متزامن (SQLSTATE 23505 — بديل P2002 بتاع Prisma):
        // لو السبب clientRef (أوفلاين أرسل نفس الفاتورة مرتين) → النسخة
        // الأصلية اتحفظ بالفعل، رجّعها بدل إعادة المحاولة.
        if (isUniqueViolation(e) && clientRef) {
          const existing = await fetchSaleByClientRef(sql, session.tenantId, clientRef)
          if (existing) {
            return NextResponse.json(existing, { status: 200 })
          }
        }
        // تضارب في الرقم الفريد (فاتورة متزامنة معانا) → جرّب تاني برقم أعلى
        if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) continue
        throw e
      }
    }

    // ⚡ EDGE CACHE purge (2026-10-06): البيع الجديد لازم يظهر فورًا في الداشبورد
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