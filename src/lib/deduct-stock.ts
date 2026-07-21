import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export type DeductInput = {
  productId: number
  quantity: number    // number of units (or pieces, if unitId is undefined)
  unitId?: number | null
  tenantId?: string
  branchId?: number | null
  userId?: string
  refType?: string
  refId?: number
  note?: string
}

/**
 * Deduct stock for a single sale line, supporting two modes:
 *   1) No unit  → piece-level, decrement Product.quantity directly.
 *   2) Wholesale unit (factor) → decrement Product.quantity by factor*qty.
 *
 * Throws Error with Arabic message on insufficient stock.
 * Returns the total number of *pieces* that were removed (for reporting).
 */
export async function deductStock(tx: Tx, input: DeductInput): Promise<number> {
  const { productId, quantity, unitId } = input

  if (!unitId) {
    const p = await tx.product.findUnique({ where: { id: productId } })
    if (!p) throw new Error('المنتج غير موجود')
    if (p.quantity < quantity) {
      throw new Error(`المخزون مش كافي — متاح: ${p.quantity}، مطلوب: ${quantity}`)
    }
    await tx.product.update({
      where: { id: productId },
      data: { quantity: { decrement: quantity } },
    })
    return quantity
  }

  const unit = await tx.productUnit.findUnique({ where: { id: unitId } })
  if (!unit || unit.productId !== productId) throw new Error('الوحدة مش موجودة أو غير مرتبطة بالمنتج')

  const toDeduct = unit.factor * quantity
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
