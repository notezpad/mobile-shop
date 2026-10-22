/**
 * 👕 2026-10-22 — «المخزن الداخلي» للمواسم (باقات الملابس فقط).
 *
 * الإجمالي (quantity) = المعروض (displayQty) + في المخزن الداخلي (مشتق).
 * القاعدة الذهبية للنقل معرض ↔ مخزن: حركة موقع مش حركة مال —
 * مفيش شراء ولا بيع ولا كاش، التكلفة ثابتة، وقيمة المخزون الإجمالية مابتتغيرش
 * (نفس قاعدة «رصيد افتتاحي» — لا مبيعات مزيفة ولا مشتريات مزيفة).
 *
 * الحقول بتتسجل فقط للمحلات الـ businessType بتاعها 'fashion' — أي tenant تاني
 * بيبعت الحقول دي؟ بنتجاهلها في الـ API (نفس أسلوب soldByWeight الغذائي).
 * ومحلات الفاشون نفسها بتحافظ على الثابت: 0 <= displayQty <= quantity.
 */

export const SEASON_VALUES = ['ALL_YEAR', 'SUMMER', 'WINTER'] as const
export type SeasonValue = (typeof SEASON_VALUES)[number]

export const SEASON_LABELS: Record<SeasonValue, string> = {
  ALL_YEAR: 'طوال السنة',
  SUMMER: 'صيفي',
  WINTER: 'شتوي',
}

/** أنواع حركات المخزون الجديدة — نفس عيلة transfer_in/transfer_out (كمية موجبة) */
export const WAREHOUSE_IN = 'warehouse_in' // دخل المخزن الداخلي (من العرض)
export const WAREHOUSE_OUT = 'warehouse_out' // خرج للمخزن الداخلي → العرض

export function isSeasonValue(v: unknown): v is SeasonValue {
  return typeof v === 'string' && (SEASON_VALUES as readonly string[]).includes(v)
}

/** الميزة متاحة لباقات الملابس فقط (فيرتك fashion) */
export function canUseSeasonal(businessType: string | null | undefined): boolean {
  return businessType === 'fashion'
}

/** تقريب Float لـ 3 خانات (نفس أسلوب الكميات بالوزن) */
export const roundQty = (n: number) => Math.round(n * 1000) / 1000

/** الناجم في المخزن الداخلي (مشتق دايماً — مفيش عمود ليه) */
export const warehouseQty = (quantity: number, displayQty: number) =>
  Math.max(0, roundQty(quantity - displayQty))

/**
 * «نايم في المخزن»: عليه مخزون إجمالي بس مفيش ولا قطعة معروضة.
 * دي قاعدة الإخفاء من شبكة نقطة البيع (الصنف بيتلقي بالبحث/الباركود بس).
 * ملاحظة: المنتجات اللي كميتها 0 أصلاً مش متأثرة (بتفضل ظاهرة زي ما هي).
 */
export function isSleeping(quantity: number, displayQty: number | null | undefined): boolean {
  return quantity > 1e-9 && (displayQty ?? 0) <= 1e-9
}

/**
 * الكمية المعروضة بعد تعديل إجمالي مباشر (شاشة المنتج):
 * - زيادة → الزيادة تروح للعرض (البضاعة الجاية بتتعلق على الرف افتراضياً)
 * - نقص → بنقص من المعروض الأول وما بينزلش تحت الصفر
 *   (مثال: إجمالي 20 ومعروض 16، اتعدل لـ4 → اتشال 16 من المعروض بالكامل → 0،
 *    والمخزن الداخلي 4−0=4 — نفس قاعدة حركات الصرف اليدوية بالظبط)
 */
export function displayAfterTotalChange(
  prevQuantity: number,
  prevDisplay: number,
  nextQuantity: number,
): number {
  const diff = roundQty(nextQuantity - prevQuantity)
  if (diff > 0) return Math.min(roundQty(prevDisplay + diff), nextQuantity)
  return Math.max(0, roundQty(prevDisplay + diff))
}
