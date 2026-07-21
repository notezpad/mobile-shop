/**
 * dateUtils.ts — مساعدات التواريخ بتوقيت المستخدم المحلي
 *
 * المشكلة الشائعة:
 *   new Date().toISOString().split('T')[0]  → يرجع تاريخ UTC ❌
 *   لو المستخدم في مصر (UTC+2) الساعة 1 فجراً، UTC هتكون لسه في أمس
 *
 * الحل: نستخدم getFullYear() / getMonth() / getDate() دايماً
 *   لأنهم بيرجعوا التوقيت المحلي للمتصفح تلقائياً،
 *   سواء المستخدم في مصر أو السعودية أو أمريكا أو أي دولة تانية.
 */

// ─────────────────────────────────────────────
// 1. تحويل تاريخ → "YYYY-MM-DD" بالتوقيت المحلي
// ─────────────────────────────────────────────

/**
 * يرجع التاريخ بصيغة "YYYY-MM-DD" بتوقيت المتصفح المحلي.
 *
 * @example
 *   getLocalDateStr()              // "2026-07-20"  (حسب توقيت الدولة)
 *   getLocalDateStr(new Date(...)) // تاريخ أي Date بالتوقيت المحلي
 */
export function getLocalDateStr(d: Date = new Date()): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

// ─────────────────────────────────────────────
// 2. فلترة: هل timestamp معين يقع في نطاق تاريخ؟
// ─────────────────────────────────────────────

/**
 * يتحقق إن UTC timestamp (من قاعدة البيانات) يقع بين تاريخين
 * محددين بتوقيت المستخدم المحلي.
 *
 * @param utcTimestamp - التاريخ المخزون في DB (UTC string أو Date)
 * @param fromLocal    - تاريخ البداية "YYYY-MM-DD" بالتوقيت المحلي
 * @param toLocal      - تاريخ النهاية  "YYYY-MM-DD" بالتوقيت المحلي
 *
 * @example
 *   isInLocalDateRange(sale.createdAt, "2026-07-20", "2026-07-20")
 *   // ✅ صح: يحسب التاريخ بتوقيت الدولة مش UTC
 */
export function isInLocalDateRange(
  utcTimestamp: string | Date | null | undefined,
  fromLocal: string,
  toLocal: string,
): boolean {
  if (!utcTimestamp) return false
  const d = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp
  if (isNaN(d.getTime())) return false
  const localDate = getLocalDateStr(d)
  return localDate >= fromLocal && localDate <= toLocal
}

// ─────────────────────────────────────────────
// 3. أزرار الاختصار: اليوم / آخر 7 أيام / هذا الشهر
// ─────────────────────────────────────────────

type Preset = 'today' | 'last7' | 'thisMonth'

/**
 * يرجع { from, to } بصيغة "YYYY-MM-DD" بالتوقيت المحلي
 * لكل preset من أزرار الفلتر.
 *
 * @example
 *   const { from, to } = getPresetRange('today')
 *   setFromDate(from)
 *   setToDate(to)
 */
export function getPresetRange(preset: Preset): { from: string; to: string } {
  const today = new Date()
  const todayStr = getLocalDateStr(today)

  if (preset === 'today') {
    return { from: todayStr, to: todayStr }
  }

  if (preset === 'last7') {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)  // 6 أيام للخلف + اليوم = 7 أيام
    return { from: getLocalDateStr(from), to: todayStr }
  }

  // thisMonth — من أول الشهر لليوم
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: getLocalDateStr(from), to: todayStr }
}
