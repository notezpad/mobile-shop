import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { countableSubWhere } from '@/lib/subscription-status'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

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
 *   4. If the tenant's most recent subscription is in the past (expired),
 *      we allow starting a new trial of a DIFFERENT plan (so they can
 *      try Pro if they tried Basic before, etc.). Re-trialing the SAME
 *      plan is rejected — they must pay for it.
 *
 * Response:
 *   { ok: true, planCode, planName, endDate, trialDays }
 *   { error: string }
 */
async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
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

  // 🛡️ If user already used a trial of the SAME plan, reject — they must pay.
  if (latestSub && latestSub.period === 'trial' && latestSub.planId === plan.id) {
    return NextResponse.json(
      {
        error:
          'لقد استخدمت تجربة 14 يوم لهذه الباقة من قبل. يجب الاشتراك المدفوع للمتابعة.',
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

  return NextResponse.json({
    ok: true,
    planCode: plan.code,
    planName: plan.name,
    subscriptionId: sub.id,
    endDate: endDate.toISOString(),
    trialDays,
  })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
