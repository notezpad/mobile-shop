import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const tenant = await db.tenant.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      },
    },
  })

  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  const now = new Date()
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [productsCount, salesCount, usersCount, cashAgg, sales30, profit30Raw] =
    await Promise.all([
      db.product.count({ where: { tenantId: id } }),
      db.sale.count({ where: { tenantId: id } }),
      db.user.count({ where: { tenantId: id } }),
      db.cashEntry.aggregate({
        where: { tenantId: id },
        _sum: { amount: true },
      }),
      db.sale.findMany({
        where: { tenantId: id, createdAt: { gte: last30 }, status: 'مكتملة' },
        select: { total: true },
      }),
      db.sale.findMany({
        where: { tenantId: id, createdAt: { gte: last30 }, status: 'مكتملة' },
        include: { items: { select: { price: true, cost: true, quantity: true } } },
      }),
    ])

  const sales30Total = sales30.reduce((s, x) => s + x.total, 0)
  const profit30 = profit30Raw.reduce(
    (s, x) =>
      s + x.items.reduce((a, it) => a + (it.price - it.cost) * it.quantity, 0),
    0
  )

  return NextResponse.json({
    id: tenant.id,
    shopName: tenant.shopName,
    phone: tenant.phone,
    address: tenant.address,
    ownerEmail: tenant.ownerEmail,
    ownerPhone: tenant.ownerPhone,
    status: tenant.status,
    adminNotes: tenant.adminNotes,
    createdAt: tenant.createdAt.toISOString(),
    lastLoginAt: tenant.lastLoginAt ? tenant.lastLoginAt.toISOString() : null,
    invoicePrefix: tenant.invoicePrefix,
    commissionVodafoneCash: tenant.commissionVodafoneCash,
    commissionInstapay: tenant.commissionInstapay,
    commissionFawry: tenant.commissionFawry,
    users: tenant.users.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
    subscriptions: tenant.subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      period: s.period,
      amountPaid: s.amountPaid,
      paymentMethod: s.paymentMethod,
      paymentNote: s.paymentNote,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate.toISOString(),
      createdAt: s.createdAt.toISOString(),
      plan: {
        id: s.plan.id,
        code: s.plan.code,
        name: s.plan.name,
        priceMonthly: s.plan.priceMonthly,
        priceYearly: s.plan.priceYearly,
      },
    })),
    stats: {
      productsCount,
      salesCount,
      usersCount,
      cashBalance: cashAgg._sum.amount ?? 0,
      last30Sales: sales30Total,
      last30Profit: profit30,
    },
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const existing = await db.tenant.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  const data: any = {}
  if (body.shopName !== undefined) data.shopName = String(body.shopName)
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone) : null
  if (body.address !== undefined) data.address = body.address ? String(body.address) : null
  if (body.status !== undefined) data.status = String(body.status)
  if (body.ownerEmail !== undefined) data.ownerEmail = body.ownerEmail ? String(body.ownerEmail) : null
  if (body.ownerPhone !== undefined) data.ownerPhone = body.ownerPhone ? String(body.ownerPhone) : null
  if (body.adminNotes !== undefined) data.adminNotes = body.adminNotes ? String(body.adminNotes) : null

  const updated = await db.tenant.update({
    where: { id },
    data,
    select: {
      id: true,
      shopName: true,
      phone: true,
      address: true,
      ownerEmail: true,
      ownerPhone: true,
      status: true,
      adminNotes: true,
    },
  })

  return NextResponse.json({ ok: true, tenant: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const existing = await db.tenant.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  // Soft delete: mark as cancelled
  await db.tenant.update({
    where: { id },
    data: { status: 'cancelled' },
  })
  await db.subscription.updateMany({
    where: { tenantId: id, status: 'active' },
    data: { status: 'cancelled' },
  })

  return NextResponse.json({ ok: true })
}
