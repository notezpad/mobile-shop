import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { performPurchaseReturn, PurchaseReturnError } from '@/lib/purchase-return'
import { bumpEdgeCache } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

// GET  → history of the returns made against this purchase order
// POST → return some (or all) of the items to the supplier.
//   body: { items: [{ itemId, quantity }], refund?: number,
//           refundMethod?: 'cash'|'vodafone_cash'|'instapay'|'fawry', note?: string }
//   refund = money the supplier really hands back. Omitted → the cash we paid on
//   this order (not yet refunded) is assumed to come back; the rest reduces the
//   supplier balance. The supplier balance ALWAYS drops by (returnValue - refund).

async function authorize() {
  const session = await requireAuth()
  await requireModule(session, 'purchases')
  return session
}

function fail(e: unknown) {
  const err = authErrorResponse(e)
  if (err) return NextResponse.json(err.body, { status: err.status })
  const fe = featureErrorResponse(e)
  if (fe) return NextResponse.json(fe.body, { status: fe.status })
  return null
}

async function __GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try { session = await authorize() } catch (e) {
    const r = fail(e); if (r) return r; throw e
  }
  const oid = parseInt((await params).id, 10)
  if (isNaN(oid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

  const returns = await db.purchaseReturn.findMany({
    where: { purchaseOrderId: oid, tenantId: session.tenantId },
    orderBy: { id: 'desc' },
    include: { items: true },
  })
  return NextResponse.json(returns)
}

async function __POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try { session = await authorize() } catch (e) {
    const r = fail(e); if (r) return r; throw e
  }
  const oid = parseInt((await params).id, 10)
  if (isNaN(oid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'اختر الأصناف المراد إرجاعها' }, { status: 400 })
  }

  try {
    const result = await db.$transaction((tx) =>
      performPurchaseReturn(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        orderId: oid,
        lines: body.items.map((i: any) => ({
          itemId: Number(i?.itemId),
          quantity: Number(i?.quantity),
        })),
        refund:
          body.refund === undefined || body.refund === null || body.refund === ''
            ? undefined
            : Number(body.refund),
        refundMethod: body.refundMethod ? String(body.refundMethod) : undefined,
        note: body.note ? String(body.note).trim() || null : null,
      })
    )
    // ⚡ v9: إبطال كاش أوامر الشراء + المخزون (المرتجع بيخصم كميات) فوراً
    await bumpEdgeCache('/api/purchase-orders', session.tenantId)
    await bumpEdgeCache('/api/inventory/movements', session.tenantId)
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
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
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
