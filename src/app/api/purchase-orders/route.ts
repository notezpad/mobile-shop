import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { round2, REFUND_METHODS } from '@/lib/purchase-return'
import { createPrincipalCashEntry } from '@/lib/commission'
import { getTenantTimezone, dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-09-30: توليد رقم أمر الشراء.
 *
 * قبل كده كان `count + 1` — يعني أي حذف لأمر شراء بيرجّع العدّاد للورا
 * ورقم اتعمل قبل كده بيتولد تاني (تكرار). وكمان القراءة كانت بره الـ
 * transaction، فطلبان متزامنين بيقرّوا نفس العدّاد ويكتبوا نفس الرقم.
 *
 * الحل:
 *   1. max+1 بدل count+1 (قراءة أعلى رقم موجود — الحذف مش بيأثر عليه).
 *   2. الدالة بتشتغل جوه الـ transaction نفسه (بـ tx client) والفريد
 *      `@@unique([tenantId, orderNo])` في الداتابيز هو الحكم الأخير —
 *      لو حصل تضارب برضه الـ POST بيعيد المحاولة برقم جديد (retry على P2002).
 *   3. السنة بتوقيت المحل (Tenant.timezone) مش توقيت السيرفر.
 */
async function nextOrderNo(
  tenantId: string,
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const start = `PO-${year}-`
  // قراءة أعلى رقم فقط (بتستخدم الفهرس) بدل عدّ كل أوامر السنة
  const last = await tx.purchaseOrder.findFirst({
    where: { tenantId, orderNo: { startsWith: start } },
    orderBy: { id: 'desc' },
    select: { orderNo: true },
  })
  const lastSeq = last?.orderNo ? parseInt(last.orderNo.slice(start.length), 10) || 0 : 0
  const seq = (lastSeq + 1).toString().padStart(5, '0')
  return `${start}${seq}`
}

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

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // 🕐 2026-09-30: "from"/"to" تواريخ تقويمية بتوقيت المحل — بتتحول لحدود
  // UTC بتوقيت المحل (Tenant.timezone) مش بتوقيت السيرفر (كانت
  // `new Date(`${from}T00:00:00`)` بتتفسّر بتوقيت السيرفر = UTC على Workers،
  // يعني فاتورة 1 صباحاً بتوقيت القاهرة بتقع في "إمبارح").
  const createdAt: { gte?: Date; lte?: Date } = {}
  if (from || to) {
    const tz = await getTenantTimezone(session.tenantId)
    if (from) createdAt.gte = localDateStrToUtcBounds(from, 'start', tz)
    if (to) createdAt.lte = localDateStrToUtcBounds(to, 'end', tz)
  }

  const orders = await db.purchaseOrder.findMany({
    where: {
      tenantId: session.tenantId,
      ...(from || to ? { createdAt } : {}),
    },
    orderBy: { id: 'desc' },
    include: { items: true, supplier: true },
    // Without a date filter (initial page load) cap the result so a shop
    // with years of history doesn't pull every order on every visit.
    ...(from || to ? {} : { take: 500 }),
  })
  const userIds = [...new Set(orders.map((o) => o.userId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const result = orders.map((o) => ({
    ...o,
    userName: o.userId ? (userNameById.get(o.userId) ?? null) : null,
  }))
  return NextResponse.json(result)
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
  // 🛡️ 2026-09-30: how the money left the shop (cash / wallet / InstaPay). It
  // used to be dropped, so every purchase hit the till as plain cash.
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

  // load products scoped to tenant
  const ids = body.items
    .map((i: any) => parseInt(i.productId, 10))
    .filter((n: number) => !isNaN(n))
  const products = await db.product.findMany({
    where: { id: { in: ids }, tenantId: session.tenantId },
  })
  const productMap = new Map<number, (typeof products)[number]>(products.map((p) => [p.id, p]))

  // validate items & compute total
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
    const qty = parseInt(it.quantity, 10)
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
  // 🛡️ 2026-09-29: paying MORE than the invoice is only meaningful when there is
  // a supplier account to hold the surplus as a credit (negative balance =
  // the supplier owes us). Without a supplier the extra money would just vanish
  // from every report.
  if (paid > total && !supplierId) {
    return NextResponse.json(
      { error: 'المدفوع أكبر من إجمالي الفاتورة، اختر مورداً ليُسجَّل الفرق كرصيد دائن لك عنده' },
      { status: 400 }
    )
  }

  // verify supplier belongs to tenant if provided
  if (supplierId) {
    const sup = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!sup || sup.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'المورد غير صالح' }, { status: 400 })
    }
  }

  // 🛡️ 2026-09-30: توليد الرقم جوه الـ transaction + إعادة المحاولة عند تضارب
  // (طلبان متزامنين). الفهرس الفريد @@unique([tenantId, orderNo]) هو الضمانة.
  const tz = await getTenantTimezone(session.tenantId)
  const year = parseInt(dateStrInTz(new Date(), tz).slice(0, 4), 10)

  let order: Awaited<ReturnType<typeof createOrderTx>> | null = null
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      order = await createOrderTx(year)
      break
    } catch (e: any) {
      // تضارب في الرقم الفريد (طلب متزامن معانا) → جرّب تاني برقم أعلى.
      // أي خطأ تاني بيتنشر طبيعي.
      if (e?.code === 'P2002' && attempt < MAX_ATTEMPTS) continue
      throw e
    }
  }

  async function createOrderTx(year: number) {
    return db.$transaction(async (tx) => {
      const orderNo = await nextOrderNo(session.tenantId, tx, year)
      const created = await tx.purchaseOrder.create({
      data: {
        tenantId: session.tenantId,
        branchId: session.branchId ?? null,
        orderNo,
        supplierId,
        userId: session.userId,
        total,
        paid,
        paymentMethod: paid > 0 ? paymentMethod : 'cash',
        status: 'مكتملة',
        items: {
          create: itemsData,
        },
      },
      include: { items: true, supplier: true },
    })
    // increment stock + update product cost + record movement
    // 🛡️ 2026-09-30: تكلفة المتوسط المرجح (Weighted Moving Average) بدل
    // "آخر سعر شراء". قبل كده `cost: it.cost` كان بيمسح التكلفة القديمة
    // بالكامل، فبضاعة قديمة اشتريناها بـ 100 بتبقى تكليفتها 150 فجأة بعد
    // أول فاتورة جديدة، وربح المبيعات القديمة/الجاية بيتغيّر كله.
    // المتوسط المرجح: newCost = (الكمية القديمة × تكليفتها + الكمية الجديدة × سعرها) ÷ الإجمالي
    for (const it of itemsData) {
      const cur = await tx.product.findUnique({
        where: { id: it.productId },
        select: { quantity: true, cost: true },
      })
      const oldQty = Math.max(0, cur?.quantity ?? 0)
      const oldCost = Math.max(0, cur?.cost ?? 0)
      const totalQty = oldQty + it.quantity
      const avgCost =
        totalQty > 0
          ? round2((oldQty * oldCost + it.quantity * it.cost) / totalQty)
          : it.cost // مفيش مخزون قديم → التكلفة هي سعر الشراء الجديد
      await tx.product.update({
        where: { id: it.productId },
        data: { quantity: { increment: it.quantity }, cost: Math.max(0, avgCost) },
      })
      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: session.branchId ?? null,
          productId: it.productId,
          type: 'in',
          quantity: it.quantity,
          refType: 'purchase',
          refId: created.id,
          note: `أمر شراء ${orderNo}`,
          userId: session.userId,
        },
      })
    }
    // update supplier balance: what we owe changes by (total - paid).
    // 🛡️ 2026-09-29: this used to run only when paid < total, so an overpayment
    // (paid > total) never reached the supplier account. Now the sign is kept:
    // positive = we owe him more, negative = we overpaid (he owes us).
    if (supplierId) {
      const diff = round2(total - paid)
      if (diff !== 0) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: diff } },
        })
      }
    }
    // till entry for the paid amount (money leaving the shop) — carries the
    // payment method so cash / wallet / InstaPay balances stay separate.
    // No commission: paying a supplier is an outgoing payment, not a service fee.
    if (paid > 0) {
      await createPrincipalCashEntry(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        method: paymentMethod,
        source: 'purchase',
        refId: created.id,
        amount: -paid,
        note: `شراء أمر ${orderNo}`,
      })
    }
      return created
    }, { maxWait: 10000, timeout: 20000 })
  }

  return NextResponse.json(order, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
