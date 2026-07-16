import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** POST — commit a pending transfer (apply stock movements). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id } = await ctx.params
  const tid = parseInt(id, 10)
  const t = await db.transfer.findUnique({
    where: { id: tid },
    include: { items: true, fromBranch: { select: { name: true } }, toBranch: { select: { name: true } } },
  })
  if (!t || t.tenantId !== s.tenantId) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  if (t.status !== 'pending') return NextResponse.json({ error: 'التحويل ليس معلّقاً' }, { status: 400 })
  if (s.branchId && t.fromBranchId !== s.branchId) {
    return NextResponse.json({ error: 'يمكن تنفيذ التحويل من فرع المصدر فقط' }, { status: 403 })
  }

  // Re-validate availability at commit time
  for (const it of t.items) {
    const p = await db.product.findUnique({ where: { id: it.productId } })
    if (!p) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
    if (p.quantity < it.quantity) {
      return NextResponse.json({ error: `الكمية غير متوفرة (${p.name} — متاح: ${p.quantity})` }, { status: 400 })
    }
  }

  await db.$transaction(async (tx) => {
    for (const it of t.items) {
      const srcProduct = await tx.product.findUnique({ where: { id: it.productId } })
      if (!srcProduct) throw new Error('منتج غير صالح')
      // decrement source
      await tx.product.update({ where: { id: srcProduct.id }, data: { quantity: { decrement: it.quantity } } })
      await tx.stockMovement.create({
        data: {
          tenantId: s.tenantId, branchId: t.fromBranchId, productId: srcProduct.id,
          type: 'transfer_out', quantity: -it.quantity, refType: 'transfer', refId: t.id,
          note: `تحويل إلى ${t.toBranch.name}`, userId: s.userId,
        },
      })
      // find or create matching product at destination
      let destProduct = await tx.product.findFirst({
        where: {
          tenantId: s.tenantId,
          branchId: t.toBranchId,
          OR: [
            srcProduct.barcode ? { barcode: srcProduct.barcode } : { name: srcProduct.name },
            { name: srcProduct.name },
          ],
        },
      })
      if (!destProduct) {
        destProduct = await tx.product.create({
          data: {
            tenantId: s.tenantId,
            branchId: t.toBranchId,
            name: srcProduct.name,
            category: srcProduct.category,
            barcode: null,
            price: srcProduct.price,
            cost: srcProduct.cost,
            quantity: 0,
            minQuantity: srcProduct.minQuantity,
          },
        })
      }
      await tx.product.update({ where: { id: destProduct.id }, data: { quantity: { increment: it.quantity } } })
      await tx.stockMovement.create({
        data: {
          tenantId: s.tenantId, branchId: t.toBranchId, productId: destProduct.id,
          type: 'transfer_in', quantity: it.quantity, refType: 'transfer', refId: t.id,
          note: `تحويل من ${t.fromBranch.name}`, userId: s.userId,
        },
      })
    }
    await tx.transfer.update({
      where: { id: tid },
      data: { status: 'completed', completedAt: new Date() },
    })
  })
  return NextResponse.json({ ok: true })
}
