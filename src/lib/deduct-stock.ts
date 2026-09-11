import type { Prisma } from '@prisma/client'
import { syncProductQuantityFromVariants } from './sync-product-quantity'

type Tx = Prisma.TransactionClient

export type DeductInput = {
  productId: number
  quantity: number    // number of units (or pieces, if unitId is undefined)
  unitId?: number | null
  variantId?: number | null   // specific size/color variant sold, if any
  tenantId?: string
  branchId?: number | null
  userId?: string
  refType?: string
  refId?: number
  note?: string
}

/**
 * Deduct stock for a single sale line.
 *
 * Piece count to remove = quantity, or factor*quantity when a wholesale
 * unit was sold.
 *
 * Where the pieces come out of:
 *   - If variantId is set → decrement THAT variant's own stock (not
 *     Product.quantity directly), then recompute Product.quantity as the
 *     sum of all its variants so the aggregate number never drifts.
 *   - Otherwise → decrement Product.quantity directly, same as before
 *     (products with no variants are unaffected by this change).
 *
 * Throws Error with Arabic message on insufficient stock.
 * Returns the total number of *pieces* that were removed (for reporting).
 */
export async function deductStock(tx: Tx, input: DeductInput): Promise<number> {
  const { productId, quantity, unitId, variantId } = input

  let toDeduct = quantity
  if (unitId) {
    const unit = await tx.productUnit.findUnique({ where: { id: unitId } })
    if (!unit || unit.productId !== productId) throw new Error('الوحدة مش موجودة أو غير مرتبطة بالمنتج')
    toDeduct = unit.factor * quantity
  }

  if (variantId) {
    const variant = await tx.productVariant.findUnique({ where: { id: variantId } })
    if (!variant || variant.productId !== productId) {
      throw new Error('المتغير (اللون/المقاس) مش موجود أو غير مرتبط بالمنتج')
    }
    if (variant.quantity < toDeduct) {
      throw new Error(`المخزون مش كافي لهذا اللون/المقاس — متاح: ${variant.quantity}، مطلوب: ${toDeduct}`)
    }
    await tx.productVariant.update({
      where: { id: variantId },
      data: { quantity: { decrement: toDeduct } },
    })
    await syncProductQuantityFromVariants(tx, productId)
    return toDeduct
  }

  const p = await tx.product.findUnique({ where: { id: productId } })
  if (!p) throw new Error('المنتج غير موجود')
  if (p.quantity < toDeduct) {
    throw new Error(`المخزون مش كافي — متاح: ${p.quantity}، مطلوب: ${toDeduct}`)
  }
  await tx.product.update({
    where: { id: productId },
    data: { quantity: { decrement: toDeduct } },
  })
  return toDeduct
}
