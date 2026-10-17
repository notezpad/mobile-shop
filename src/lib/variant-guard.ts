import type { Prisma, PrismaClient } from '@prisma/client'

type DbLike = Prisma.TransactionClient | PrismaClient

/**
 * 🎨 2026-10-18 — حاجز أمان للمسارات اللي لسه بتعدّل Product.quantity مباشرة
 * (الجرد، التحويل بين الفروع، استبدال المورد).
 *
 * المنتج اللي له ألوان/مقاسات كمية الأب بتتحسب دايماً = مجموع الـ variants
 * (syncProductQuantityFromVariants). أي تعديل مباشر على Product.quantity بيتمسح
 * عند أول بيعة/تعديل مقاس — يعني خسارة صامتة للبيانات. بدل ما نسمح بيها،
 * بنرجّع أسماء المنتجات دي عشان الـ route يرفض بنص واضح.
 *
 * @returns أسماء المنتجات (من اللي اتبعتت) اللي ليها variants — [] لو مفيش.
 */
export async function namesOfProductsWithVariants(
  db: DbLike,
  productIds: Array<number | null | undefined>,
): Promise<string[]> {
  const ids = [...new Set(productIds.filter((x): x is number => typeof x === 'number'))]
  if (ids.length === 0) return []
  const grouped = await db.productVariant.groupBy({
    by: ['productId'],
    where: { productId: { in: ids } },
    _count: true,
  })
  if (grouped.length === 0) return []
  const withVariants = grouped.map((g) => g.productId)
  const products = await db.product.findMany({
    where: { id: { in: withVariants } },
    select: { name: true },
  })
  return products.map((p) => p.name)
}

export function variantGuardMessage(names: string[], action: string): string {
  const list = names.slice(0, 3).join('، ') + (names.length > 3 ? ' …' : '')
  return `${action} غير متاح لمنتجات ليها ألوان ومقاسات (${list}) — استخدم «حركة مخزون» واختار اللون/المقاس عشان الكمية ما تتمسحش`
}
