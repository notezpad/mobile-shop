import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const order = await db.purchaseOrder.findUnique({
    where: { id: oid },
    include: { items: true, supplier: true },
  })
  if (!order || order.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'أمر الشراء غير موجود' }, { status: 404 })
  }
  return NextResponse.json(order)
}

// DELETE marks the purchase order as returned to the supplier:
// stock is pulled back out, the supplier debt (if any) is reversed,
// and a cash entry restores any cash that was paid out.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const order = await db.purchaseOrder.findUnique({
    where: { id: oid },
    include: { items: true, supplier: true },
  })
  if (!order || order.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'أمر الشراء غير موجود' }, { status: 404 })
  }
  if (order.status === 'مرتجعة') {
    return NextResponse.json({ error: 'أمر الشراء مرتجع بالفعل' }, { status: 400 })
  }

  await db.$transaction(async (tx) => {
    // pull stock back out (guard against negative stock going too low is not
    // enforced here — a purchase return means the goods physically leave)
    for (const it of order.items) {
      await tx.product.update({
        where: { id: it.productId },
        data: { quantity: { decrement: it.quantity } },
      })
      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: order.branchId,
          productId: it.productId,
          type: 'out',
          quantity: -it.quantity,
          refType: 'purchase',
          refId: oid,
          note: `مرتجع أمر شراء ${order.orderNo ?? oid}`,
          userId: session.userId,
        },
      })
    }
    // mark returned
    await tx.purchaseOrder.update({
      where: { id: oid },
      data: { status: 'مرتجعة' },
    })
    // cash entry: any cash paid out for this order comes back in
    if (order.paid > 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'purchase_refund',
          refId: oid,
          amount: order.paid,
          note: `مرتجع أمر شراء ${order.orderNo ?? oid}`,
          userId: session.userId,
        },
      })
    }
    // if supplier had balance increase for unpaid amount, decrease back
    if (order.supplierId && order.paid < order.total) {
      await tx.supplier.update({
        where: { id: order.supplierId },
        data: { balance: { decrement: order.total - order.paid } },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
