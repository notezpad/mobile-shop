import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import { runNonBlocking, trackServerEvent, extractRequestContext } from '@/lib/tracking/server'
import { TRACKING_EVENTS } from '@/lib/tracking/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/paymob/status?merchant_order_id=sub-<subscriptionId>
 *
 * Used by the /checkout/callback page to poll for the subscription's
 * actual status (after the user returns from Paymob). The webhook may
 * arrive before or after the user lands on the callback page — polling
 * ensures we catch the paid state within ~60s.
 *
 * Returns:
 *   { status: 'pending' | 'paid' | 'failed' }
 */
async function __GET(req: NextRequest) {
  let session
  try {
    // 🛡️ v15: مستخدم انتهت باقته بيرجع من Paymob ويستنين تأكيد الدفع —
    // لازم يعرف يستعلم عن حالة الدفع حتى وهو منتهي (كان 402 قبل كده).
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const merchantOrderId = url.searchParams.get('merchant_order_id')

  if (!merchantOrderId) {
    return NextResponse.json({ error: 'merchant_order_id required' }, { status: 400 })
  }

  // Parse sub-<id> format
  const match = merchantOrderId.match(/^sub-(\d+)$/)
  if (!match) {
    return NextResponse.json({ error: 'Invalid merchant_order_id format' }, { status: 400 })
  }
  const subscriptionId = Number(match[1])

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, status: true, tenantId: true },
  })

  if (!sub) {
    return NextResponse.json({ status: 'failed' })
  }

  // Security: only the tenant owner (or super admin) can check status
  if (session.role !== 'SUPER_ADMIN' && session.tenantId !== sub.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Map subscription status to UI status
  let status: 'pending' | 'paid' | 'failed'
  if (sub.status === 'active') status = 'paid'
  else if (sub.status === 'failed' || sub.status === 'cancelled') status = 'failed'
  else status = 'pending'

  // ═══ 📊 Tracking: ضمان وصول Purchase (Self-Healing) ═══
  // لو الاشتراك مدفوع لكن حدث Purchase لم يُسجل لأي منصة (Webhook
  // تأخر أو فشل إرسال التتبع مؤقتاً) — نطلبه من هنا بنفس eventId
  // الثابت (purchase-sub-<id>) → Idempotency تمنع أي تكرار.
  // الاستعلام الخفيف يجري فقط في حالة paid.
  if (status === 'paid') {
    const hasPurchaseEvent = await db.trackingEvent.findFirst({
      where: { eventId: `purchase-sub-${subscriptionId}`, status: 'sent' },
      select: { id: true },
    }).catch(() => null)
    if (!hasPurchaseEvent) {
      const full = await db.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true, tenant: true },
      })
      if (full && full.status === 'active') {
        const txnMatch = full.paymentNote?.match(/paymob-txn:(\d+)/)
        // هذا المسار يُستدعى من متصفح المستخدم (صفحة النجاح) — كوكيز GA4/TikTok
        // متاحة في الطلب لتعزيز المطابقة. نفس eventId الثابت → لا تكرار.
        const reqCtx = extractRequestContext(req.headers)
        runNonBlocking(() => trackServerEvent({
          eventName: TRACKING_EVENTS.Purchase,
          eventId: `purchase-sub-${full.id}`,
          params: {
            value: full.amountPaid,
            currency: 'EGP',
            transactionId: String(txnMatch?.[1] || full.id),
            contentName: full.plan.name, contentType: 'subscription_plan',
            contentId: String(full.plan.id), planId: String(full.plan.id),
            planName: full.plan.name, period: full.period,
          },
          context: {
            ...reqCtx,
            email: full.tenant?.ownerEmail || undefined,
            externalId: full.tenantId,
          },
          subscriptionId: full.id,
        }))
      }
    }
  }

  return NextResponse.json({ status })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
