import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse, PLATFORM_TENANT_ID } from '@/lib/auth'
import { computeEndDate, computeAmount } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? ''
  const planIdStr = url.searchParams.get('planId') ?? ''
  const fromStr = url.searchParams.get('from') ?? ''
  const toStr = url.searchParams.get('to') ?? ''

  const where: any = { tenant: { id: { not: PLATFORM_TENANT_ID } } }
  // محاولات الدفع غير المكتملة (pending/failed) مش اشتراكات: كل ما حد يفتح صفحة Paymob
  // ويخرج من غير دفع بيتسجّل صف هنا. فبنخفيها من القائمة الافتراضية،
  // وتفضل متاحة بـ ?status=unfinished (مثلاً لو عميل قال «دفعت ومتفعّلش»).
  const UNFINISHED = ['pending', 'failed']
  if (status === 'unfinished') where.status = { in: UNFINISHED }
  else if (status) where.status = status
  else where.status = { notIn: UNFINISHED }
  if (planIdStr) where.planId = Number(planIdStr)
  if (fromStr || toStr) {
    where.createdAt = {}
    if (fromStr) where.createdAt.gte = new Date(fromStr)
    if (toStr) where.createdAt.lte = new Date(toStr)
  }

  const items = await db.subscription.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { tenant: true, plan: true },
    take: 500,
  })

  const rows = items.map((s) => ({
    id: s.id,
    tenantId: s.tenantId,
    shopName: s.tenant.shopName,
    planId: s.planId,
    planCode: s.plan.code,
    planName: s.plan.name,
    status: s.status,
    period: s.period,
    amountPaid: s.amountPaid,
    paymentMethod: s.paymentMethod,
    paymentNote: s.paymentNote,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    createdAt: s.createdAt.toISOString(),
  }))

  return NextResponse.json({ items: rows, total: rows.length })
}

async function __POST(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const tenantId = String(body.tenantId ?? '')
  const planId = Number(body.planId)
  const period = String(body.period ?? 'monthly') as 'monthly' | 'yearly' | 'trial'
  const amountPaidRaw = body.amountPaid
  const paymentMethod = String(body.paymentMethod ?? 'manual')
  const paymentNote = body.paymentNote ? String(body.paymentNote) : null

  if (!tenantId || !planId || Number.isNaN(planId)) {
    return NextResponse.json({ error: 'المحل والباقة مطلوبان' }, { status: 400 })
  }
  if (!['monthly', 'yearly', 'trial'].includes(period)) {
    return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 })
  }

  const [tenant, plan] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId } }),
    db.plan.findUnique({ where: { id: planId } }),
  ])
  if (!tenant) return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  if (!plan) return NextResponse.json({ error: 'الباقة غير موجودة' }, { status: 404 })

  const startDate = new Date()
  const endDate = computeEndDate(startDate, period, plan.trialDays)
  const amountPaid = computeAmount(plan, period, amountPaidRaw)

  // 2026-09-17 (v2): Cancel any existing active subscriptions for this
  // tenant before creating a new one. Otherwise the tenant ends up with
  // multiple active subscriptions — causing MRR double-counting in stats,
  // confusion in /api/subscription (which returns the latest one), and
  // incorrect activeSubscriptions count in the dashboard.
  await db.subscription.updateMany({
    where: { tenantId, status: 'active' },
    data: { status: 'cancelled' },
  })

  const sub = await db.subscription.create({
    data: {
      tenantId,
      planId,
      status: 'active',
      startDate,
      endDate,
      period,
      amountPaid,
      paymentMethod,
      paymentNote,
    },
    include: { plan: true, tenant: true },
  })

  await db.tenant.update({
    where: { id: tenantId },
    data: { status: 'active' },
  })

  return NextResponse.json({
    ok: true,
    subscription: {
      id: sub.id,
      tenantId: sub.tenantId,
      shopName: sub.tenant.shopName,
      planCode: sub.plan.code,
      planName: sub.plan.name,
      status: sub.status,
      period: sub.period,
      amountPaid: sub.amountPaid,
      paymentMethod: sub.paymentMethod,
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate.toISOString(),
    },
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
