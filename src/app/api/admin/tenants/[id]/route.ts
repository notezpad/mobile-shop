import { NextRequest, NextResponse } from 'next/server'
import { hardDeleteTenant } from '@/lib/admin-fake-tenants'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse, PLATFORM_TENANT_ID } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __GET(
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

  // ⚡ PERF FIX: was two findMany calls — one pulling every sale from the
  // last 30 days, another pulling those same sales WITH every line item
  // included — just to sum them in JS. Same math, now done by Postgres in
  // a single small query each (matches the pattern already used in
  // /api/reports and /api/dashboard).
  const [productsCount, salesCount, usersCount, cashAgg, sales30Agg, profit30Row] =
    await Promise.all([
      db.product.count({ where: { tenantId: id } }),
      db.sale.count({ where: { tenantId: id } }),
      db.user.count({ where: { tenantId: id } }),
      db.cashEntry.aggregate({
        where: { tenantId: id },
        _sum: { amount: true },
      }),
      db.sale.aggregate({
        where: { tenantId: id, createdAt: { gte: last30 }, status: 'مكتملة' },
        _sum: { total: true },
      }),
      db.$queryRaw<{ profit: number }[]>`
        SELECT COALESCE(SUM((i."price" - i."cost") * i."quantity"), 0)::float8 AS profit
        FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
        WHERE s."tenantId" = ${id} AND s."status" = 'مكتملة' AND s."createdAt" >= ${last30}`,
    ])

  const sales30Total = sales30Agg._sum.total ?? 0
  const profit30 = profit30Row[0]?.profit ?? 0

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

async function __PUT(
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

async function __DELETE(
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
  const existing = await db.tenant.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  // 🗑️ حذف نهائي (?permanent=1): مسموح بس لو المحل مالوش مبيعات ومفيش دفع حقيقي —
  // حماية من مسح محل شغّال بالغلط. المحلات الشغّالة بتفضل بالإلغاء الناعم.
  if (new URL(req.url).searchParams.get('permanent') === '1') {
    if (id === PLATFORM_TENANT_ID) {
      return NextResponse.json({ error: 'لا يمكن حذف حساب المنصة' }, { status: 400 })
    }
    const [salesCount, paidCount, owner] = await Promise.all([
      db.sale.count({ where: { tenantId: id } }),
      db.subscription.count({ where: { tenantId: id, amountPaid: { gt: 0 } } }),
      db.user.findMany({ where: { tenantId: id }, select: { id: true, email: true }, take: 5 }),
    ])
    if (salesCount > 0 || paidCount > 0) {
      return NextResponse.json(
        { error: 'المحل ده عليه مبيعات أو مدفوعات — الحذف النهائي غير مسموح. استخدم الإلغاء العادي.' },
        { status: 409 },
      )
    }
    const r = await hardDeleteTenant({
      id,
      email: (existing.ownerEmail || owner[0]?.email || '').trim().toLowerCase(),
      phone: (existing.ownerPhone || existing.phone || '').trim(),
      userIds: owner.map((u) => u.id),
    })
    return NextResponse.json({
      ok: true,
      mode: r.mode,
      audienceCsv: r.csvLine ? `email,phone\n${r.csvLine}` : null,
    })
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

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
