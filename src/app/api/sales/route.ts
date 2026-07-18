import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function nextInvoiceNo(
  prefix: string,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear()
  // count sales of this year/prefix within the tenant
  const count = await db.sale.count({
    where: {
      tenantId,
      invoiceNo: { startsWith: `${prefix}-${year}-` },
    },
  })
  const seq = (count + 1).toString().padStart(5, '0')
  return `${prefix}-${year}-${seq}`
}

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const sales = await db.sale.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { id: 'desc' },
    include: {
      items: true,
      customer: true,
    },
  })
  // `userId` on Sale is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
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
  return NextResponse.json(result)
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

  // load products scoped to tenant
  const ids = body.items
    .map((i: any) => parseInt(i.productId, 10))
    .filter((n: number) => !isNaN(n))
  const products = await db.product.findMany({
    where: { id: { in: ids }, tenantId: session.tenantId },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  // validate items & compute total
  let total = 0
  const itemsData: Array<{
    productId: number
    name: string
    price: number
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
    if (qty > p.quantity) {
      return NextResponse.json(
        { error: `الكمية المطلوبة من ${p.name} غير متوفرة (المتاح: ${p.quantity})` },
        { status: 400 }
      )
    }
    const price = Number(it.price)
    if (isNaN(price) || price < 0) {
      return NextResponse.json(
        { error: `سعر غير صالح للمنتج ${p.name}` },
        { status: 400 }
      )
    }
    total += price * qty
    itemsData.push({
      productId: p.id,
      name: p.name,
      price,
      cost: p.cost,
      quantity: qty,
    })
  }

  // credit sale requires customer
  if (paid < total && !customerId) {
    return NextResponse.json(
      { error: 'البيع بالآجل لازم يكون مرتبط بعميل' },
      { status: 400 }
    )
  }

  // verify customer belongs to tenant if provided
  if (customerId) {
    const cust = await db.customer.findUnique({ where: { id: customerId } })
    if (!cust || cust.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: 'العميل غير صالح' },
        { status: 400 }
      )
    }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { invoicePrefix: true },
  })
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
          create: itemsData,
        },
      },
      include: { items: true, customer: true },
    })
    // decrement stock + record movement
    for (const it of itemsData) {
      await tx.product.update({
        where: { id: it.productId },
        data: { quantity: { decrement: it.quantity } },
      })
      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: session.branchId ?? null,
          productId: it.productId,
          type: 'sale',
          quantity: -it.quantity,
          refType: 'sale',
          refId: created.id,
          note: `فاتورة ${invoiceNo}`,
          userId: session.userId,
        },
      })
    }
    // update customer balance (debt = total - paid)
    if (customerId && paid < total) {
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { increment: total - paid } },
      })
    }
    // cash entry for the paid amount
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
  })

  return NextResponse.json(sale, { status: 201 })
}
