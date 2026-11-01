/**
 * 🕐 2026-10-31 (التحديث الثامن) — أدوات ورديات الفرع (مشتركة بين السيرفر
 * والشاشات): تعريف الوردية، تطبيع الـ JSON القادم من قاعدة البيانات أو
 * من محرر الإعدادات، وكشف الوردية الحالية من الساعة.
 *
 * الوردية = { name, from, to } — أوقات نصية بصيغة HH:mm (24 ساعة).
 * وردية من from > to دي وردية بتعدّي نص الليل (ليلي 22:00 → 06:00).
 */

export interface BranchShift {
  name: string
  from: string
  to: string
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

/** تطبيع أي مصدر (JSONB قديم/جديد، إدخال مستخدم) لقايمة ورديات سليمة. */
export function normalizeShifts(v: unknown): BranchShift[] {
  if (!Array.isArray(v)) return []
  const out: BranchShift[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const name = String(o.name ?? '').trim().slice(0, 40)
    const from = String(o.from ?? '').trim()
    const to = String(o.to ?? '').trim()
    if (!name || !TIME_RE.test(from) || !TIME_RE.test(to)) continue
    out.push({ name, from, to })
  }
  // أسماء مكررة → سيب أول واحدة بس (الاسم هو مفتاح الاختيار في الإغلاق)
  const seen = new Set<string>()
  return out.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true))).slice(0, 8)
}

export function shiftToMinutes(t: string): number {
  const [h, m] = t.split(':')
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0)
}

/**
 * كشف الوردية الحالية من وقت الجهاز (جهاز الكاشير جوه المحل أصلاً).
 * بيرجّع null لو مفيش وردية مطابقة — والدايلوج بيسيب المستخدم يختار بنفسه.
 */
export function detectShiftName(shifts: BranchShift[], now: Date = new Date()): string | null {
  const mins = now.getHours() * 60 + now.getMinutes()
  for (const s of shifts) {
    const from = shiftToMinutes(s.from)
    const to = shiftToMinutes(s.to)
    if (from === to) {
      // from === to = وردية 24 ساعة → بتطابق دايماً
      return s.name
    }
    const overnight = to < from
    const inside = overnight ? mins >= from || mins < to : mins >= from && mins < to
    if (inside) return s.name
  }
  return null
}

/** نفس detectShiftName بس بتوقيت المحل (للسيرفر — ساعته UTC مش ساعة المحل). */
export function detectShiftNameInTz(shifts: BranchShift[], now: Date, tz: string): string | null {
  let h = now.getHours()
  let m = now.getMinutes()
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '', 10)
    m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '', 10)
  } catch { /* tz غير صالح — نرجع لساعة الجهاز */ }
  const local = new Date(2000, 0, 1, Number.isFinite(h) ? h % 24 : now.getHours(), Number.isFinite(m) ? m : now.getMinutes())
  return detectShiftName(shifts, local)
}

/** وصف الوردية للعرض: «صباحي · 8:00 ص → 4:00 م» */
export function shiftLabel(s: BranchShift): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':')
    const hh = parseInt(h, 10)
    const period = hh < 12 ? 'ص' : 'م'
    const h12 = hh % 12 === 0 ? 12 : hh % 12
    return `${h12}:${m} ${period}`
  }
  return `${s.name} · ${fmt(s.from)} → ${fmt(s.to)}`
}

/** مدة الوردية بالساعات (from === to = 24 ساعة، وردية بتعدّي نص الليل محسوبة صح). */
export function shiftDurationHours(s: BranchShift): number {
  const from = shiftToMinutes(s.from)
  const to = shiftToMinutes(s.to)
  const mins = from === to ? 1440 : to > from ? to - from : to + 1440 - from
  return Math.round((mins / 60) * 100) / 100
}

/** وردية الموظف المحددة من ورديات فرعه — null لو مفيش اسم أو التعريف اتشال. */
export function findEmployeeShift(
  branchShifts: unknown,
  shiftName: string | null | undefined,
): (BranchShift & { hours: number }) | null {
  if (!shiftName) return null
  const s = normalizeShifts(branchShifts).find((x) => x.name === shiftName)
  return s ? { ...s, hours: shiftDurationHours(s) } : null
}
