/**
 * 🔄 2026-10-31 (التحديث الثاني عشر) — الجرد الدوري المجدول (Cycle Counting).
 *
 * ملف pure (بدون استيرادات سيرفر) — بيتستخدم من مسارات الـ API:
 *   1. التحقق من مدخلات الجدولة (normalizeCycleScheduleInput).
 *   2. حساب «هل الجدول فات موعده؟» بتوقيت المحل (isCycleScheduleDue) —
 *      نفس فلسفة tenantTime: كل «اليوم» بيتحسب بتوقيت المحل مابيقولش
 *      على ساعة السيرفر ولا ساعة متصفح أي حد.
 *   3. وصف الإيقاع بشكل بشري (frequencyLabel) للواجهة والإشعارات.
 *
 * قاعدة الاستحقاق:
 *   - الجدول الجديد (lastRunAt = null): بيستحق فقط لو النهارده هو نفسه
 *     يوم الموعد (يومي دايماً مستحق، أسبوعي لو النهارده يوم الأسبوع المختار،
 *     شهري لو النهارده يوم الشهر المختار) — يعني الجدول بينتظر أول موعد له.
 *   - جدول شغّل قبل كده: بيستحق لو تاريخ آخر تشغيل (بتوقيت المحل) أقدم من
 *     تاريخ أحدث موعد مُتاح ≤ النهارده.
 */

export type CycleFrequency = 'daily' | 'weekly' | 'monthly'
export type CycleMode = 'blind' | 'open'

export interface CycleScheduleInput {
  branchId: number | null
  category: string | null
  mode: CycleMode
  frequency: CycleFrequency
  dayOfWeek: number | null
  dayOfMonth: number | null
  note: string | null
}

export interface CycleScheduleLike {
  id: number
  branchId: number | null
  category: string | null
  mode: string
  frequency: string
  dayOfWeek: number | null
  dayOfMonth: number | null
  lastRunAt: Date | string | null
}

const FREQUENCIES: CycleFrequency[] = ['daily', 'weekly', 'monthly']

/** تحقق صارم من مدخلات الجدولة — كل رسالة عربية جاهزة للعرض. */
export function normalizeCycleScheduleInput(
  body: any,
): { ok: true; value: CycleScheduleInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'بيانات غير صالحة' }

  const mode = body.mode === 'open' ? 'open' : 'blind'
  const frequency = String(body.frequency ?? '')
  if (!FREQUENCIES.includes(frequency as CycleFrequency)) {
    return { ok: false, error: 'اختار الإيقاع: يومي أو أسبوعي أو شهري' }
  }

  let dayOfWeek: number | null = null
  let dayOfMonth: number | null = null
  if (frequency === 'weekly') {
    const d = parseInt(body.dayOfWeek, 10)
    if (!Number.isFinite(d) || d < 0 || d > 6) {
      return { ok: false, error: 'اختار يوم الأسبوع' }
    }
    dayOfWeek = d
  } else if (frequency === 'monthly') {
    const d = parseInt(body.dayOfMonth, 10)
    // 1..28 فقط — كل الشهور فيها 28 يوم فمفيش مواعيد بتضيع
    if (!Number.isFinite(d) || d < 1 || d > 28) {
      return { ok: false, error: 'يوم الشهر لازم يكون من 1 لـ 28' }
    }
    dayOfMonth = d
  }

  let branchId: number | null = null
  if (body.branchId !== undefined && body.branchId !== null && body.branchId !== '') {
    const b = parseInt(body.branchId, 10)
    if (!Number.isFinite(b)) return { ok: false, error: 'فرع غير صالح' }
    branchId = b
  }

  let category: string | null = null
  if (body.category !== undefined && body.category !== null && String(body.category).trim() !== '') {
    category = String(body.category).trim().slice(0, 80)
  }

  let note: string | null = null
  if (body.note !== undefined && body.note !== null && String(body.note).trim() !== '') {
    note = String(body.note).trim().slice(0, 200)
  }

  return {
    ok: true,
    value: { branchId, category, mode, frequency: frequency as CycleFrequency, dayOfWeek, dayOfMonth, note },
  }
}

/** التاريخ المحلي (بتوقيت المحل) بصيغة YYYY-MM-DD — نفس منطق tenantTime. */
function localDateStr(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** رقم يوم الأسبوع (0=الأحد..6=السبت) لتاريخ ميلادي YYYY-MM-DD. */
function weekdayOfDateStr(ds: string): number {
  const [y, m, d] = ds.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function addDaysStr(ds: string, days: number): string {
  const [y, m, d] = ds.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * تاريخ أحدث موعد مُتاح ≤ تاريخ اليوم (بتوقيت المحل):
 *   daily   → النهارده نفسه
 *   weekly  → أقرب يوم مختار من النهارده وراجع
 *   monthly → يوم الشهر المختار في الشهر الحالي لو عدّى، وإلا الشهر اللي فات
 */
export function lastOccurrenceDateStr(
  frequency: CycleFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  todayStr: string,
): string {
  if (frequency === 'daily') return todayStr
  if (frequency === 'weekly' && dayOfWeek != null) {
    const todayW = weekdayOfDateStr(todayStr)
    const back = (todayW - dayOfWeek + 7) % 7
    return addDaysStr(todayStr, -back)
  }
  if (frequency === 'monthly' && dayOfMonth != null) {
    const day = parseInt(todayStr.slice(8, 10), 10)
    const thisMonth = todayStr.slice(0, 8) + String(dayOfMonth).padStart(2, '0')
    return day >= dayOfMonth ? thisMonth : addDaysStr(thisMonth, -28)
  }
  return todayStr
}

/** هل الجدول ده فات موعده ولسه متولّدتش منه ورقة؟ (بتوقيت المحل) */
export function isCycleScheduleDue(
  schedule: CycleScheduleLike,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (schedule.frequency !== 'daily' && schedule.frequency !== 'weekly' && schedule.frequency !== 'monthly') {
    return false
  }
  const todayStr = localDateStr(now, timeZone)
  const lastStr = schedule.lastRunAt ? localDateStr(new Date(schedule.lastRunAt), timeZone) : null
  const dueStr = lastOccurrenceDateStr(
    schedule.frequency,
    schedule.dayOfWeek,
    schedule.dayOfMonth,
    todayStr,
  )
  if (!lastStr) {
    // جدول جديد: بينتظر أول موعد ليه (يوم الموعد نفسه) — مش بيتولّد فوراً
    if (schedule.frequency === 'daily') return true
    if (schedule.frequency === 'weekly') return weekdayOfDateStr(todayStr) === schedule.dayOfWeek
    if (schedule.frequency === 'monthly') return parseInt(todayStr.slice(8, 10), 10) === schedule.dayOfMonth
    return false
  }
  return lastStr < dueStr
}

const WEEKDAY_NAMES = ['الأحد', 'الإتنين', 'التلاتة', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** وصف بشري للإيقاع — للواجهة والإشعارات: «كل سبت» / «يومي» / «شهرى يوم 5». */
export function frequencyLabel(s: { frequency: string; dayOfWeek: number | null; dayOfMonth: number | null }): string {
  if (s.frequency === 'daily') return 'كل يوم'
  if (s.frequency === 'weekly') {
    const d = s.dayOfWeek != null && s.dayOfWeek >= 0 && s.dayOfWeek <= 6 ? WEEKDAY_NAMES[s.dayOfWeek] : ''
    return d ? `كل يوم ${d}` : 'أسبوعي'
  }
  if (s.frequency === 'monthly') return `شهري يوم ${s.dayOfMonth ?? '—'}`
  return s.frequency
}

/** وصف النطاق: «تصنيف الإكسسوارات» أو «الكتالوج كله». */
export function scopeLabel(category: string | null): string {
  return category ? `تصنيف «${category}»` : 'الكتالوج كله'
}
