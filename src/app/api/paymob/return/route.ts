import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { paymobAuth, paymobGetTransactionByOrderId } from '@/lib/paymob'
import { computeEndDate, computeAmount } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/paymob/return?order=<paymobOrderId>&merchant_order_id=<sub-X>
 *
 * Paymob redirects the user's browser here after payment. The redirect
 * carries the order id but is NOT signed (no HMAC), so we use Paymob's
 * transaction query API to verify the payment server-side.
 *
 * On success:
 *   - Flip the matching PENDING subscription to ACTIVE.
 *   - Redirect to /checkout/callback?status=success&plan=<planCode>&period=<period>
 *
 * On failure:
 *   - Mark the subscription failed (or leave it pending if Paymob still hasn't
 *     sent the webhook — the user can retry by returning to /pricing).
 *   - Redirect to /checkout/callback?status=failed
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const paymobOrderIdStr = url.searchParams.get('order') ?? ''
  const merchantOrderId = url.searchParams.get('merchant_order_id') ?? ''

  if (!paymobOrderIdStr || !merchantOrderId) {
    return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=no_order', req.url))
  }
  const paymobOrderId = Number(paymobOrderIdStr)
  if (Number.isNaN(paymobOrderId)) {
    return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=invalid_order', req.url))
  }

  // Match merchant_order_id back to subscriptionId
  const subIdMatch = merchantOrderId.match(/^sub-(\d+)$/)
  if (!subIdMatch) {
    return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=invalid_merchant_id', req.url))
  }
  const subscriptionId = Number(subIdMatch[1])

  // ── Verify by querying Paymob ──────────────────────────────
  try {
    const token = await paymobAuth()
    const txn = await paymobGetTransactionByOrderId(token, paymobOrderId)

    const sub = await db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, tenant: true },
    })

    if (!sub) {
      return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=no_sub', req.url))
    }

    if (txn.success && !txn.is_voided && !txn.is_refunded && !txn.pending) {
      // ── Payment succeeded ──
      const amount = txn.amount_cents / 100
      const now = new Date()
      const baseDate = sub.endDate > now ? sub.endDate : now
      const newEndDate = computeEndDate(baseDate, sub.period as 'monthly' | 'yearly', sub.plan.trialDays)

      await db.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'active',
          startDate: now,
          endDate: newEndDate,
          amountPaid: computeAmount(sub.plan, sub.period as 'monthly' | 'yearly', amount),
          paymentMethod: 'paymob',
          paymentNote: `paymob-txn:${txn.id}|order:${paymobOrderId}|return-verified`,
        },
      })
      await db.tenant.update({
        where: { id: sub.tenantId },
        data: { status: 'active' },
      })

      const params = new URLSearchParams({
        status: 'success',
        plan: sub.plan.code,
        period: sub.period,
        subscriptionId: String(subscriptionId),
      })
      return NextResponse.redirect(new URL(`/checkout/callback?${params.toString()}`, req.url))
    } else {
      // ── Payment failed / voided / refunded ──
      if (sub.status === 'pending') {
        await db.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'failed',
            paymentNote: `paymob-txn:${txn.id}|return-verified-failed|success=${txn.success}|voided=${txn.is_voided}|refunded=${txn.is_refunded}|pending=${txn.pending}`,
          },
        })
      }
      const params = new URLSearchParams({
        status: 'failed',
        reason: txn.is_voided ? 'voided' : txn.is_refunded ? 'refunded' : txn.pending ? 'pending' : 'declined',
      })
      return NextResponse.redirect(new URL(`/checkout/callback?${params.toString()}`, req.url))
    }
  } catch (e: any) {
    console.error('[paymob/return] Error verifying payment:', e?.message ?? e)
    return NextResponse.redirect(
      new URL('/checkout/callback?status=failed&reason=verification_error', req.url)
    )
  }
}
