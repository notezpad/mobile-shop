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
  const sid = parseInt(id, 10)
  if (isNaN(sid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const sale = await db.sale.findUnique({
    where: { id: sid },
    include: { items: true, customer: true },
  })
  if (!sale || sale.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'البيع غير موجود' }, { status: 404 })
  }
  return NextResponse.json(sale)
}

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
  const sid = parseInt(id, 10)
  if (isNaN(sid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const sale = await db.sale.findUnique({
    where: { id: sid },
    include: { items: true, customer: true },
  })
  if (!sale || sale.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'البيع غير موجود' }, { status: 404 })
  }
  if (sale.status === 'مرتجعة') {
    return NextResponse.json(
      { error: 'البيع مرتجع بالفعل' },
      { status: 400 }
    )
  }

  await db.$transaction(async (tx) => {
    // restore stock
    for (const it of sale.items) {
      await tx.product.update({
        where: { id: it.productId },
        data: { quantity: { increment: it.quantity } },
      })
    }
    // mark refunded
    await tx.sale.update({
      where: { id: sid },
      data: { status: 'مرتجعة' },
    })
    // create negative cash entry (refund full total)
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'refund',
        refId: sid,
        amount: -sale.total,
        note: `مرتجع فاتورة ${sale.invoiceNo ?? sid}`,
        userId: session.userId,
      },
    })
    // if customer had balance increase for unpaid, decrease back
    if (sale.customerId && sale.paid < sale.total) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { balance: { decrement: sale.total - sale.paid } },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
