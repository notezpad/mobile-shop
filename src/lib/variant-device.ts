/**
 * 📱 التحديث 33 (2026-11-06): بيانات جهاز الموبايل/التابلت + IMEI لكل جهاز.
 *
 * ثلاث خانات على مستوى «المتغير» (بتظهر في دايلوج موبايل/تابلت بس — مش لابتوب/كمبيوتر):
 *   - الضمان المتبقي بالشهور (warrantyMonths) — مهم للأجهزة الجديدة (ضمان الوكيل).
 *   - الكرتونة والملحقات (boxCondition): 'full' = بالكرتونة الكاملة | 'device' = الجهاز بس.
 *   - الإصدار/النسخة (edition): نص حر — «نسخة مصرية/سعودية/أمريكية»، «مفتوح الشبكات/مقفول».
 *
 * وجدول VariantUnit: جهاز فردي جوه المتغير — IMEI/سيريال لكل قطعة + نسبة صحة البطارية
 * (للآيفون بس — بتختلف من جهاز لجهاز حتى لو نفس المواصفات).
 *
 * الملف مشترك بين السيرفر (تطبيع/رفض قيم غلط) والواجهة (أسماء وعرض).
 */

// ── الكرتونة والملحقات ──
export type BoxCondition = 'full' | 'device'

export const BOX_LABEL: Record<BoxCondition, string> = {
  full: 'بالكرتونة الكاملة',
  device: 'الجهاز بس',
}

export const BOX_SHORT: Record<BoxCondition, string> = {
  full: 'كرتونة كاملة',
  device: 'الجهاز بس',
}

export type NormalizedBox = { ok: true; value: BoxCondition | null } | { ok: false }

/** '' / null / undefined = بدون تحديد. أي قيمة غير full/device = رفض. */
export function normalizeBoxCondition(raw: unknown): NormalizedBox {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const s = String(raw).trim().toLowerCase()
  if (s === 'full' || s === 'بالكرتونة الكاملة' || s === 'كرتونة كاملة') return { ok: true, value: 'full' }
  if (s === 'device' || s === 'الجهاز بس') return { ok: true, value: 'device' }
  return { ok: false }
}

// ── الضمان المتبقي (شهور) ──
/** الحد الأقصى المنطقي: سنتين ضمان وكيل من تاريخ الشراء. */
export const MAX_WARRANTY_MONTHS = 24

export type NormalizedWarranty = { ok: true; value: number | null } | { ok: false }

/** '' / null / undefined = بدون تحديد. رقم 0..24 (0 = ضمان خلص/مفيش) — غير كده رفض. */
export function normalizeWarrantyMonths(raw: unknown): NormalizedWarranty {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10)
  if (!Number.isFinite(n) || n < 0 || n > MAX_WARRANTY_MONTHS) return { ok: false }
  return { ok: true, value: Math.round(n) }
}

/** عرض مختصر: «ضمان 11 شهر» / «ضمان شهر» لشهر واحد. */
export function warrantyLabel(months: number | null | undefined): string | null {
  if (months == null) return null
  if (months === 0) return 'بدون ضمان'
  if (months === 1) return 'ضمان شهر'
  return `ضمان ${months} شهر`
}

// ── الإصدار/النسخة ──
export const MAX_EDITION_LEN = 60

/** اقتراحات سريعة للنسخة — أهم حاجة للآيفون (نسخة + مفتوح/مقفول). */
export const EDITION_CHIPS = [
  'نسخة مصرية',
  'نسخة سعودية',
  'نسخة إماراتية',
  'نسخة أوروبية',
  'نسخة أمريكية',
  'نسخة يابانية',
  'مفتوح الشبكات',
  'مقفول على شبكة',
]

export type NormalizedEdition = { ok: true; value: string | null } | { ok: false }

/** نص حر — تنظيف + حد أقصى 60 حرف. فاضي = بدون تحديد. */
export function normalizeEdition(raw: unknown): NormalizedEdition {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  const s = String(raw).replace(/\s+/g, ' ').trim()
  if (!s) return { ok: true, value: null }
  if (s.length > MAX_EDITION_LEN) return { ok: false }
  return { ok: true, value: s }
}

// ── IMEI / سيريال لكل جهاز ──
export const MIN_IMEI_LEN = 5
export const MAX_IMEI_LEN = 20

/**
 * تطبيع IMEI/سيريال للفهرسة والبحث: حروف لاتينية كبيرة + أرقام بس
 * (بيتمسح أي مسافات/شرطات/نقط — «35-678901 234567» و«3567890123456 7» نفس الجهاز).
 */
export function normalizeImeiNorm(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type NormalizedImei = { ok: true; imei: string; imeiNorm: string } | { ok: false; error: string }

/**
 * التحقق من IMEI/سيريال:
 * - بعد تنظيف الفواصل: من 5 لـ 20 حرف/رقم (IMEI = 15 رقم، سيريال ماك بوك حروف وأرقام).
 * - لازم فيه رقم واحد على الأقل (ممنوع نص عشوائي).
 */
export function normalizeImei(raw: unknown): NormalizedImei {
  if (raw === undefined || raw === null) return { ok: false, error: 'الـ IMEI مطلوب' }
  const s = String(raw).trim()
  const norm = normalizeImeiNorm(s)
  if (norm.length < MIN_IMEI_LEN) return { ok: false, error: `الـ IMEI قصير — لازم ${MIN_IMEI_LEN} حرف/رقم على الأقل بعد تنظيف الفواصل` }
  if (norm.length > MAX_IMEI_LEN) return { ok: false, error: `الـ IMEI طويل — أقصى ${MAX_IMEI_LEN} حرف/رقم` }
  if (!/\d/.test(norm)) return { ok: false, error: 'الـ IMEI لازم يكون فيه أرقام' }
  return { ok: true, imei: s, imeiNorm: norm }
}

// ── نسبة صحة البطارية (للآيفون بس) ──
export type NormalizedBattery = { ok: true; value: number | null } | { ok: false }

/** '' / null / undefined = بدون تحديد. رقم صحيح 1..100 — غير كده رفض. */
export function normalizeBatteryHealth(raw: unknown): NormalizedBattery {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10)
  if (!Number.isFinite(n) || n < 1 || n > 100 || String(n) !== String(Math.round(n))) return { ok: false }
  return { ok: true, value: Math.round(n) }
}

const IPHONE_WORDS = ['ايفون', 'آيفون', 'أيفون', 'إيفون', 'iphone']

/**
 * هل الجهاز آيفون؟ نسبة صحة البطارية بتظهر للآيفون بس (طلب صاحب المحل —
 * أندرويد مفيش «Battery Health» رسمة زي آبل). بيتفحص من اسم المنتج.
 */
export function isIphoneDevice(productName?: string | null): boolean {
  const n = (productName ?? '').toLowerCase()
  if (!n) return false
  return IPHONE_WORDS.some((w) => n.includes(w))
}

// ── حالة الجهاز الفردي ──
export type UnitStatus = 'in_stock' | 'sold'

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  in_stock: 'بالمخزن',
  sold: 'تم بيعه',
}

export function normalizeUnitStatus(raw: unknown): UnitStatus | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'in_stock' || s === 'بالمخزن') return 'in_stock'
  if (s === 'sold' || s === 'تم بيعه') return 'sold'
  return null
}
