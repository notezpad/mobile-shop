import type { Prisma, PrismaClient } from '@prisma/client'

type DbLike = Prisma.TransactionClient | PrismaClient

/**
 * A product's own `quantity` column must always reflect the sum of its
 * variants' quantities once it has any variants — otherwise the products
 * list, low-stock alerts, and reports would show a stale aggregate number
 * while the real per-variant stock has already moved.
 *
 * 👕 2026-10-22 (المخزن الداخلي): نفس المبدأ بيتطبق على `displayQty` —
 * مجمع المعروض = مجموع معروض المقاسات. الاتنين بيتزامنوا في نفس الـ UPDATE
 * عشان الثابت 0 <= displayQty <= quantity يفضل محفوظ على مستوى المنتج كمان.
 *
 * Call this after ANY variant create/update/delete, and after any sale that
 * deducts stock from a specific variant.
 *
 * If the product has no variants at all, this is a no-op (products without
 * variants keep their manually-managed `quantity` untouched).
 */
export async function syncProductQuantityFromVariants(
  db: DbLike,
  productId: number,
): Promise<void> {
  const agg = await db.productVariant.aggregate({
    where: { productId },
    _sum: { quantity: true, displayQty: true },
    _count: true,
  })
  if (agg._count === 0) return
  await db.product.update({
    where: { id: productId },
    data: {
      quantity: agg._sum.quantity ?? 0,
      // 👕 مجمع المعروض — والحد الأعلى حماية إضافية لو حصل انحراف لحظي
      displayQty: Math.min(agg._sum.displayQty ?? 0, agg._sum.quantity ?? 0),
    },
  })
}
