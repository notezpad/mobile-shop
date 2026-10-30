/**
 * hr.ts — منطق الموارد البشرية (المرحلة 1) — دوال صرفة بدون أي I/O.
 * ──────────────────────────────────────────────────────────────────────
 * القواعد (راتب شهري ثابت):
 *   • قيمة اليوم = الراتب ÷ مقسوم (الافتراضي 30، أو 0 = أيام الشهر الفعلية).
 *   • الحساب على الأيام الفعلية المسجّلة: اليوم بيتدفع بس لو عنده سجل
 *     حضور/تأخير، أو إجازة معتمدة بمرتب، أو إذن، أو راحة أسبوعية مستحقة
 *     (الأسبوع اللي فيه يوم مؤهل واحد على الأقل). اليوم اللي ملوش أي سجل
 *     مبيتدفعش — والنظام بينبّه على الأيام دي قبل اعتماد الراتب.
 *   • الإجازة السنوية/المرضية (بمرتب) بتتدفع كامل. بدون مرتب بتتخصم.
 *   • التأخير: لو دقائق التأخير ≤ فترة السماح → لا شيء. لو أكتر → تتحسب كلها.
 *     الخصم = الدقائق × (قيمة اليوم ÷ دقائق الوردية).
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
  annualLeaveDays: number // رصيد الإجازة السنوية
}

export const DEFAULT_HR_SETTINGS: HrSettingsValues = {
  shiftStart: '10:00',
  shiftHours: 8,
  graceMinutes: 15,
  lateMode: 'per_minute',
  dayDivisor: 30,
  annualLeaveDays: 21,
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
  /** أيام الغياب المسجّلة صراحةً (للعرض في القسيمة) */
  absentDays: number
  /** مجموع دقائق التأخير بعد السماح (من countedLate لكل يوم) */
  lateMinutes: number
  /** مجموع الأقساط المستحقة (كل قسط ≤ المتبقي) */
  advanceDue: number
  bonus: number
  penalty: number
  /**
   * الأيام المستحقة الدفع فعليًا (حضور/تأخير + إجازة بمرتب + إذن + راحة مستحقة)
   * من countPaidDays. لو اتبعتت، الخصم بيتحسب على (أيام الخدمة − الأيام دي)
   * بدل الاعتماد على الغياب المسجّل بس — اليوم اللي ملوش سجل مبيتدفعش.
   */
  paidDays?: number
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

  // أيام بدون مقابل: في وضع الأيام الفعلية = أيام الخدمة ناقص الأيام المؤهلة
  // (غياب صريح + أيام من غير تسجيل + راحة أسبوعية مش مستحقة). غير كده = الغياب الصريح بس.
  const unpaidDays =
    i.paidDays !== undefined
      ? Math.max(0, activeDays - Math.max(0, i.paidDays))
      : Math.max(0, i.absentDays)

  const absenceDeduction = round2(Math.min(payableBase, unpaidDays * dailyRate))

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

// ───────────── حساب الأيام الفعلية المستحقة للدفع ─────────────

export type DayRecordStatus = 'present' | 'late' | 'leave' | 'absent'

export interface PaidDaysBreakdown {
  /** أيام حضور/تأخير مسجّلة */
  workedDays: number
  /** أيام إجازة معتمدة بمرتب (سجل leave) */
  paidLeaveDays: number
  /** أيام إذن (ساعات) — متابعة بس وبتتدفع زي ما هي */
  permissionDays: number
  /** راحات أسبوعية مستحقة (الأسبوع اللي فيه يوم مؤهل) */
  entitledOffDays: number
  /** إجمالي الأيام المدفوعة */
  paidDays: number
  /** أيام شغل فعلية متوقعة في الشهر (من غير الراحة الأسبوعية) */
  expectedWorkDays: number
  /** أيام شغل عدّا النهارده من غير أي سجل (بتتخصم) */
  unrecordedDays: number
  /** أيام شغل لسه جاية (بعد النهارده) — لسه مالهاش سجل طبعًا */
  pendingDays: number
}

/** رقم الأسبوع (يبدأ السبت) لتاريخ YYYY-MM-DD — أداة مساعدة */
function weekIndexOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const epochDays = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
  // 1970-01-03 كان سبت (epoch 2) — فالأسبوع المصري بيبدأ من السبت
  return Math.floor((epochDays - 2) / 7)
}

/**
 * الأيام الفعلية المستحقة للدفع في الشهر:
 *   • يوم عنده سجل حضور/تأخير، أو إجازة بمرتب، أو إذن → بيتدفع.
 *   • الراحة الأسبوعية بتتدفع لو الأسبوع بتاعها فيه يوم مؤهل واحد على الأقل
 *     (محدش شغل ولا إجازة في أسبوع → راحته مش مستحقة).
 *   • أي يوم شغل تاني — غياب صريح أو من غير تسجيل — مبيتدفعش.
 *   • الأيام الجاية (بعد today) بترجع في pendingDays عشان الواجهة تنبّه
 *     إن الحساب النهائي محتاج «أعد الحساب» بعد تسجيلها.
 */
export function countPaidDays(args: {
  month: string
  today: string
  hireDate: string
  weeklyOffDay: number
  records: Map<string, DayRecordStatus>
  /** تواريخ الأذون (نوع permission — مالهاش سجل حضور) */
  permissionDates?: Set<string>
}): PaidDaysBreakdown {
  const { first, last } = monthBounds(args.month)
  const from = args.hireDate > first ? args.hireDate : first
  const r: PaidDaysBreakdown = {
    workedDays: 0, paidLeaveDays: 0, permissionDays: 0, entitledOffDays: 0, paidDays: 0,
    expectedWorkDays: 0, unrecordedDays: 0, pendingDays: 0,
  }
  if (from > last) return r
  const qualifyingWeeks = new Set<number>()
  const offDays: string[] = []
  // المرور الأول: السجلات المؤهلة + تجميع الراحات الأسبوعية لفحصها بعد ما
  // أسابيع الشهر كلها تتجمّع (الراحة ممكن يومها يسبق باقي أيام أسبوعه في الترتيب)
  for (let d = from; d <= last; d = addDaysStr(d, 1)) {
    const st = args.records.get(d)
    const isPermission = !st && args.permissionDates?.has(d)
    if (weekdayOf(d) !== args.weeklyOffDay) r.expectedWorkDays++
    if (st === 'present' || st === 'late') {
      r.workedDays++
      r.paidDays++
      qualifyingWeeks.add(weekIndexOf(d))
      continue
    }
    if (st === 'leave') {
      r.paidLeaveDays++
      r.paidDays++
      qualifyingWeeks.add(weekIndexOf(d))
      continue
    }
    if (isPermission) {
      r.permissionDays++
      r.paidDays++
      qualifyingWeeks.add(weekIndexOf(d))
      continue
    }
    if (st === 'absent') continue // غياب صريح — مهما كان اليوم
    if (weekdayOf(d) === args.weeklyOffDay) { offDays.push(d); continue }
    if (d > args.today) r.pendingDays++
    else r.unrecordedDays++
  }
  // المرور الثاني: الراحة الأسبوعية مدفوعة لو أسبوعها فيه يوم مؤهل واحد على الأقل
  for (const d of offDays) {
    if (qualifyingWeeks.has(weekIndexOf(d))) {
      r.entitledOffDays++
      r.paidDays++
    }
  }
  return r
}

// ─────────────────────── الإجازات والأذونات (المرحلة 2) ───────────────────────

export const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'permission'] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'سنوية (بمرتب)',
  sick: 'مرضية (بمرتب)',
  unpaid: 'بدون مرتب',
  permission: 'إذن (ساعات)',
}

/** كل التواريخ من start لـ end شامل — حد أقصى 366 يوم (حماية) */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end && out.length <= 366; d = addDaysStr(d, 1)) out.push(d)
  return out
}

/** أيام العمل الفعلية للإجازة: بدون الإجازة الأسبوعية وبدون الأيام قبل التعيين */
export function leaveWorkDays(start: string, end: string, weeklyOffDay: number, hireDate: string): string[] {
  return datesBetween(start, end).filter((d) => weekdayOf(d) !== weeklyOffDay && d >= hireDate)
}

// ─────────────────────────── التقييمات (المرحلة 3) ───────────────────────────

export const EVAL_CRITERIA = [
  { key: 'perfScore', label: 'جودة الأداء' },
  { key: 'customerScore', label: 'التعامل مع العملاء' },
  { key: 'teamScore', label: 'الالتزام والتعاون' },
] as const
export type EvalCriterionKey = (typeof EVAL_CRITERIA)[number]['key']

/** وزن الحضور (تلقائي) مقابل تقييم المدير */
export const EVAL_ATTENDANCE_WEIGHT = 0.4

/** درجة الحضور 0-100: الغياب بيخصم بالكامل نصيبه، والتأخير بيخصم نصفه. أيام الإجازة خارج الحساب. */
export function attendanceScore(workDays: number, absentDays: number, lateDays: number): number {
  if (workDays <= 0) return 100
  const s = 100 - (absentDays * 100) / workDays - (lateDays * 50) / workDays
  return Math.round(Math.max(0, Math.min(100, s)) * 10) / 10
}

/** الدرجة النهائية 0-100 = حضور 40% + متوسط تقييم المدير (من 5) 60% */
export function overallScore(att: number, perf: number, customer: number, team: number): number {
  const mgr = (((perf + customer + team) / 3) / 5) * 100
  return Math.round((att * EVAL_ATTENDANCE_WEIGHT + mgr * (1 - EVAL_ATTENDANCE_WEIGHT)) * 10) / 10
}

export function scoreGrade(overall: number): { label: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' } {
  if (overall >= 90) return { label: 'ممتاز', tone: 'emerald' }
  if (overall >= 75) return { label: 'جيد جدًا', tone: 'sky' }
  if (overall >= 60) return { label: 'جيد', tone: 'amber' }
  return { label: 'يحتاج تحسين', tone: 'rose' }
}
