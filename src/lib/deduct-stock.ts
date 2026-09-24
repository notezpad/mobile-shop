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
 * 🛡️ 2026-09-15 (v2): ATOMIC conditional update to fix race conditions.
 *   Previously: `findUnique` → check `quantity < toDeduct` → `update` decrement
 *   Problem: between the check and the update, another transaction could
 *   decrement the quantity → race condition → negative stock.
 *
 *   New approach: use `updateMany` with `WHERE quantity >= toDeduct`.
 *   If the WHERE clause doesn't match (count=0), the stock is insufficient.
 *   This is atomic at the DB level — no race possible.
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

    // 🛡️ ATOMIC conditional update: only decrement if quantity >= toDeduct.
    // The `updateMany` returns { count } — 0 means insufficient stock.
    const result = await tx.productVariant.updateMany({
      where: { id: variantId, quantity: { gte: toDeduct } },
      data: { quantity: { decrement: toDeduct } },
    })
    if (result.count === 0) {
      // Re-read to get the actual current quantity for the error message
      const current = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { quantity: true },
      })
      throw new Error(
        `المخزون مش كافي لهذا اللون/المقاس — متاح: ${current?.quantity ?? 0}، مطلوب: ${toDeduct}`
      )
    }

    await syncProductQuantityFromVariants(tx, productId)
    return toDeduct
  }

  // 🛡️ ATOMIC conditional update for the non-variant case too
  const result = await tx.product.updateMany({
    where: { id: productId, quantity: { gte: toDeduct } },
    data: { quantity: { decrement: toDeduct } },
  })
  if (result.count === 0) {
    // Re-read for the error message
    const current = await tx.product.findUnique({
      where: { id: productId },
      select: { quantity: true },
    })
    if (!current) throw new Error('المنتج غير موجود')
    throw new Error(`المخزون مش كافي — متاح: ${current.quantity}، مطلوب: ${toDeduct}`)
  }
  return toDeduct
}

/**
 * 🛡️ 2026-09-15 (v2): Atomic stock RESTORE for returns / sale delete.
 * Uses `update` increment (always succeeds — no upper bound check needed).
 * Handles variant vs non-variant case.
 *
 * Returns the total number of *pieces* that were restored (for reporting).
 */
export async function restoreStock(tx: Tx, input: DeductInput): Promise<number> {
  const { productId, quantity, unitId, variantId } = input

  let toRestore = quantity
  if (unitId) {
    const unit = await tx.productUnit.findUnique({ where: { id: unitId } })
    if (!unit || unit.productId !== productId) throw new Error('الوحدة مش موجودة أو غير مرتبطة بالمنتج')
    toRestore = unit.factor * quantity
  }

  if (variantId) {
    await tx.productVariant.update({
      where: { id: variantId },
      data: { quantity: { increment: toRestore } },
    })
    await syncProductQuantityFromVariants(tx, productId)
    return toRestore
  }

  await tx.product.update({
    where: { id: productId },
    data: { quantity: { increment: toRestore } },
  })
  return toRestore
}
