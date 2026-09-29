import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-09-30 (M6): this endpoint was referencing `Customer.loyaltyPoints`
 * — a column that was DROPPED by migration 20260721_remove_variants_and_
 * fashion_extras. Every call used to crash with a Prisma 500 (column does
 * not exist), and nothing in the UI ever awarded points (the dialog was
 * never mounted). The route now returns a clean, explicit 410 instead of a
 * runtime 500, until loyalty is rebuilt on a real points ledger.
 */
async function __POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    await requireCapability(session, 'loyalty')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const { id } = await params
  const customerId = parseInt(id, 10)
  if (customerId) {
    const exists = await db.customer.findFirst({
      where: { id: customerId, tenantId: session.tenantId },
      select: { id: true },
    })
    if (!exists) return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  }

  return NextResponse.json(
    {
      error:
        'نظام نقاط الولاء موقوف مؤقتاً في هذه النسخة (النقاط مش بتتجمع حالياً). لو محتاجه، تواصل مع الدعم لإعادة تفعيله.',
    },
    { status: 410 },
  )
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
