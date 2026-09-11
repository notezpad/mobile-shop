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
  const cid = parseInt(id, 10)
  if (isNaN(cid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  const customer = await db.customer.findUnique({
    where: { id: cid },
    include: {
      sales: {
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!customer || customer.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  }

  // Compute aggregated totals
  const totalPurchases = customer.sales.reduce((s, x) => s + x.total, 0)
  const totalPaidPayments = customer.payments.reduce(
    (s, p) => s + p.amount,
    0
  )
  const totalPaidSales = customer.sales.reduce((s, x) => s + (x.paid ?? 0), 0)
  const totalPaid = totalPaidPayments + totalPaidSales
  const totalDebt = customer.sales.reduce(
    (s, x) => s + Math.max(0, x.total - (x.paid ?? 0)),
    0
  )

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    balance: customer.balance,
    createdAt: customer.createdAt.toISOString(),
    sales: customer.sales.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      total: s.total,
      paid: s.paid,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      items: s.items.map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        cost: it.cost,
      })),
    })),
    payments: customer.payments.map((p) => ({
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
      balance: customer.balance, // source of truth
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
  const cid = parseInt(id, 10)
  if (isNaN(cid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.customer.findUnique({ where: { id: cid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  }
  const name = String(body.name ?? existing.name).trim()
  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  const updated = await db.customer.update({
    where: { id: cid },
    data: {
      name,
      phone: body.phone !== undefined ? (body.phone ? String(body.phone) : null) : existing.phone,
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
  const cid = parseInt(id, 10)
  if (isNaN(cid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const existing = await db.customer.findUnique({ where: { id: cid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  }
  try {
    await db.customer.delete({ where: { id: cid } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'تعذّر حذف العميل' },
      { status: 400 }
    )
  }
}
