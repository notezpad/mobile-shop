import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeEndDate, computeAmount } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/paymob/return?merchant_order_id=sub-<X>
 *
 * Paymob may redirect the browser here after Unified Checkout.
 * With the Intention API the primary source of truth is the webhook;
 * this endpoint simply reads the subscription status from our DB
 * (already updated by the webhook) and redirects accordingly.
 */
async function __GET(req: NextRequest) {
  const url = new URL(req.url)
  const merchantOrderId = url.searchParams.get('merchant_order_id') ?? ''

  if (!merchantOrderId) {
    return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=no_order', req.url))
  }

  const subIdMatch = merchantOrderId.match(/^sub-(\d+)$/)
  if (!subIdMatch) {
    return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=invalid_merchant_id', req.url))
  }
  const subscriptionId = Number(subIdMatch[1])

  try {
    const sub = await db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    })

    if (!sub) {
      return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=no_sub', req.url))
    }

    if (sub.status === 'active') {
      const params = new URLSearchParams({
        status: 'success',
        plan: sub.plan.code,
        period: sub.period,
        subscriptionId: String(subscriptionId),
      })
      return NextResponse.redirect(new URL(`/checkout/callback?${params.toString()}`, req.url))
    }

    if (sub.status === 'failed' || sub.status === 'cancelled') {
      return NextResponse.redirect(new URL('/checkout/callback?status=failed&reason=declined', req.url))
    }

    // Still pending — webhook hasn't arrived yet; let callback page poll
    return NextResponse.redirect(
      new URL(`/checkout/callback?status=pending&order=${encodeURIComponent(merchantOrderId)}`, req.url)
    )
  } catch (e: any) {
    console.error('[paymob/return] Error:', e?.message ?? e)
    return NextResponse.redirect(
      new URL('/checkout/callback?status=failed&reason=verification_error', req.url)
    )
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
