/**
 * hr.ts — منطق الموارد البشرية (المرحلة 1) — دوال صرفة بدون أي I/O.
 * ──────────────────────────────────────────────────────────────────────
 * القواعد (راتب شهري ثابت):
 *   • قيمة اليوم = الراتب ÷ مقسوم (الافتراضي 30، أو 0 = أيام الشهر الفعلية).
 *   • الغياب بدون إذن = خصم يوم. الإجازة المعتمدة (leave) بدون خصم.
 *   • التأخير: لو دقائق التأخير ≤ فترة السماح → لا شيء. لو أكتر → تتحسب كلها.
 *     الخصم = الدقائق × (قيمة اليوم ÷ دقائق الوردية).
 *   • اللي ملوش سجل حضور في يوم = يُعتبر حاضر (الغياب لازم يتسجّل صراحةً)،
 *     والنظام بيحذّر المدير من الأيام غير المسجّلة قبل اعتماد الراتب.
 *   • موظف اتعيّن وسط الشهر: الأساسي بيتناسب بأيام الشهر المتبقية.
 *   • السلف بتتخصم تلقائي بقيمة القسط (حتى المتبقي) وماتتخطاش صافي الراتب.
 */

export const HR_EXPENSE_CATEGORY = 'مرتبات'

export const HR_STATUSES = ['present', 'late', 'absent', 'leave'] as const
export type HrStatus = (typeof HR_STATUSES)[number]

export const HR_STATUS_LABEL: Record<HrStatus, string> = {
  present: 'حاضر',
  late: 'متأخر',
  absent: 'غائب',
  leave: 'إجازة',
}

export const HR_PAY_METHODS = ['cash', 'vodafone_cash', 'instapay', 'fawry', 'bank'] as const

export interface HrSettingsValues {
  shiftStart: string // HH:MM
  shiftHours: number
  graceMinutes: number
  lateMode: 'none' | 'per_minute'
  dayDivisor: number // 0 = عدد أيام الشهر الفعلي
}

export const DEFAULT_HR_SETTINGS: HrSettingsValues = {
  shiftStart: '10:00',
  shiftHours: 8,
  graceMinutes: 15,
  lateMode: 'per_minute',
  dayDivisor: 30,
}

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const isMonthStr = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export const isDateStr = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export const isTimeStr = (s: unknown): s is string =>
  typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

const pad = (n: number) => String(n).padStart(2, '0')

export function daysInMonthOf(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function monthBounds(month: string) {
  const days = daysInMonthOf(month)
  return { first: `${month}-01`, last: `${month}-${pad(days)}`, days }
}

/** 0=الأحد … 6=السبت لتاريخ YYYY-MM-DD */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function monthOfDate(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** دقائق التأخير المحسوبة بعد فترة السماح (≤ سماح → 0، غير كده كلها) */
export function countedLate(lateMinutes: number, graceMinutes: number): number {
  const l = Math.max(0, Math.floor(lateMinutes || 0))
  return l > Math.max(0, graceMinutes) ? l : 0
}

/**
 * دقائق التأخير الخام لحظة تسجيل الحضور مقارنة ببداية الوردية.
 * shiftStartUtc = (بداية اليوم بتوقيت المحل كـ UTC) + دقائق الوردية — الراوت بيحسبها
 * بـ localDateStrToUtcBounds عشان الملف ده يفضل بدون أي استيراد من السيرفر (آمن للواجهة).
 */
export function rawLateMinutes(checkIn: Date, shiftStartUtc: Date): number {
  const diff = Math.floor((checkIn.getTime() - shiftStartUtc.getTime()) / 60_000)
  return diff > 0 ? diff : 0
}

/** "HH:MM" → عدد الدقائق من بداية اليوم */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** PIN مُجزّأ (SHA-256) بملح = المحل + الموظف — لا نخزّن الـ PIN نفسه */
export async function hashPin(tenantId: string, employeeId: number, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`hr-pin:${tenantId}:${employeeId}:${pin}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const isValidPin = (s: unknown): s is string => typeof s === 'string' && /^\d{4,6}$/.test(s)

export interface PayslipCalcInput {
  baseSalary: number
  /** تاريخ التعيين YYYY-MM-DD بتوقيت المحل */
  hireDate: string
  month: string
  settings: HrSettingsValues
  absentDays: number
  /** مجموع دقائق التأخير بعد السماح (من countedLate لكل يوم) */
  lateMinutes: number
  /** مجموع الأقساط المستحقة (كل قسط ≤ المتبقي) */
  advanceDue: number
  bonus: number
  penalty: number
}

export interface PayslipCalcResult {
  payableBase: number
  absenceDeduction: number
  lateDeduction: number
  advanceDeduction: number
  net: number
}

export function computePayslip(i: PayslipCalcInput): PayslipCalcResult {
  const { first, last, days } = monthBounds(i.month)
  let activeDays = days
  if (i.hireDate > last) activeDays = 0
  else if (i.hireDate > first) activeDays = days - Number(i.hireDate.slice(8, 10)) + 1

  const payableBase = round2((i.baseSalary * activeDays) / days)
  const divisor = i.settings.dayDivisor > 0 ? i.settings.dayDivisor : days
  const dailyRate = i.baseSalary / divisor

  const absenceDeduction = round2(Math.min(payableBase, Math.max(0, i.absentDays) * dailyRate))

  let lateDeduction = 0
  if (i.settings.lateMode === 'per_minute' && i.settings.shiftHours > 0 && i.lateMinutes > 0) {
    const perMinute = dailyRate / (i.settings.shiftHours * 60)
    lateDeduction = round2(
      Math.min(payableBase - absenceDeduction, i.lateMinutes * perMinute),
    )
  }

  const gross = Math.max(
    0,
    round2(payableBase - absenceDeduction - lateDeduction + (i.bonus || 0) - (i.penalty || 0)),
  )
  const advanceDeduction = round2(Math.min(gross, Math.max(0, i.advanceDue)))
  const net = round2(gross - advanceDeduction)
  return { payableBase, absenceDeduction, lateDeduction, advanceDeduction, net }
}

/**
 * أيام العمل الفعلية (غير الإجازة الأسبوعية) من تاريخ التعيين/أول الشهر حتى
 * min(آخر الشهر، النهارده) اللي مفيهاش أي سجل حضور — للتحذير قبل الاعتماد.
 */
export function countUnrecordedDays(args: {
  month: string
  today: string
  hireDate: string
  weeklyOffDay: number
  recordedDates: Set<string>
}): number {
  const { first, last } = monthBounds(args.month)
  const from = args.hireDate > first ? args.hireDate : first
  const to = args.today < last ? args.today : last
  if (from > to) return 0
  let n = 0
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    if (weekdayOf(d) === args.weeklyOffDay) continue
    if (!args.recordedDates.has(d)) n++
  }
  return n
}
