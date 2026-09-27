import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { paymobVerifyHmacAsync } from '@/lib/paymob'
import { readEnv } from '@/lib/env'
import { computeEndDate, computeAmount } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/paymob/webhook
 *
 * Paymob server-to-server callback. Paymob sends transaction updates here
 * (success, failure, void, refund). We verify the HMAC signature using
 * PAYMOB_HMAC_SECRET and, on success, flip the matching PENDING subscription
 * to ACTIVE.
 *
 * Configuration:
 *   - In the Paymob dashboard, set the webhook URL to:
 *       https://your-domain.com/api/paymob/webhook
 *   - The "HMAC Secret" in Paymob dashboard must match PAYMOB_HMAC_SECRET.
 *
 * Body is form-urlencoded (Paymob default). We read it as URLSearchParams.
 */
async function __POST(req: NextRequest) {
  const hmacSecret = readEnv('PAYMOB_HMAC_SECRET')
  if (!hmacSecret) {
    console.error('[paymob/webhook] PAYMOB_HMAC_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Read form-urlencoded body
  const text = await req.text()
  const params = new URLSearchParams(text)

  // ── HMAC verification ────────────────────────────────────────────
  const valid = await paymobVerifyHmacAsync(params, hmacSecret)
  if (!valid) {
    console.warn('[paymob/webhook] HMAC verification failed — ignoring')
    return NextResponse.json({ error: 'HMAC verification failed' }, { status: 400 })
  }

  // ── Extract transaction data ────────────────────────────────────────
  // The webhook callback includes transaction fields either at the top level
  // or nested inside `obj`. We check both.
  const obj = (() => {
    const objStr = params.get('obj')
    if (objStr) {
      try { return JSON.parse(objStr) } catch { return null }
    }
    // Fallback — flatten params into an object
    const out: Record<string, string> = {}
    for (const [k, v] of params.entries()) out[k] = v
    return out
  })()

  if (!obj) {
    return NextResponse.json({ error: 'No transaction object' }, { status: 400 })
  }

  const success = String(obj.success ?? params.get('success')) === 'true'
  const txnId = String(obj.id ?? params.get('id') ?? '')
  const merchantOrderId = String(obj.order?.merchant_order_id ?? obj.merchant_order_id ?? params.get('merchant_order_id') ?? '')

  // `is_voided` / `is_refunded` indicate post-payment corrections
  const isVoided = String(obj.is_voided ?? params.get('is_voided')) === 'true'
  const isRefunded = String(obj.is_refunded ?? params.get('is_refunded')) === 'true'

  if (!merchantOrderId) {
    console.warn('[paymob/webhook] No merchant_order_id in payload')
    return NextResponse.json({ error: 'Missing merchant_order_id' }, { status: 400 })
  }

  // merchantOrderId = "sub-<subscriptionId>" (set in /api/paymob/checkout)
  const subIdMatch = merchantOrderId.match(/^sub-(\d+)$/)
  if (!subIdMatch) {
    console.warn(`[paymob/webhook] Unrecognized merchant_order_id: ${merchantOrderId}`)
    return NextResponse.json({ ok: true }) // 200 so Paymob doesn't retry
  }
  const subscriptionId = Number(subIdMatch[1])

  // ── Process the update ────────────────────────────────────────────
  try {
    const sub = await db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, tenant: true },
    })

    if (!sub) {
      console.warn(`[paymob/webhook] Subscription ${subscriptionId} not found`)
      return NextResponse.json({ ok: true })
    }

    // 🛡️ Idempotency: never re-activate / re-extend an already-active row.
    if (success && !isVoided && !isRefunded && sub.status === 'active') {
      console.log(`[paymob/webhook] Subscription ${subscriptionId} already active — ignoring duplicate callback`)
      return NextResponse.json({ ok: true })
    }

    if (success && !isVoided && !isRefunded) {
      // ── Payment succeeded — activate subscription ──
      const amountCents = Number(obj.amount_cents ?? 0)
      const amount = amountCents / 100

      // Use our helper to compute the proper end date. If the user already has
      // an active subscription that hasn't expired, EXTEND the end date
      // instead of starting a new one — this is the standard SaaS behaviour.
      // 🛡️ 2026-09-27: base the extension on the tenant's real ACTIVE
      // subscription (if any), never on the pending row's own endDate.
      const now = new Date()
      const currentActive = await db.subscription.findFirst({
        where: { tenantId: sub.tenantId, status: 'active', endDate: { gt: now } },
        orderBy: { endDate: 'desc' },
      })
      const baseDate = currentActive && currentActive.endDate > now ? currentActive.endDate : now
      const newEndDate = computeEndDate(baseDate, sub.period as 'monthly' | 'yearly', sub.plan.trialDays)

      await db.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'active',
          startDate: now,
          endDate: newEndDate,
          amountPaid: computeAmount(sub.plan, sub.period as 'monthly' | 'yearly', amount),
          paymentMethod: 'paymob',
          paymentNote: `paymob-txn:${txnId}|order:${obj.order?.id ?? ''}`,
        },
      })

      // Reactivate the tenant too (in case it was marked expired)
      await db.tenant.update({
        where: { id: sub.tenantId },
        data: { status: 'active' },
      })

      console.log(`[paymob/webhook] Subscription ${subscriptionId} activated — end ${newEndDate.toISOString()}`)
    } else if (isVoided || isRefunded) {
      // ── Transaction voided / refunded — revert subscription ──
      // If the subscription is still pending, mark failed.
      // If it was already active, we leave it active but log the refund —
      // admin can decide to revoke manually.
      if (sub.status === 'pending') {
        await db.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'failed',
            paymentNote: `paymob-txn:${txnId}|voided/refunded`,
          },
        })
      } else {
        await db.subscription.update({
          where: { id: subscriptionId },
          data: {
            paymentNote: `paymob-txn:${txnId}|voided/refunded-on-active-sub`,
          },
        })
      }
      console.log(`[paymob/webhook] Subscription ${subscriptionId} void/refund recorded`)
    } else {
      // ── Payment failed (success=false) — mark subscription failed ──
      if (sub.status === 'pending') {
        await db.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'failed',
            paymentNote: `paymob-txn:${txnId}|payment-failed`,
          },
        })
      }
      console.log(`[paymob/webhook] Subscription ${subscriptionId} payment failed`)
    }
  } catch (e: any) {
    console.error('[paymob/webhook] Error processing webhook:', e?.message ?? e)
    // Return 500 so Paymob retries
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET is here only for testing — Paymob always uses POST for the webhook.
async function __GET() {
  return NextResponse.json({
    ok: true,
    message: 'Paymob webhook endpoint. Configure this URL in your Paymob dashboard.',
  })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
