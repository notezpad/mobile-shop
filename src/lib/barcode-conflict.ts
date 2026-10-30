import { db } from '@/lib/db'

/**
 * 🏷️ فحص تعارض الباركود بين الجداول التلاتة (منتج / لون-مقاس / وحدة جملة).
 *
 * كل جدول كان بيفحص التكرار جوه نفسه بس — فنفس الرقم ممكن يتسجل كمنتج وكلون/مقاس،
 * والكاشير بيدوّر على المنتج الأول (`data.find(r => r.barcode === code)`) فيظلّل المقاس.
 * النطاق = نفس (المحل + الفرع)، والفرع المشترك (null) نطاق لوحده — زي فريدية الـ index/trigger.
 */
export type BarcodeOwner = 'product' | 'variant' | 'unit'

export async function findBarcodeConflict(
  tenantId: string,
  branchId: number | null,
  barcode: string,
  ignore: { productId?: number; variantId?: number; unitId?: number } = {},
): Promise<BarcodeOwner | null> {
  const productScope = { tenantId, branchId: branchId ?? null }
  const [p, v, u] = await Promise.all([
    db.product.findFirst({
      where: { ...productScope, barcode, ...(ignore.productId ? { id: { not: ignore.productId } } : {}) },
      select: { id: true },
    }),
    db.productVariant.findFirst({
      where: { barcode, product: productScope, ...(ignore.variantId ? { id: { not: ignore.variantId } } : {}) },
      select: { id: true },
    }),
    db.productUnit.findFirst({
      where: { barcode, product: productScope, ...(ignore.unitId ? { id: { not: ignore.unitId } } : {}) },
      select: { id: true },
    }),
  ])
  return p ? 'product' : v ? 'variant' : u ? 'unit' : null
}

export function barcodeConflictMessage(owner: BarcodeOwner): string {
  switch (owner) {
    case 'product':
      return 'الباركود مستخدم بالفعل لمنتج آخر'
    case 'variant':
      return 'الباركود مستخدم بالفعل كباركود لون/مقاس'
    case 'unit':
      return 'الباركود مستخدم بالفعل كباركود وحدة جملة'
  }
}
