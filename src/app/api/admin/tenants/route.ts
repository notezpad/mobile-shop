import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import {
  requireSuperAdmin,
  authErrorResponse,
  hashPassword,
  PLATFORM_TENANT_ID,
} from '@/lib/auth'
import {
  randomPassword,
  computeEndDate,
  computeAmount,
} from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const search = (url.searchParams.get('search') ?? '').trim()
  const status = url.searchParams.get('status') ?? ''
  const planCode = url.searchParams.get('plan') ?? ''

  const where: any = { id: { not: PLATFORM_TENANT_ID } }
  if (status) where.status = status
  if (search) {
    where.OR = [
      { shopName: { contains: search } },
      { ownerEmail: { contains: search } },
      { ownerPhone: { contains: search } },
      { phone: { contains: search } },
    ]
  }
  // 2026-09-17 (v2): Move plan filtering to DB-side (was JS-side after
  // take:500). If the first 500 tenants didn't include any on the
  // filtered plan, the result was incorrectly empty.
  if (planCode && planCode !== 'all') {
    where.subscriptions = {
      some: {
        status: 'active',
        plan: { code: planCode },
      },
    }
  }

  const tenants = await db.tenant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, active: true } },
      subscriptions: {
        orderBy: { endDate: 'desc' },
        take: 1,
        include: { plan: true },
      },
    },
    take: 500,
  })

  const rows = tenants.map((t) => {
    const latestSub = t.subscriptions[0]
    const rowPlanCode = latestSub?.plan?.code ?? '-'
    const planName = latestSub?.plan?.name ?? '-'
    const endDate = latestSub?.endDate ?? null
    return {
      id: t.id,
      shopName: t.shopName,
      phone: t.phone,
      address: t.address,
      ownerEmail: t.ownerEmail,
      ownerPhone: t.ownerPhone,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      lastLoginAt: t.lastLoginAt ? t.lastLoginAt.toISOString() : null,
      usersCount: t.users.length,
      planCode: rowPlanCode,
      planName,
      subscriptionEnd: endDate ? endDate.toISOString() : null,
    }
  })

  // Plan filtering is now done DB-side (above), no JS filtering needed.
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

  const shopName = String(body.shopName ?? '').trim()
  const ownerEmail = String(body.ownerEmail ?? '').trim().toLowerCase()
  const ownerPhone = String(body.ownerPhone ?? '').trim()
  const planId = Number(body.planId)
  const period = String(body.period ?? 'monthly') as
    | 'monthly'
    | 'yearly'
    | 'trial'
  const amountPaidRaw = body.amountPaid
  const paymentMethod = String(body.paymentMethod ?? 'manual')

  if (!shopName) return NextResponse.json({ error: 'اسم المحل مطلوب' }, { status: 400 })
  if (!ownerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return NextResponse.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 })
  }
  if (!planId || Number.isNaN(planId)) {
    return NextResponse.json({ error: 'الباقة مطلوبة' }, { status: 400 })
  }
  if (!['monthly', 'yearly', 'trial'].includes(period)) {
    return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 })
  }

  const plan = await db.plan.findUnique({ where: { id: planId } })
  if (!plan) return NextResponse.json({ error: 'الباقة غير موجودة' }, { status: 404 })

  const existing = await db.user.findUnique({ where: { email: ownerEmail } })
  if (existing) {
    return NextResponse.json({ error: 'هذا البريد مسجّل بالفعل' }, { status: 400 })
  }

  const password = randomPassword(8)
  const hash = await hashPassword(password)

  const startDate = new Date()
  const endDate = computeEndDate(startDate, period, plan.trialDays)
  const amountPaid = computeAmount(plan, period, amountPaidRaw)

  const tenant = await db.tenant.create({
    data: {
      shopName,
      phone: ownerPhone || null,
      ownerEmail,
      ownerPhone: ownerPhone || null,
      status: 'active',
      users: {
        create: {
          name: shopName,
          email: ownerEmail,
          password: hash,
          role: 'ADMIN',
        },
      },
      subscriptions: {
        create: {
          planId: plan.id,
          status: 'active',
          startDate,
          endDate,
          period,
          amountPaid,
          paymentMethod,
          paymentNote: 'تم الإنشاء بواسطة الأدمن الأعلى',
        },
      },
    },
    include: { users: true },
  })

  const adminUser = tenant.users[0]

  return NextResponse.json({
    ok: true,
    tenant: {
      id: tenant.id,
      shopName: tenant.shopName,
      ownerEmail: tenant.ownerEmail,
    },
    user: {
      email: adminUser.email,
      password,
    },
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
