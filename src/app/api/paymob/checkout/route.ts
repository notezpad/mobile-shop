import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import { createPaymobIntention, toCents } from '@/lib/paymob'
import { runNonBlocking, trackServerEvent, extractRequestContext } from '@/lib/tracking/server'
import { TRACKING_EVENTS } from '@/lib/tracking/types'

export const dynamic = 'force-dynamic'

async function __POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────
  let session
  try {
    // 🛡️ 2026-10-07 (v15): requireAuthIgnoreSubscription — المستخدم اللي
    // باقته انتهت هو بالظبط اللي لازم يقدر يدفع! قبل كده كان بياخد 402
    // «اشتراكك منتهي» عند إنشاء جلسة الدفع نفسها = طريق مسدود: مش بيقدر
    // يجدد ولا يدفع. تسجيل الدخول مطلوب زي ما هو.
    session = await requireAuthIgnoreSubscription()
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
  // 🔒 الباقة المخفية مش متاحة للدفع الذاتي — إلا لو المحل عليها فعلاً (تجديد لباقة اتخصصت له من الأدمن)
  if (plan.visibility === 'hidden') {
    const hasPlan = await db.subscription.findFirst({
      where: { tenantId: session.tenantId, planId: plan.id },
      select: { id: true },
    })
    if (!hasPlan) return NextResponse.json({ error: 'الباقة غير متاحة' }, { status: 404 })
  }
  if (!tenant) return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })

  const amount = period === 'yearly' ? plan.priceYearly : plan.priceMonthly
  if (amount <= 0) {
    return NextResponse.json(
      { error: 'لا يمكن الدفع لهذه الباقة — السعر صفر' },
      { status: 400 }
    )
  }

  // ── 4. Create PENDING subscription row ─────────────────────────────
  // 🛡️ 2026-09-27 ROOT FIX: a pending (unpaid) row must carry ZERO duration.
  // Previously endDate was set to now+30/+365 days here, so simply opening the
  // Paymob page granted a full paid period even if the user never paid.
  // The real endDate is computed ONLY in the webhook, after Paymob confirms
  // a successful transaction.
  const startDate = new Date()
  const endDate = new Date(startDate)

  // Close out abandoned checkout attempts for this tenant (older than 30 min)
  await db.subscription.updateMany({
    where: {
      tenantId: session.tenantId,
      status: 'pending',
      createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    data: { status: 'failed', paymentNote: 'paymob-abandoned-checkout' },
  }).catch(() => {})

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

    // ═══ 📊 Tracking: InitiateCheckout ═══
    // يُطلق هنا فقط: بيانات الباقة حقيقية + جلسة دفع Paymob أُنشئت
    // فعلياً (اشتراك pending حقيقي + intention ناجح). ليس عند زيارة
    // صفحة الأسعار ولا عند اختيار الباقة ولا مجرد الضغط على زر.
    const checkoutEventId = `checkout-sub-${pendingSub.id}`
    // يشمل clientIp/userAgent + gaClientId/gaSessionId/ttp من كوكيز المتصفح
    const reqCtx = extractRequestContext(req.headers)
    runNonBlocking(() => trackServerEvent({
      eventName: TRACKING_EVENTS.InitiateCheckout,
      eventId: checkoutEventId,
      params: {
        value: amount,
        currency: 'EGP',
        contentName: plan.name, contentType: 'subscription_plan',
        contentId: String(plan.id), planId: String(plan.id),
        planName: plan.name, period,
      },
      context: {
        ...reqCtx,
        email: email,
        phone: phone || undefined,
        externalId: session.userId,
      },
      subscriptionId: pendingSub.id,
    }))

    return NextResponse.json({
      ok: true,
      checkoutUrl,
      merchantOrderId,
      subscriptionId: pendingSub.id,
      amount,
      period,
      planName: plan.name,
      // 📊 المتصفح يُطلق InitiateCheckout بنفس event_id → Deduplication
      tracking: { checkoutEventId, value: amount, currency: 'EGP', planId: String(plan.id), planName: plan.name, period },
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

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
