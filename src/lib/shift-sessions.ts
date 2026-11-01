/**
 * 🔗 2026-11-01 (التحديث السادس عشر) — حسابات جلسة الوردية (مشتركة، قابلة
 * للاختبار خارج الـ API): أساس الفتح، متوقع الوردية، والفارق.
 *
 * الفجوة اللي بتحلها: كان المتوقع بيتحسب على رصيد الدرج الكامل (من أول يوم)
 * — فعجز وردية أمس بيتورث لوردية النهاردة ومستحيل تعرف مين سببه. مع جلسة
 * فتح رسمية، المتوقع بيتحسب على الوردية نفسها:
 *
 *   الأساس      = العهدة الافتتاحية (لو اللي فتح عدّ) ← ألا آخر إغلاق
 *                 مسجّل للفرع (اللي الكاشير اللي فات عدّاه) ← ألا صفر
 *                 (أول يوم شغل). ⚠️ العهدة = 0 مقبولة صراحةً (الدرج فاضي
 *                 وقت الفتح حقيقة مش نسيان — بنفرّق بين null و 0).
 *   المتوقع    = الأساس + صافي حركات الكاش من وقت الفتح (داخل − خارج)
 *   الفارق     = اللي اتعدّى − المتوقع  (موجب = زيادة، سالب = عجز)
 *
 * كده عجز وردية أمس **مش بيتورث** لوردية النهاردة — كل وردية بتبدأ من
 * أساسها هي، والفارق بيرجع لباش آدمين الوردية دي بالذات.
 */

/** تقريب على خانتين — نفس عُرف الفلوس في المشروع كله. */
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export interface OpeningBaseInput {
  /** العهدة الافتتاحية من جلسة الفتح — null = مكتوبتش (مش صفر!) */
  openingFloat: number | null
  /** counted آخر إغلاق مسجّل للفرع — null = مفيش إغلاق (أول يوم) */
  lastClosureCounted?: number | null
}

/**
 * أساس الوردية: عهدة ← آخر إغلاق ← صفر.
 * العهدة 0 مقبولة صراحةً (فرق جوهري بين «مكتوبة صفر» و«مكتوبة خالص»).
 */
export function resolveOpeningBase({ openingFloat, lastClosureCounted }: OpeningBaseInput): number {
  if (openingFloat != null && Number.isFinite(openingFloat)) return round2(openingFloat)
  if (lastClosureCounted != null && Number.isFinite(lastClosureCounted)) return round2(lastClosureCounted)
  return 0
}

/** متوقع الوردية = الأساس + صافي حركات الكاش من وقت الفتح. */
export function sessionExpected(base: number, netCashSinceOpen: number): number {
  return round2(base + netCashSinceOpen)
}

/** فارق الوردية = اللي اتعدّى − المتوقع (موجب = زيادة، سالب = عجز). */
export function sessionVariance(counted: number, expected: number): number {
  return round2(counted - expected)
}
