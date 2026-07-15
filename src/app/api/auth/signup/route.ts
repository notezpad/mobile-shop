import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 14

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const shopName = String(body.shopName ?? '').trim()
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim()
  const password = String(body.password ?? '')
  const agree = body.agree === true || body.agree === 'true'

  if (!shopName) {
    return NextResponse.json({ error: 'اسم المحل مطلوب' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
      { status: 400 }
    )
  }
  if (!agree) {
    return NextResponse.json(
      { error: 'يجب الموافقة على الشروط والأحكام' },
      { status: 400 }
    )
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'هذا البريد الإلكتروني مسجّل بالفعل' },
      { status: 400 }
    )
  }

  const hash = await hashPassword(password)

  // Find or create the trial plan
  let trialPlan = await db.plan.findUnique({ where: { code: 'trial' } })
  if (!trialPlan) {
    trialPlan = await db.plan.create({
      data: {
        code: 'trial',
        name: 'الباقة التجريبية',
        description: 'تجربة مجانية لمدة 14 يوم',
        priceMonthly: 0,
        priceYearly: 0,
        maxUsers: 1,
        maxProducts: 50,
        maxBranches: 1,
        trialDays: TRIAL_DAYS,
        features: JSON.stringify(['حتى 50 منتج', 'مستخدم واحد', 'تجربة 14 يوم']),
        isActive: true,
        sortOrder: 0,
      },
    })
  }

  const endDate = new Date()
  endDate.setDate(endDate.getDate() + (trialPlan.trialDays || TRIAL_DAYS))

  // Create tenant + admin user + trial subscription in one transaction
  const tenant = await db.tenant.create({
    data: {
      shopName,
      phone: phone || null,
      ownerEmail: email,
      ownerPhone: phone || null,
      status: 'active',
      users: {
        create: {
          name,
          email,
          password: hash,
          role: 'ADMIN',
        },
      },
      subscriptions: {
        create: {
          planId: trialPlan.id,
          status: 'active',
          startDate: new Date(),
          endDate,
          period: 'trial',
          amountPaid: 0,
          paymentMethod: 'manual',
          paymentNote: 'تجربة تلقائية عند التسجيل',
        },
      },
    },
    include: { users: true, subscriptions: true },
  })

  const user = tenant.users[0]
  await createSession({
    id: user.id,
    tenantId: tenant.id,
    role: user.role,
    name: user.name,
    email: user.email,
    branchId: null,
  })

  return NextResponse.json({
    ok: true,
    user: {
      userId: user.id,
      name: user.name,
      role: user.role,
      tenantId: tenant.id,
      email: user.email,
      branchId: null,
    },
  })
}
