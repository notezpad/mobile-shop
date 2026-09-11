import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { computeEndDate } from '@/lib/admin-utils'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // NOTE: we intentionally use getSession() here instead of requireAuth().
  // requireAuth() enforces an active subscription, which would make it
  // impossible for a tenant with an EXPIRED subscription to ever redeem a
  // new code — exactly the situation this endpoint exists to resolve.
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'غير مصرح — يرجى تسجيل الدخول' }, { status: 401 })
  }
  // Super admins have no tenant of their own and should manage tenant
  // subscriptions from the admin panel, not this self-service endpoint.
  if (session.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'استخدم لوحة الأدمن لإدارة اشتراكات المحلات' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const code = String(body.code ?? '').trim().toUpperCase()
  // SECURITY: tenantId always comes from the authenticated session, never
  // from the request body. Previously it was read from `body.tenantId`,
  // which let anyone with a valid activation code redeem it against an
  // arbitrary tenant of their choosing.
  const tenantId = session.tenantId

  if (!code || !tenantId) {
    return NextResponse.json({ error: 'الكود مطلوب' }, { status: 400 })
  }

  const ac = await db.activationCode.findUnique({
    where: { code },
    include: { plan: true },
  })
  if (!ac) {
    return NextResponse.json({ error: 'كود غير صحيح' }, { status: 404 })
  }
  if (ac.redeemedAt) {
    return NextResponse.json({ error: 'هذا الكود مستخدم بالفعل' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  const startDate = new Date()
  const endDate = computeEndDate(startDate, ac.period as 'monthly' | 'yearly' | 'trial', ac.plan.trialDays)

  const sub = await db.subscription.create({
    data: {
      tenantId,
      planId: ac.planId,
      status: 'active',
      startDate,
      endDate,
      period: ac.period,
      amountPaid: 0,
      paymentMethod: 'code',
      paymentNote: `تفعيل بكود: ${code}`,
    },
  })

  await db.activationCode.update({
    where: { id: ac.id },
    data: { redeemedAt: new Date(), tenantId },
  })

  await db.tenant.update({
    where: { id: tenantId },
    data: { status: 'active' },
  })

  return NextResponse.json({
    ok: true,
    subscription: {
      id: sub.id,
      endDate: sub.endDate.toISOString(),
      planId: ac.planId,
      planName: ac.plan.name,
      period: sub.period,
    },
  })
}
