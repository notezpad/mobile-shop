import type { Prisma } from '@prisma/client'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'

/**
 * 📋 2026-10-18 — تطبيق فرق بند جرد واحد على المخزون (مشترك بين «اعتماد فوري»
 * و«اعتماد مسودة»).
 *
 * بنطبّق *الفرق* اللي اتسجل وقت العدّ (countedQty − systemQty) على الكمية الحالية
 * ومش بنكتب الكمية المعدودة فوقها — فلو اتباع حاجة بين العدّ والاعتماد، الكمية
 * دي ما بترجعش للمخزن بالغلط. والنتيجة مابتنزلش تحت الصفر.
 *
 * منتج له ألوان/مقاسات: الفرق بيتطبق على الـ variant نفسه وكمية المنتج = مجموعهم.
 */
type Tx = Prisma.TransactionClient

export interface StocktakeApplyCtx {
  tenantId: string
  userId: string | null | undefined
  branchId: number | null
  stocktakeId: number
  note: string
}

export async function applyStocktakeDiff(
  tx: Tx,
  ctx: StocktakeApplyCtx,
  it: { productId: number; variantId: number | null; diff: number },
): Promise<void> {
  if (it.diff === 0) return

  if (it.variantId != null) {
    const cur = await tx.productVariant.findFirst({
      where: { id: it.variantId, productId: it.productId },
      select: { quantity: true },
    })
    if (!cur) return // اللون/المقاس اتمسح بعد العدّ — مفيش مخزون نعدّله
    const next = Math.max(0, Math.round(cur.quantity + it.diff))
    await tx.productVariant.update({ where: { id: it.variantId }, data: { quantity: next } })
    await syncProductQuantityFromVariants(tx, it.productId)
  } else {
    const cur = await tx.product.findUnique({ where: { id: it.productId }, select: { quantity: true } })
    const next = Math.max(0, Math.round(((cur?.quantity ?? 0) + it.diff) * 1000) / 1000)
    await tx.product.update({ where: { id: it.productId }, data: { quantity: next } })
  }

  await tx.stockMovement.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId ?? undefined,
      productId: it.productId,
      variantId: it.variantId,
      type: 'stocktake',
      quantity: it.diff,
      refType: 'stocktake',
      refId: ctx.stocktakeId,
      note: ctx.note,
      userId: ctx.userId,
    },
  })
}
