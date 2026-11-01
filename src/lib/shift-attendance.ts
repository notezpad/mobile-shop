/**
 * 🕐 (v25) ربط الحضور بوردية الموظف المحددة — سيرفر فقط.
 *
 *  - loadEmployeeShift: وردية الموظف (من ورديات فرعه، أو فرع حسابه المرتبط لو سجله بلا فرع).
 *  - resolveShiftAnchor: أقرب «بداية وردية» لوقت التسجيل (أمس/النهارده/بكرة) — منها
 *    بنحسب التأخير، وتاريخها هو تاريخ سجل الحضور. كده الوردية الليلية (22:00 → 06:00)
 *    انصرافها الساعة 6 الصبح بيلاقي حضور الليلة اللي فاتت بدل ما يفتح حضور يوم جديد.
 */
import { db } from '@/lib/db'
import { dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { timeToMinutes } from '@/lib/hr'
import { findEmployeeShift } from '@/lib/branch-shifts'

export function addDaysStr(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10)
}

export function resolveShiftAnchor(now: Date, tz: string, fromHHMM: string): { startUtc: Date; dateKey: string } {
  const today = dateStrInTz(now, tz)
  let best: { startUtc: Date; dateKey: string; diff: number } | null = null
  for (const n of [-1, 0, 1]) {
    const dateKey = addDaysStr(today, n)
    const startUtc = new Date(localDateStrToUtcBounds(dateKey, 'start', tz).getTime() + timeToMinutes(fromHHMM) * 60_000)
    const diff = Math.abs(now.getTime() - startUtc.getTime())
    if (!best || diff < best.diff) best = { startUtc, dateKey, diff }
  }
  return { startUtc: best!.startUtc, dateKey: best!.dateKey }
}

export async function loadEmployeeShift(
  tenantId: string,
  emp: { branchId: number | null; userId: string | null; shiftName: string | null },
) {
  if (!emp.shiftName) return null
  let branchId = emp.branchId
  if (branchId == null && emp.userId) {
    const u = await db.user.findFirst({ where: { id: emp.userId, tenantId }, select: { branchId: true } })
    branchId = u?.branchId ?? null
  }
  if (branchId == null) return null
  const br = await db.branch.findFirst({ where: { id: branchId, tenantId }, select: { shifts: true } })
  return findEmployeeShift(br?.shifts, emp.shiftName)
}
