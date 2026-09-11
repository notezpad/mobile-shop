import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * Fashion Pro capability: returns_exchange
 *
 * POST /api/sales/returns
 * Body: {
 *   saleItemId: number,        // original SaleItem being returned
 *   quantity: number,          // pieces returned (must be <= original quantity)
 *   exchange?: {               // optional replacement — if present, must be same tenant
 *     productId: number,
 *     price: number,
 *     quantity: number,
 *   },
 *   cashDelta?: number         // signed cash difference paid/refunded to customer
 * }
 *
 * Effect:
 * - Restore stock for the returned SaleItem.
 * - If exchange provided → deduct exchange stock, create a NEW positive-amount Sale
 *   line-set flagged as an exchange.
 * - Cash entry equal to cashDelta (can be negative = refund).
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null)
  const saleItemId = parseInt(body?.saleItemId, 10)
  const quantity = parseInt(body?.quantity, 10)
  if (!saleItemId || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'بيانات المرتجع غير مكتملة' }, { status: 400 })
  }
  const cashDelta = Number(body?.cashDelta ?? 0) || 0

  const item = await db.saleItem.findUnique({
    where: { id: saleItemId },
    include: { sale: true },
  })
  if (!item || item.sale.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العنصر غير موجود' }, { status: 404 })
  }
  if (quantity > item.quantity) {
    return NextResponse.json({ error: 'الكمية المرتجعة أكبر من الأصلية' }, { status: 400 })
  }

  const result = await db.$transaction(async (tx) => {
    // Restore stock
    await tx.product.update({
      where: { id: item.productId },
      data: { quantity: { increment: quantity } },
    })
    await tx.stockMovement.create({
      data: {
        tenantId: session.tenantId,
        branchId: item.sale.branchId ?? null,
        productId: item.productId,
        type: 'return',
        quantity,
        refType: 'sale',
        refId: item.saleId,
        note: `مرتجع من فاتورة #${item.sale.invoiceNo ?? item.saleId}`,
        userId: session.userId,
      },
    })

    // Reduce original SaleItem quantity + Sale total (net view)
    const unitPrice = item.price
    const refundAmount = unitPrice * quantity
    await tx.saleItem.update({
      where: { id: item.id },
      data: { quantity: { decrement: quantity } },
    })
    await tx.sale.update({
      where: { id: item.saleId },
      data: { total: { decrement: refundAmount } },
    })

    // Exchange (optional)
    let exchangeCharge = 0
    if (body?.exchange) {
      const ex = body.exchange
      const exProductId = parseInt(ex.productId, 10)
      const exQty = parseInt(ex.quantity, 10) || 1
      const exPrice = Number(ex.price ?? 0) || 0
      const p = await tx.product.findUnique({ where: { id: exProductId } })
      if (!p || p.tenantId !== session.tenantId) throw new Error('منتج الاستبدال غير موجود')

      if (p.quantity < exQty) {
        throw new Error('مخزون الاستبدال غير كافي')
      }
      await tx.product.update({
        where: { id: exProductId },
        data: { quantity: { decrement: exQty } },
      })
      await tx.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: item.sale.branchId ?? null,
          productId: exProductId,
          type: 'sale',
          quantity: -exQty,
          refType: 'sale',
          refId: item.saleId,
          note: `استبدال في فاتورة #${item.sale.invoiceNo ?? item.saleId}`,
          userId: session.userId,
        },
      })
      exchangeCharge = exPrice * exQty
      await tx.saleItem.create({
        data: {
          saleId: item.saleId,
          productId: exProductId,
          name: p.name + ' (استبدال)',
          price: exPrice,
          quantity: exQty,
          cost: p.cost,
        },
      })
      await tx.sale.update({
        where: { id: item.saleId },
        data: { total: { increment: exchangeCharge } },
      })
    }

    // Cash movement for the net difference
    if (cashDelta !== 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'return',
          refId: item.saleId,
          amount: cashDelta,
          note: `مرتجع/استبدال فاتورة #${item.sale.invoiceNo ?? item.saleId}`,
          userId: session.userId,
        },
      })
    }

    return { ok: true, refundAmount, exchangeCharge, cashDelta }
  })

  return NextResponse.json(result, { status: 201 })
}
