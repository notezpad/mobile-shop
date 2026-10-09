import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { computeEndDate, computeAmount } from '@/lib/admin-utils'
import { logPlanChange } from '@/lib/plan-billing'

export const dynamic = 'force-dynamic'

async function __PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var adminSession = await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const subId = Number(id)
  if (Number.isNaN(subId)) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const action = String(body.action ?? '')
  const existing = await db.subscription.findUnique({
    where: { id: subId },
    include: { plan: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'الاشتراك غير موجود' }, { status: 404 })
  }

  if (action === 'extend') {
    const period = String(body.period ?? 'monthly') as 'monthly' | 'yearly' | 'trial'
    if (!['monthly', 'yearly', 'trial'].includes(period)) {
      return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 })
    }
    const amountPaid = computeAmount(
      existing.plan,
      period,
      body.amountPaid !== undefined ? Number(body.amountPaid) : undefined
    )
    const paymentMethod = body.paymentMethod ? String(body.paymentMethod) : existing.paymentMethod

    // Extend from the latest end date if still active, otherwise from now
    const now = new Date()
    const baseDate = existing.endDate > now ? existing.endDate : now
    const newEnd = computeEndDate(baseDate, period, existing.plan.trialDays)

    const updated = await db.subscription.update({
      where: { id: subId },
      data: {
        endDate: newEnd,
        status: 'active',
        amountPaid: existing.amountPaid + amountPaid,
        paymentMethod: paymentMethod ?? existing.paymentMethod,
        paymentNote: body.paymentNote
          ? String(body.paymentNote)
          : existing.paymentNote,
      },
    })

    // Make sure tenant is active
    await db.tenant.update({
      where: { id: existing.tenantId },
      data: { status: 'active' },
    })

    // 🛡️ 2026-10-10: سجّل التجديد/التمديد في سجل تغييرات الباقات
    await logPlanChange(db, {
      tenantId: existing.tenantId,
      subscriptionId: existing.id,
      toPlanId: existing.planId,
      toPlanCode: existing.plan?.code ?? null,
      changeType: 'renew',
      period,
      amountPaid,
      note: `extend ${period}${body.paymentNote ? ` — ${String(body.paymentNote)}` : ''}`,
      actor: adminSession.email,
    })

    return NextResponse.json({
      ok: true,
      subscription: {
        id: updated.id,
        endDate: updated.endDate.toISOString(),
        amountPaid: updated.amountPaid,
        status: updated.status,
      },
    })
  }

  if (action === 'status') {
    const status = String(body.status ?? '')
    if (!['active', 'cancelled', 'grace', 'expired'].includes(status)) {
      return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
    }
    const updated = await db.subscription.update({
      where: { id: subId },
      data: { status },
    })
    if (status === 'cancelled' || status === 'expired') {
      await db.tenant.update({
        where: { id: existing.tenantId },
        data: { status: status === 'cancelled' ? 'suspended' : 'expired' },
      })
    } else if (status === 'active') {
      await db.tenant.update({
        where: { id: existing.tenantId },
        data: { status: 'active' },
      })
    }
    return NextResponse.json({ ok: true, subscription: { id: updated.id, status: updated.status } })
  }

  return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
}

async function __DELETE(
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
  const subId = Number(id)
  if (Number.isNaN(subId)) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  const existing = await db.subscription.findUnique({ where: { id: subId } })
  if (!existing) {
    return NextResponse.json({ error: 'الاشتراك غير موجود' }, { status: 404 })
  }

  await db.subscription.update({
    where: { id: subId },
    data: { status: 'cancelled' },
  })

  return NextResponse.json({ ok: true })
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
