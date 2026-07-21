import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

async function nextOrderNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.purchaseOrder.count({
    where: {
      tenantId,
      orderNo: { startsWith: `PO-${year}-` },
    },
  })
  const seq = (count + 1).toString().padStart(5, '0')
  return `PO-${year}-${seq}`
}

export async function GET(req: NextRequest) {
  let session
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

  const createdAt: { gte?: Date; lte?: Date } = {}
  if (from) createdAt.gte = new Date(`${from}T00:00:00`)
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999`)

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

export async function POST(req: NextRequest) {
  let session
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
  const paid = Number(body.paid ?? 0) || 0
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
    total += cost * qty
    itemsData.push({
      productId: p.id,
      name: p.name,
      cost,
      quantity: qty,
    })
  }

  // credit purchase requires a supplier
  if (paid < total && !supplierId) {
    return NextResponse.json(
      { error: 'الشراء بالآجل لازم يكون مرتبط بمورد' },
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

  const orderNo = await nextOrderNo(session.tenantId)

  const order = await db.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        tenantId: session.tenantId,
        branchId: session.branchId ?? null,
        orderNo,
        supplierId,
        userId: session.userId,
        total,
        paid,
        status: 'مكتملة',
        items: {
          create: itemsData,
        },
      },
      include: { items: true, supplier: true },
    })
    // increment stock + update product cost + record movement
    for (const it of itemsData) {
      await tx.product.update({
        where: { id: it.productId },
        data: { quantity: { increment: it.quantity }, cost: it.cost },
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
    // update supplier balance (what we owe = total - paid)
    if (supplierId && paid < total) {
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { increment: total - paid } },
      })
    }
    // cash entry for the paid amount (money leaving the till)
    if (paid > 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'purchase',
          refId: created.id,
          amount: -paid,
          note: `شراء أمر ${orderNo}`,
          userId: session.userId,
        },
      })
    }
    return created
  })

  return NextResponse.json(order, { status: 201 })
}
