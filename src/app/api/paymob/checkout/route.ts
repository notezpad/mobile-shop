import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { createPaymobIntention, toCents } from '@/lib/paymob'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  if (!session || session.role === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'الأدمن الأعلى لديه اشتراك دائم ولا يحتاج للدفع' },
      { status: 400 }
    )
  }

  // ── 2. Validate body ────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const planId = Number(body.planId)
  const period = body.period === 'yearly' ? 'yearly' : 'monthly'
  const successUrl = String(body.successUrl ?? '/checkout/callback?status=success')
  const cancelUrl = String(body.cancelUrl ?? '/checkout/callback?status=failed&reason=user_cancelled')

  const customer = body.customer && typeof body.customer === 'object'
    ? {
        name: String(body.customer.name ?? ''),
        phone: String(body.customer.phone ?? ''),
        email: String(body.customer.email ?? ''),
      }
    : null

  if (!planId || Number.isNaN(planId)) {
    return NextResponse.json({ error: 'الباقة مطلوبة' }, { status: 400 })
  }

  // ── 3. Look up plan + tenant ────────────────────────────────────────
  const [plan, tenant] = await Promise.all([
    db.plan.findUnique({ where: { id: planId, isActive: true } }),
    db.tenant.findUnique({
      where: { id: session.tenantId },
      select: { id: true, shopName: true, status: true },
    }),
  ])
  if (!plan) return NextResponse.json({ error: 'الباقة غير متاحة' }, { status: 404 })
  if (!tenant) return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })

  const amount = period === 'yearly' ? plan.priceYearly : plan.priceMonthly
  if (amount <= 0) {
    return NextResponse.json(
      { error: 'لا يمكن الدفع لهذه الباقة — السعر صفر' },
      { status: 400 }
    )
  }

  // ── 4. Create PENDING subscription row ─────────────────────────────
  const startDate = new Date()
  const endDate = new Date(startDate)
  if (period === 'monthly') endDate.setDate(endDate.getDate() + 30)
  else endDate.setDate(endDate.getDate() + 365)

  const pendingSub = await db.subscription.create({
    data: {
      tenantId: session.tenantId,
      planId: plan.id,
      status: 'pending',
      startDate,
      endDate,
      period,
      amountPaid: 0,
      paymentMethod: 'paymob',
      paymentNote: `paymob-checkout-initiated-by:${session.email}`,
    },
  })

  // ── 5. Call Paymob Intention API ───────────────────────────────────
  try {
    const merchantOrderId = `sub-${pendingSub.id}`
    const fullName = customer?.name?.trim() || session.name || tenant.shopName || 'Customer'
    const email = customer?.email?.trim() || session.email || `${session.userId}@local`
    const phone = customer?.phone?.trim() || '01000000000'
    const planLabel = `${plan.name} - ${period === 'yearly' ? 'سنوي' : 'شهري'}`

    const { checkoutUrl, intentionId } = await createPaymobIntention({
      merchantOrderId,
      amountCents: toCents(amount),
      planLabel,
      customer: { name: fullName, phone, email },
    })

    await db.subscription.update({
      where: { id: pendingSub.id },
      data: {
        paymentNote: `paymob-intention:${intentionId}|by:${session.email}|success:${successUrl}|cancel:${cancelUrl}`,
      },
    })

    return NextResponse.json({
      ok: true,
      checkoutUrl,
      merchantOrderId,
      subscriptionId: pendingSub.id,
      amount,
      period,
      planName: plan.name,
    })
  } catch (e: any) {
    await db.subscription.update({
      where: { id: pendingSub.id },
      data: {
        status: 'failed',
        paymentNote: `paymob-init-error:${e?.message ?? 'unknown'}`,
      },
    })
    return NextResponse.json(
      { error: e?.message || 'فشل إنشاء جلسة الدفع' },
      { status: 500 }
    )
  }
}
