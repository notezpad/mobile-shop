import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

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
    session = await requireAuth()
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

  return NextResponse.json({ status })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
