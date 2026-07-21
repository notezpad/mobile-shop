import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'
import { deductStock } from '@/lib/deduct-stock'

export const dynamic = 'force-dynamic'

async function nextInvoiceNo(
  prefix: string,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear()
  const count = await db.sale.count({
    where: {
      tenantId,
      invoiceNo: { startsWith: `${prefix}-${year}-` },
    },
  })
  const seq = (count + 1).toString().padStart(5, '0')
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

  const sales = await db.sale.findMany({
    where: {
      tenantId: session.tenantId,
      ...(from || to ? { createdAt } : {}),
    },
    orderBy: { id: 'desc' },
    include: {
      items: true,
      customer: true,
    },
    ...(from || to ? {} : { take: 500 }),
  })
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
  const productMap = new Map<number, (typeof products)[number]>(products.map((p) => [p.id, p]))

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

  let total = 0

  // itemsData stores everything needed for SaleItem creation + stock deduction
  const itemsData: Array<{
    productId: number
    name: string
    price: number
    cost: number
    quantity: number        // total PIECES — stored in SaleItem for reports
    unitsEntered: number    // what the user typed (units or pieces if no unit) — passed to deductStock
    unitId: number | null
    unitLabel: string | null
    unitQuantity: number | null  // for invoice display: "٢ دستة"
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

    // Resolve unit (if any) and compute total pieces for stock + SaleItem
    let unitId: number | null = null
    let unitLabel: string | null = null
    let unitQuantity: number | null = null   // user-entered units (for invoice display)
    let totalPieces = qty                    // default: qty IS pieces (no unit)
    let unitFactor = 1                       // pieces per sold unit (1 = plain piece)

    if (it.unitId) {
      const uid = parseInt(it.unitId, 10)
      const unit = await db.productUnit.findUnique({ where: { id: uid } })
      if (!unit || unit.productId !== p.id) {
        return NextResponse.json(
          { error: `وحدة بيع غير صالحة للمنتج ${p.name}` },
          { status: 400 }
        )
      }
      unitId = unit.id
      unitLabel = unit.name
      unitQuantity = qty             // the user typed "2 دستة"
      unitFactor = unit.factor

      // Simple unit: e.g. 2 كرتون × 12 = 24 قطعة
      totalPieces = unit.factor * qty
      if (totalPieces > p.quantity) {
        return NextResponse.json(
          { error: `الكمية المطلوبة من ${p.name} غير متوفرة (المتاح: ${p.quantity})` },
          { status: 400 }
        )
      }
    } else {
      // Plain piece sale — check product stock
      if (totalPieces > p.quantity) {
        return NextResponse.json(
          { error: `الكمية المطلوبة من ${p.name} غير متوفرة (المتاح: ${p.quantity})` },
          { status: 400 }
        )
      }
    }

    const price = Number(it.price)
    if (isNaN(price) || price < 0) {
      return NextResponse.json(
        { error: `سعر غير صالح للمنتج ${p.name}` },
        { status: 400 }
      )
    }
    total += price * qty  // price is per entered unit (piece or wholesale unit)

    // SaleItem.quantity is stored in PIECES (totalPieces), so price/cost saved on
    // the item must also be PER PIECE — otherwise every downstream profit/revenue
    // calculation (dashboard, reports) that does (price - cost) * quantity or
    // price * quantity ends up multiplying a whole-unit price by a piece count,
    // inflating totals by the unit's factor (e.g. x12 for a دستة).
    const pricePerPiece = price / unitFactor

    itemsData.push({
      productId: p.id,
      name: p.name,
      price: pricePerPiece,
      cost: p.cost,
      quantity: totalPieces,         // total pieces for SaleItem + reports
      unitsEntered: qty,             // units entered — passed to deductStock
      unitId,
      unitLabel,
      unitQuantity,                  // "2" when user سold "2 دستة"
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
          create: itemsData.map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            cost: i.cost,
            quantity: i.quantity,      // total pieces (for reports)
            unitId: i.unitId,
            unitLabel: i.unitLabel,    // "دستة" / "نص دستة" / null
            unitQuantity: i.unitQuantity, // 2 (how many units, for invoice display)
          })),
        },
      },
      include: { items: true, customer: true },
    })

    // Advanced stock deduction (variant / assortment / simple factor).
    // deductStock receives unitsEntered (qty the user typed), NOT totalPieces.
    // It internally multiplies by factor for wholesale units.
    for (const it of itemsData) {
      await deductStock(tx, {
        tenantId: session.tenantId,
        branchId: session.branchId ?? null,
        userId: session.userId,
        productId: it.productId,
        quantity: it.unitsEntered,   // ← units, not pieces; deductStock handles conversion
        unitId: it.unitId,
        refType: 'sale',
        refId: created.id,
        note: `فاتورة ${invoiceNo}`,
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
