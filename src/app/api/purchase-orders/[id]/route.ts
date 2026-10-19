import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModulePermission, featureErrorResponse } from '@/lib/features'
import { performPurchaseReturn, PurchaseReturnError } from '@/lib/purchase-return'

export const dynamic = 'force-dynamic'

async function __GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { requireModulePermission(session, 'purchases') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const order = await db.purchaseOrder.findUnique({
    where: { id: oid },
    include: { items: true, supplier: true, returns: { include: { items: true }, orderBy: { id: 'desc' } } },
  })
  if (!order || order.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'أمر الشراء غير موجود' }, { status: 404 })
  }
  return NextResponse.json(order)
}

// DELETE = return EVERYTHING that is still returnable on this order (kept for
// backwards compatibility with old clients / the offline outbox).
// 🛡️ 2026-09-29: the whole thing — the "already returned?" check included — now
// runs inside ONE transaction that locks the order row, so a double click or a
// replayed request can no longer return the same goods twice.
// For partial returns use POST /api/purchase-orders/[id]/returns.
async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { requireModulePermission(session, 'purchases') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  try {
    const result = await db.$transaction((tx) =>
      performPurchaseReturn(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        orderId: oid,
      })
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof PurchaseReturnError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __DELETE(...args)))
}
