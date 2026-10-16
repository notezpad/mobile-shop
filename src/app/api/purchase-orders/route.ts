import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { round2, REFUND_METHODS } from '@/lib/purchase-return'
import { getTenantTimezone, dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { withSql, isUniqueViolation } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 — إعادة كتابة POST /api/purchase-orders (الخطوة 2):
 *
 * القديم: مُصادقة → تحميل المنتجات → تحقق المورد → transaction برisma جواها
 *   توليد الرقم + إنشاء الأمر + إنشاء الأصناف + (لكل صنف: قراءة المخزون،
 *   تحديث المنتج، حركة مخزون) + تحديث المورد + قيد الخزنة = 8-40 استعلام
 *   متسلسل عبر Prisma wasm — بيتجاوز حصة CPU (10ms) فيطلع 503 عشوائي.
 *
 * الجديد: نفس التحققات ونفس رسائل الخطأ بالظبط، لكن الحفظ كله بيحصل في
 * **دالة Postgres واحدة** (prisma/sql/create-purchase-order.sql) تتنفذ
 * باستدعاء واحد داخل transaction في الداتابيز — الـ Worker بيبعت الـ payload
 * وبيستقبل الرد الجاهز. إعادة المحاولة عند تضارب الرقم الفريد بقت على
 * SQLSTATE 23505 (بديل P2002).
 *
 * ⚡ GET (الخطوتان 1 + 4): SQL مباشر + رد مخفّف بالحقول اللي الواجهة بتعرضها
 * فعلًا (PurchaseOrdersView.tsx / PurchaseReturnDialog):
 *   PurchaseOrder: id, orderNo, total, paid, paymentMethod, refunded, status, createdAt
 *   PurchaseOrderItem: id, name, cost, quantity, returnedQty
 *   Supplier: id, name, phone  +  userName من join
 * نفس حد الـ 500 الافتراضي ونفس شكل المصفوفة (الأوفلاين مش هيتأثر).
 */

async function __GET(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'purchases') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  return withSql(async (sql) => {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    // 🕐 "from"/"to" تواريخ تقويمية بتوقيت المحل — بتتحول لحدود UTC بتوقيت
    // المحل (Tenant.timezone) — نفس سلوك القديم حرفيًا.
    const createdAt: { gte?: Date; lte?: Date } = {}
    if (from || to) {
      const tz = await getTenantTimezone(session.tenantId)
      if (from) createdAt.gte = localDateStrToUtcBounds(from, 'start', tz)
      if (to) createdAt.lte = localDateStrToUtcBounds(to, 'end', tz)
    }

    const rangeParts = [sql`"tenantId" = ${session.tenantId}`]
    if (createdAt.gte) rangeParts.push(sql`AND "createdAt" >= ${createdAt.gte}`)
    if (createdAt.lte) rangeParts.push(sql`AND "createdAt" <= ${createdAt.lte}`)
    const rangeWhere = rangeParts

    // بدون فلتر تاريخ = أول 500 أمر فقط (نفس القديم) — مع فلتر = كل المطابق
    const limit = from || to ? null : 500

    const orderRows = await sql<any[]>`
      SELECT o."id", o."orderNo", o."total", o."paid", o."paymentMethod",
             o."refunded", o."status", o."createdAt",
             (SELECT json_build_object('id', sp."id", 'name', sp."name", 'phone', sp."phone")
                FROM "Supplier" sp WHERE sp."id" = o."supplierId") AS supplier,
             (SELECT u."name" FROM "User" u WHERE u."id" = o."userId") AS "userName"
      FROM "PurchaseOrder" o
      WHERE ${rangeWhere}
      ORDER BY o."id" DESC
      ${limit ? sql`LIMIT ${limit}` : sql``}`

    const ids = orderRows.map((r) => r.id)
    const itemRows = ids.length
      ? await sql<any[]>`
          SELECT "id", "purchaseOrderId", "name", "cost", "quantity", "returnedQty"
          FROM "PurchaseOrderItem"
          WHERE "purchaseOrderId" IN ${sql(ids)}
          ORDER BY "id" ASC`
      : []
    const itemsByOrder = new Map<number, any[]>()
    for (const it of itemRows) {
      const list = itemsByOrder.get(it.purchaseOrderId) ?? []
      list.push({
        id: it.id,
        name: it.name,
        cost: it.cost,
        quantity: it.quantity,
        returnedQty: it.returnedQty ?? 0,
      })
      itemsByOrder.set(it.purchaseOrderId, list)
    }

    const result = orderRows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      total: o.total,
      paid: o.paid,
      paymentMethod: o.paymentMethod,
      refunded: o.refunded,
      status: o.status,
      createdAt: o.createdAt,
      userName: o.userName ?? null,
      supplier: o.supplier ?? null,
      items: itemsByOrder.get(o.id) ?? [],
    }))
    return NextResponse.json(result)
  })
}

async function __POST(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'purchases') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'السلة فارغة' }, { status: 400 })
  }
  // 🛡️ 2026-09-29: validate `paid`. Before, `Number(x) || 0` turned garbage into
  // 0 (a silent full-credit purchase) and a NEGATIVE paid inflated the supplier
  // debt above the invoice total while pushing money INTO the till.
  const paidRaw = body.paid === undefined || body.paid === null || body.paid === '' ? 0 : Number(body.paid)
  if (!Number.isFinite(paidRaw) || paidRaw < 0) {
    return NextResponse.json({ error: 'المبلغ المدفوع غير صالح' }, { status: 400 })
  }
  const paid = round2(paidRaw)
  // 🛡️ 2026-09-30: how the money left the shop (cash / wallet / InstaPay).
  const paymentMethod =
    body.paymentMethod === undefined || body.paymentMethod === null || body.paymentMethod === ''
      ? 'cash'
      : String(body.paymentMethod)
  if (!REFUND_METHODS.has(paymentMethod)) {
    return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
  }
  let supplierId: number | null = null
  if (body.supplierId) {
    supplierId = parseInt(body.supplierId, 10) || null
  }

  return withSql(async (sql) => {
    // load products scoped to tenant (⚡ استعلام SQL خفيف بدل Prisma)
    const ids = body.items
      .map((i: any) => parseInt(i.productId, 10))
      .filter((n: number) => !isNaN(n))
    const products = ids.length
      ? await sql<{ id: number; name: string }[]>`
          SELECT "id", "name" FROM "Product"
          WHERE "id" IN ${sql(ids)} AND "tenantId" = ${session.tenantId}`
      : []
    const productMap = new Map<number, { id: number; name: string }>(products.map((p) => [p.id, p]))

    // validate items & compute total (نفس الرسائل والتحققات بالظبط)
    let total = 0
    const itemsData: Array<{
      productId: number
      name: string
      cost: number
      quantity: number
    }> = []
    for (const it of body.items) {
      const p = productMap.get(parseInt(it.productId, 10))
      if (!p) {
        return NextResponse.json(
          { error: 'منتج غير موجود في السلة' },
          { status: 400 }
        )
      }
      // 🥬 2026-10-12: الكمية Float — شراء بالوزن بكسور (45.5 كيلو من المورد)
      const qty = Math.round((Number(it.quantity) || 0) * 1000) / 1000
      if (!qty || qty <= 0) {
        return NextResponse.json(
          { error: `كمية غير صالحة للمنتج ${p.name}` },
          { status: 400 }
        )
      }
      const cost = Number(it.cost)
      if (isNaN(cost) || cost < 0) {
        return NextResponse.json(
          { error: `سعر تكلفة غير صالح للمنتج ${p.name}` },
          { status: 400 }
        )
      }
      if (!Number.isFinite(cost)) {
        return NextResponse.json(
          { error: `سعر تكلفة غير صالح للمنتج ${p.name}` },
          { status: 400 }
        )
      }
      total += cost * qty
      itemsData.push({
        productId: p.id,
        name: p.name,
        cost,
        quantity: qty,
      })
    }

    total = round2(total)

    // credit purchase requires a supplier
    if (paid < total && !supplierId) {
      return NextResponse.json(
        { error: 'الشراء بالآجل لازم يكون مرتبط بمورد' },
        { status: 400 }
      )
    }
    // 🛡️ 2026-09-29: paying MORE than the invoice requires a supplier account
    // to hold the surplus as a credit.
    if (paid > total && !supplierId) {
      return NextResponse.json(
        { error: 'المدفوع أكبر من إجمالي الفاتورة، اختر مورداً ليُسجَّل الفرق كرصيد دائن لك عنده' },
        { status: 400 }
      )
    }

    // verify supplier belongs to tenant if provided (⚡ SQL خفيف)
    if (supplierId) {
      const sup = await sql<{ tenantId: string }[]>`
        SELECT "tenantId" FROM "Supplier" WHERE "id" = ${supplierId} LIMIT 1`
      if (!sup[0] || sup[0].tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'المورد غير صالح' }, { status: 400 })
      }
    }

    // 🛡️ 2026-09-30: السنة بتوقيت المحل (Tenant.timezone) — نفس القديم
    const tz = await getTenantTimezone(session.tenantId)
    const year = parseInt(dateStrInTz(new Date(), tz).slice(0, 4), 10)

    // ⚡ THE BIG ONE: الحفظ كله في استدعاء واحد لدالة Postgres (transaction
    // داخلية) — الترقيم، الأمر، الأصناف، المخزون والمتوسط المرجح، حركات
    // المخزون، رصيد المورد، قيد الخزنة. شوف prisma/sql/create-purchase-order.sql
    const payload = {
      tenantId: session.tenantId,
      branchId: session.branchId ?? null,
      userId: session.userId,
      supplierId,
      total,
      paid,
      paymentMethod,
      year,
      items: itemsData,
    }

    let order: any = null
    const MAX_ATTEMPTS = 5
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // ⚠️ لازم نمرر الكائن عبر sql.json() (مش JSON.stringify نصيًا) —
        // postgres.js بيسلسله بصيغة JSON صحيحة على السلك، أما النص الخام
        // كان بيتفسر كـ JSON string scalar فيرجع NULL من payload->>'x'.
        const rows = await sql<{ result: any }[]>`
          SELECT create_purchase_order(${sql.json(payload)}::jsonb) AS result`
        order = rows[0]?.result
        break
      } catch (e: any) {
        // تضارب في الرقم الفريد (طلب متزامن معانا — SQLSTATE 23505 بديل P2002)
        // → جرّب تاني برقم أعلى. أي خطأ تاني بيتنشر طبيعي.
        if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) continue
        throw e
      }
    }

    return NextResponse.json(order, { status: 201 })
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return __GET(...args)
}
export async function POST(...args: Parameters<typeof __POST>) {
  return __POST(...args)
}
