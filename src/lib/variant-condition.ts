/**
 * 📱 التحديث 30 (2026-11-04): حالة المتغير — جديد / مستعمل (الإلكترونيات).
 * 'new' | 'used' | null (غير محددة = كل البيانات القديمة). مشترك بين السيرفر والواجهة.
 */
export type VariantCondition = 'new' | 'used'

export const CONDITION_LABEL: Record<VariantCondition, string> = {
  new: 'جديد',
  used: 'مستعمل',
}

export type NormalizedCondition = { ok: true; value: VariantCondition | null } | { ok: false }

/** '' / null / undefined = بدون حالة. أي قيمة غير new/used = رفض. */
export function normalizeCondition(raw: unknown): NormalizedCondition {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const s = String(raw).trim().toLowerCase()
  if (s === 'new' || s === 'جديد') return { ok: true, value: 'new' }
  if (s === 'used' || s === 'مستعمل') return { ok: true, value: 'used' }
  return { ok: false }
}

/**
 * اسم المتغير للعرض: «لون / مقاس» + «مستعمل» لو مستعمل.
 * «جديد» مبيتكتبش في الملصق/الفاتورة (الأصل) — بيظهر بس لو في نفس المنتج نسخة مستعملة (opts.showNew).
 */
export function variantDisplayLabel(
  v: { color?: string | null; size?: string | null; condition?: string | null },
  opts?: { showNew?: boolean },
): string {
  const parts = [v.color, v.size].map((x) => (x ?? '').trim()).filter(Boolean)
  if (v.condition === 'used') parts.push(CONDITION_LABEL.used)
  else if (v.condition === 'new' && opts?.showNew) parts.push(CONDITION_LABEL.new)
  return parts.join(' / ')
}
