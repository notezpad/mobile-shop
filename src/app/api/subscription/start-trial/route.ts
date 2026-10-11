import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { countableSubWhere } from '@/lib/subscription-status'
import { db } from '@/lib/db'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import { runNonBlocking, trackServerEvent, extractRequestContext } from '@/lib/tracking/server'
import { TRACKING_EVENTS } from '@/lib/tracking/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/subscription/start-trial
 *
 * Body: { planCode: string }
 *
 * Starts a 14-day trial of the chosen plan for the logged-in tenant.
 * No payment required. The trial grants the full features of the chosen
 * plan for 14 days, after which the user is encouraged (via a banner)
 * to subscribe via Paymob.
 *
 * Rules:
 *   1. Only authenticated non-super-admin tenants can start a trial.
 *   2. The plan must exist, be active, and be a paid plan (priceMonthly > 0
 *      OR priceYearly > 0). Zero-price plans (trial/free) are rejected.
 *   3. The tenant must NOT currently have an active subscription that
 *      hasn't expired yet. If they do, they must either wait for it
 *      to expire or upgrade via /checkout (Paymob).
 *   4. 🛡️ 2026-10-12: ONE trial per tenant, EVER — on ANY plan. Previously only
 *      re-trialing the SAME plan was blocked, so a shop could chain a trial
 *      on each of the 4 plans (~56 free days). Switching plans *during* an
 *      active trial is still allowed via /api/subscription/switch-plan.
 *
 * Response:
 *   { ok: true, planCode, planName, endDate, trialDays }
 *   { error: string }
 */
async function __POST(req: NextRequest) {
  let session
  try {
    // 🛡️ 2026-10-07 (v15): requireAuthIgnoreSubscription بدل requireAuth —
    // قبل كده صاحب التجربة المنتهية كان بياخد 402 «اشتراكك منتهي» قبل ما
    // يوصل لمنطق التجربة نفسه! مع إن القواعد تحت أصلاً بتمنع إعادة تجربة
    // نفس الباقة وبتسمح بتجربة باقة مختلفة — وده طبيعي: التجربة هي طريق
    // الرجوع للمستخدم اللي باقتها انتهت. تسجيل الدخول مطلوب زي ما هو.
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    if (err) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  if (session.role === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'الأدمن الأعلى لديه اشتراك دائم ولا يحتاج للتجربة' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const planCode = String(body.planCode ?? '').trim()
  if (!planCode) {
    return NextResponse.json({ error: 'كود الباقة مطلوب' }, { status: 400 })
  }

  // ── Look up the plan ──
  const plan = await db.plan.findUnique({ where: { code: planCode } })
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'الباقة غير متاحة' }, { status: 404 })
  }
  // 🛡️ Reject zero-price plans — user must pick a real paid plan
  if (plan.priceMonthly === 0 && plan.priceYearly === 0) {
    return NextResponse.json(
      { error: 'لا يمكن بدء تجربة على باقة مجانية — اختر باقة مدفوعة' },
      { status: 400 },
    )
  }

  // ── Check tenant's existing subscriptions ──
  const now = new Date()
  const latestSub = await db.subscription.findFirst({
    where: { tenantId: session.tenantId, ...countableSubWhere },
    orderBy: { endDate: 'desc' },
    select: { id: true, planId: true, endDate: true, period: true, status: true },
  })

  if (latestSub && latestSub.endDate > now) {
    return NextResponse.json(
      {
        error:
          'لديك اشتراك نشط حالياً. لتبديل الباقة، انتقل إلى صفحة الترقية عبر Paymob.',
        code: 'ACTIVE_SUB_EXISTS',
      },
      { status: 409 },
    )
  }

  // 🛡️ 2026-10-12: تجربة واحدة فقط لكل محل مدى الحياة (أي باقة).
  // كان الفحص بيقارن بآخر اشتراك ونفس الباقة بس، فكان ممكن تجربة على كل باقة
  // ورا بعض. دلوقتي: لو في أي اشتراك سابق من نوع trial → لازم دفع.
  const priorTrial = await db.subscription.findFirst({
    where: { tenantId: session.tenantId, period: 'trial', ...countableSubWhere },
    select: { id: true },
  })
  if (priorTrial) {
    return NextResponse.json(
      {
        error:
          'لقد استخدمت تجربة الـ 14 يوم من قبل. يجب الاشتراك المدفوع للمتابعة.',
        code: 'TRIAL_ALREADY_USED',
      },
      { status: 409 },
    )
  }

  // ── Start the trial ──
  const trialDays = plan.trialDays > 0 ? plan.trialDays : 14
  const startDate = new Date()
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + trialDays)

  const sub = await db.subscription.create({
    data: {
      tenantId: session.tenantId,
      planId: plan.id,
      status: 'active',
      startDate,
      endDate,
      period: 'trial',
      amountPaid: 0,
      paymentMethod: 'manual',
      paymentNote: `trial-started-by:${session.email}|via:pricing-page`,
    },
  })

  // ═══ 📊 Tracking: StartTrial — بعد نجاح بدء التجربة فعلياً ═══
  // (حالة Trial نشطة في قاعدة البيانات = مصدر الحقيقة، ليس الضغط على زر)
  // فشل التتبع لا يؤثر على نجاح التجربة إطلاقاً (Non-blocking).
  const trialEventId = `trial-sub-${sub.id}`
  // يشمل gaClientId/gaSessionId/ttp من كوكيز المتصفح
  const reqCtx = extractRequestContext(req.headers)
  runNonBlocking(() => trackServerEvent({
    eventName: TRACKING_EVENTS.StartTrial,
    eventId: trialEventId,
    params: {
      contentName: plan.name, contentType: 'subscription_plan',
      contentId: String(plan.id), planId: String(plan.id),
      planName: plan.name, period: 'trial', currency: 'EGP',
    },
    context: {
      ...reqCtx,
      email: session.email,
      externalId: session.userId,
    },
    subscriptionId: sub.id,
  }))

  return NextResponse.json({
    ok: true,
    planCode: plan.code,
    planName: plan.name,
    subscriptionId: sub.id,
    endDate: endDate.toISOString(),
    trialDays,
    // 📊 المتصفح يُطلق StartTrial بنفس event_id → Deduplication
    tracking: { trialEventId, planName: plan.name },
  })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
