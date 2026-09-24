import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import {
  paymobAuth,
  paymobCreateOrder,
  paymobPaymentKey,
  paymobIframeUrl,
  toCents,
} from '@/lib/paymob'
import { readEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * POST /api/paymob/checkout
 *
 * Body:
 *   {
 *     planId: number,
 *     period: 'monthly' | 'yearly',
 *     successUrl?: string,   // optional — defaults to /upgrade?status=success
 *     cancelUrl?: string     // optional — defaults to /upgrade?status=cancelled
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     checkoutUrl: string,        // iframe URL the user is redirected to
 *     paymobOrderId: number,      // for verification after redirect
 *     merchantOrderId: string    // = subscriptionId, for matching on webhook
 *   }
 *
 * Flow:
 *   1. Validate request + tenant's plan + period.
 *   2. Create a PENDING subscription row in our DB (status='pending', amountPaid=0).
 *      This is what the webhook will activate once payment succeeds.
 *   3. Call Paymob: auth → create order → payment key → iframe URL.
 *   4. Return iframe URL to the client.
 */
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

  // Optional customer data — used for Paymob's billing_data
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
  if (!plan) {
    return NextResponse.json({ error: 'الباقة غير متاحة' }, { status: 404 })
  }
  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  const amount = period === 'yearly' ? plan.priceYearly : plan.priceMonthly
  if (amount <= 0) {
    return NextResponse.json(
      { error: 'لا يمكن الدفع لهذه الباقة — السعر صفر' },
      { status: 400 }
    )
  }

  // ── 4. Create PENDING subscription row ────────────────────────────────
  // We track the payment attempt here. On webhook success, we flip status='active'
  // and set amountPaid. On webhook failure (or timeout), a daily cleanup job can
  // delete stale pending subscriptions older than 24h.
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

  // ── 5. Call Paymob ────────────────────────────────────────────────
  try {
    const token = await paymobAuth()
    const merchantOrderId = `sub-${pendingSub.id}`
    const order = await paymobCreateOrder(token, toCents(amount), merchantOrderId, [
      {
        name: `${plan.name} - ${period === 'yearly' ? 'سنوي' : 'شهري'}`,
        amount_cents: toCents(amount),
        quantity: 1,
      },
    ])
    const integrationId = Number(readEnv('PAYMOB_INTEGRATION_ID'))
    if (!integrationId) throw new Error('PAYMOB_INTEGRATION_ID غير مضبوط')

    // Use customer data if provided (from checkout form), otherwise fall back to session data.
    const fullName = customer?.name?.trim() || session.name || tenant.shopName || 'Customer'
    const firstName = fullName.split(' ')[0]
    const lastName = fullName.split(' ').slice(1).join(' ') || firstName
    const email = customer?.email?.trim() || session.email || `${session.userId}@local`
    const phone = customer?.phone?.trim() || '01000000000'

    const paymentKey = await paymobPaymentKey(token, toCents(amount), order.id, integrationId, {
      email,
      firstName,
      lastName,
      phone,
    })
    const iframeUrl = paymobIframeUrl(paymentKey)

    // Store paymob order id on the subscription's paymentNote for traceability
    await db.subscription.update({
      where: { id: pendingSub.id },
      data: {
        paymentNote: `paymob-order:${order.id}|by:${session.email}|success:${successUrl}|cancel:${cancelUrl}`,
      },
    })

    return NextResponse.json({
      ok: true,
      checkoutUrl: iframeUrl,
      paymobOrderId: order.id,
      merchantOrderId,
      subscriptionId: pendingSub.id,
      amount,
      period,
      planName: plan.name,
    })
  } catch (e: any) {
    // Mark the subscription as failed so cleanup can remove it later
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
