import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeEndDate } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const code = String(body.code ?? '').trim().toUpperCase()
  const tenantId = String(body.tenantId ?? '').trim()

  if (!code || !tenantId) {
    return NextResponse.json({ error: 'الكود والمعرّف مطلوبان' }, { status: 400 })
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
