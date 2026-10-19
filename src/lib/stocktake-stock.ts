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

/**
 * 📉 2026-10-18 — عجز الجرد كخسارة.
 *
 * النقص اللي بيطلع من الجرد كان بيشيل الكمية بس ومابيتحسبش في الأرباح (نفس مشكلة
 * «تالف» القديمة). دلوقتي بنحسب قيمته بسعر التكلفة ونسجّله مصروف غير نقدي (source
 * 'damage' = مابيمسش الخزنة وممنوع حذفه) — الزيادة بتتسجل كمية بس ومابتتحسبش ربح.
 */
export interface ShrinkSummary {
  /** عدد القطع الناقصة */
  qty: number
  /** القيمة بسعر التكلفة */
  value: number
}

export async function computeStocktakeShrink(
  db: Tx | import('@prisma/client').PrismaClient,
  tenantId: string,
  items: Array<{ productId: number | null; diff: number }>,
): Promise<ShrinkSummary> {
  const short = items.filter((i) => i.productId != null && i.diff < 0)
  if (short.length === 0) return { qty: 0, value: 0 }
  const ids = [...new Set(short.map((i) => i.productId as number))]
  const costs = await db.product.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, cost: true },
  })
  const costOf = new Map(costs.map((c) => [c.id, Math.max(0, c.cost)]))
  let qty = 0
  let value = 0
  for (const i of short) {
    const n = Math.abs(i.diff)
    qty += n
    value += n * (costOf.get(i.productId as number) ?? 0)
  }
  return { qty: Math.round(qty * 1000) / 1000, value: Math.round(value * 100) / 100 }
}

export async function recordStocktakeShrinkLoss(
  tx: Tx,
  ctx: { tenantId: string; userId: string | null | undefined; branchId: number | null; stocktakeId: number },
  shrink: ShrinkSummary,
): Promise<number | null> {
  if (shrink.value <= 0) return null
  const exp = await tx.expense.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      category: 'عجز جرد',
      amount: shrink.value,
      note: `عجز جرد #${ctx.stocktakeId}: ${shrink.qty} قطعة ناقصة`,
      userId: ctx.userId,
      // غير نقدي: مفيش فلوس خرجت من الخزنة (الخسارة في البضاعة) + ممنوع حذفه من المصروفات
      source: 'damage',
    },
  })
  return exp.id
}
