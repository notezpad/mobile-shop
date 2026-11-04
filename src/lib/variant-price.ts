/**
 * 💰 التحديث 28 (2026-11-04): تطبيع سعر المتغير (سعر المواصفة).
 *
 * الخانة اختيارية: '' أو null أو غياب الحقل = «سيبكه فاضي» = المتغير بياخد
 * سعر المنتج العام. لو جاي رقم لازم يكون صالح و>= 0 — وبنقرّبه لخانتين
 * عشريتين زي باقي أسعار النظام.
 *
 * بيتستخدم في POST/PUT مسارات المتغيرات عشان التحقق يبقى موحّد على السيرفر.
 */
export type NormalizedVariantPrice =
  | { ok: true; price: number | null }
  | { ok: false }

export function normalizeVariantPrice(raw: unknown): NormalizedVariantPrice {
  if (raw === undefined || raw === null || raw === '') return { ok: true, price: null }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(/,/g, '.'))
  if (!Number.isFinite(n) || n < 0) return { ok: false }
  return { ok: true, price: Math.round(n * 100) / 100 }
}
