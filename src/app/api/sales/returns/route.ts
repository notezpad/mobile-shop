import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse, requireModuleWritePermission } from '@/lib/features'
import { performSaleReturn, SaleReturnError } from '@/lib/sale-return'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-09-30 (v3): Complete rewrite on top of src/lib/sale-return.ts —
 * the same hardened engine as purchase returns.
 *
 * What changed vs. v2:
 *  1. Race safety: the sale row is locked (FOR UPDATE) inside the transaction
 *     and every line is claimed atomically (returnedQty + qty <= quantity).
 *     Double clicks / replayed offline requests can no longer return the same
 *     pieces twice or push SaleItem negative.
 *  2. `cashDelta` is GONE from the API. The server computes the return value
 *     from the real sale lines and bounds the refund:
 *       refund ≤ min(returnValue − exchangeTotal, paidNotRefunded)
 *     Whatever is not refunded goes to the customer's account (creditApplied).
 *     A refund method is required when cash actually moves.
 *  3. Returned goods re-enter the weighted-average cost (stock valuation no
 *     longer drifts after returns).
 *  4. Every return is recorded in SaleReturn / SaleReturnItem (audit trail)
 *     and the sale status becomes مرتجعة جزئياً / مرتجعة.
 *  5. Exchange (استبدال) is validated: real products, tenant-scoped, atomic
 *     stock claim, server-side price (defaults to retail).
 *
 * Body: {
 *   saleItemId: number,          // legacy single-line shape (still accepted)
 *   quantity: number,
 *   lines?: [{ saleItemId, quantity }],
 *   exchange?: [{ productId, quantity, price? }],
 *   refund?: number,             // cash handed to the customer NOW (default 0)
 *   refundMethod?: string,       // required when refund > 0
 *   note?: string
 * }
 */
async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    await requireCapability(session, 'returns_exchange')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }
  // ✍️ صلاحيات كتابة الموظف: موديول 'sales'
  try { requireModuleWritePermission(session, 'sales') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)

  // Accept both the legacy single-line shape and the new lines[] shape.
  const lines = Array.isArray(body?.lines) && body.lines.length > 0
    ? body.lines
    : body?.saleItemId
      ? [{ saleItemId: body.saleItemId, quantity: body.quantity }]
      : undefined

  const saleId = parseInt(body?.saleId, 10) || (() => {
    // Legacy shape sent only saleItemId — resolve the sale from the item.
    const legacyItemId = parseInt(body?.saleItemId, 10)
    return legacyItemId && !isNaN(legacyItemId) ? -1 : 0
  })()

  let resolvedSaleId = saleId
  if (saleId === -1) {
    const legacyItemId = parseInt(body?.saleItemId, 10)
    const legacyItem = await db.saleItem.findUnique({
      where: { id: legacyItemId },
      select: { saleId: true, sale: { select: { tenantId: true } } },
    })
    if (!legacyItem || legacyItem.sale.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'العنصر غير موجود' }, { status: 404 })
    }
    resolvedSaleId = legacyItem.saleId
  }

  if (!resolvedSaleId) {
    return NextResponse.json({ error: 'بيانات المرتجع غير مكتملة' }, { status: 400 })
  }

  try {
    const result = await db.$transaction((tx) =>
      performSaleReturn(tx, {
        tenantId: session.tenantId,
        userId: session.userId,
        saleId: resolvedSaleId,
        lines,
        exchange: Array.isArray(body?.exchange) ? body.exchange : undefined,
        refund: body?.refund,
        refundMethod: body?.refundMethod,
        note: body?.note,
      }),
    )
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof SaleReturnError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __POST(...args)))
}
