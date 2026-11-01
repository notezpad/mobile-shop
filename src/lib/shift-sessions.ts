/**
 * 🔗 2026-11-01 (التحديث السادس عشر) — حسابات جلسة الوردية (فتح ← إغلاق).
 *
 * الفجوة: لما يكون فيه كذا كاشير على نفس الدرج، «المتوقع» في الإغلاق كان
 * بيتحسب على رصيد الدرج الكامل (SUM كل قيود الكاش للفرع) — يعني عجز وردية
 * أمس بيتورث لوردية النهاردة، ومفيش سجل لمين كان ماسك الدرج.
 *
 * الحل: «فتح وردية» بيعمل ShiftSession (مين فتح + عهدة افتتاحية اختيارية)،
 * وعند الإغلاق المتوقع بيحسب على الوردية نفسها:
 *
 *   متوقع الوردية = الأساس + صافي حركات الكاش من وقت الفتح
 *
 * الأساس (بلترتيب):
 *   1. العهدة الافتتاحية — اللي فتح عدّها في الدرج وقت الفتح (أدق أساس).
 *   2. آخر إغلاق معروف للفرع — اللي الكاشير اللي فات عدّه (لو ساب العهدة فاضية).
 *   3. صفر — أول يوم شغل على الفرع من غير ولا إغلاق ولا عهدة.
 *
 * الملف ده isomorphic بدون أي deps — نفس فلسفة branch-shifts.ts — عشان
 * يشتغل في الـ API وفي الاختبارات من غير أي بيئة.
 */

/** تقريب لخانتين عشريتين — نفس دقة الأموال في باقي النظام. */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export interface SessionBaselineInput {
  /** العهدة الافتتاحية (null = ما عدّش وقت الفتح) */
  openingFloat: number | null
  /** آخر إغلاق معروف للفرع (counted — null = مفيش إغلاقات لسه) */
  lastClosureCounted: number | null
}

/**
 * أساس الوردية — الرصيد اللي كان في الدرج وقت الفتح (بأدق معلومة متاحة).
 */
export function sessionBaseline({ openingFloat, lastClosureCounted }: SessionBaselineInput): number {
  if (openingFloat != null && Number.isFinite(openingFloat)) return round2(openingFloat)
  if (lastClosureCounted != null && Number.isFinite(lastClosureCounted)) return round2(lastClosureCounted)
  return 0
}

/**
 * متوقع الوردية لحظة الإغلاق = الأساس + صافي حركات الكاش من وقت الفتح
 * (net = داخل − خارج، من قيود CashEntry method='cash' أو NULL للفرع).
 */
export function sessionExpected(baseline: number, cashNetSinceOpen: number): number {
  return round2(baseline + cashNetSinceOpen)
}

/** فارق الوردية = اللي الكاشير عدّاه − المتوقع (موجب = زيادة، سالب = عجز). */
export function sessionVariance(counted: number, expected: number): number {
  return round2(counted - expected)
}
