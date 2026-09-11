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

  const supplier = await db.supplier.findUnique({
    where: { id: sid },
    include: {
      purchaseOrders: {
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!supplier || supplier.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
  }

  // Compute aggregated totals
  const totalPurchases = supplier.purchaseOrders.reduce((s, x) => s + x.total, 0)
  const totalPaidPayments = supplier.payments.reduce((s, p) => s + p.amount, 0)
  const totalPaidOrders = supplier.purchaseOrders.reduce(
    (s, x) => s + (x.paid ?? 0),
    0
  )
  const totalPaid = totalPaidPayments + totalPaidOrders
  const totalDebt = supplier.purchaseOrders.reduce(
    (s, x) => s + Math.max(0, x.total - (x.paid ?? 0)),
    0
  )

  return NextResponse.json({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    balance: supplier.balance,
    createdAt: supplier.createdAt.toISOString(),
    purchaseOrders: supplier.purchaseOrders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      total: o.total,
      paid: o.paid,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        cost: it.cost,
        quantity: it.quantity,
      })),
    })),
    payments: supplier.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    })),
    summary: {
      totalPurchases,
      totalPaid,
      totalDebt,
      balance: supplier.balance, // source of truth (amount we owe)
    },
  })
}

export async function PUT(
  req: NextRequest,
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
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.supplier.findUnique({ where: { id: sid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
  }
  const name = String(body.name ?? existing.name).trim()
  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  const updated = await db.supplier.update({
    where: { id: sid },
    data: {
      name,
      phone:
        body.phone !== undefined
          ? body.phone
            ? String(body.phone)
            : null
          : existing.phone,
    },
  })
  return NextResponse.json(updated)
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
  const existing = await db.supplier.findUnique({ where: { id: sid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
  }
  try {
    await db.supplier.delete({ where: { id: sid } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'تعذّر حذف المورد' }, { status: 400 })
  }
}
