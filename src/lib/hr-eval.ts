/**
 * hr-eval.ts — إحصائيات الحضور الشهرية لكل موظف (سيرفر) — أساس درجة الحضور في التقييم.
 * أيام العمل = من (التعيين/أول الشهر) لـ min(النهارده، آخر الشهر) بدون الإجازة الأسبوعية
 * وبدون أيام الإجازة (leave). اللي ملوش سجل = حاضر (زي المرتبات).
 */
import { getSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { addDaysStr, attendanceScore, monthBounds, weekdayOf } from '@/lib/hr'

export interface AttStats {
  employeeId: number; name: string; jobTitle: string | null; baseSalary: number
  workDays: number; absentDays: number; lateDays: number; lateMinutes: number; leaveDays: number
  attendanceScore: number
}

export async function monthAttendanceStats(tenantId: string, month: string): Promise<AttStats[]> {
  const sql = getSql()
  const tz = await getTenantTimezone(tenantId)
  const today = dateStrInTz(new Date(), tz)
  const { first, last } = monthBounds(month)
  const [emps, recs] = await Promise.all([
    sql<any[]>`
      SELECT "id", "name", "jobTitle", "baseSalary", "weeklyOffDay",
             to_char("hireDate", 'YYYY-MM-DD HH24:MI:SS') AS "hire"
      FROM "Employee" WHERE "tenantId" = ${tenantId} AND "active" = true ORDER BY "name"`,
    sql<any[]>`
      SELECT "employeeId", "date", "status", "lateMinutes", "source"
      FROM "AttendanceRecord"
      WHERE "tenantId" = ${tenantId} AND "date" BETWEEN ${first} AND ${last}`,
  ])
  const byEmp = new Map<number, Map<string, any>>()
  for (const r of recs) {
    const m = byEmp.get(r.employeeId) ?? new Map<string, any>()
    m.set(r.date, r)
    byEmp.set(r.employeeId, m)
  }
  const out: AttStats[] = []
  for (const e of emps) {
    const hire = dateStrInTz(new Date(String(e.hire).replace(' ', 'T') + 'Z'), tz)
    if (hire > last) continue
    const from = hire > first ? hire : first
    const to = today < last ? today : last
    const days = byEmp.get(e.id) ?? new Map<string, any>()
    let workDays = 0, absent = 0, lateDays = 0, lateMin = 0, leave = 0
    for (let d = from; d <= to; d = addDaysStr(d, 1)) {
      if (weekdayOf(d) === e.weeklyOffDay) continue
      const r = days.get(d)
      if (r && (r.status === 'leave' || r.source === 'leave')) { leave++; continue }
      workDays++
      if (!r) continue
      if (r.status === 'absent') absent++
      else if (r.status === 'late') { lateDays++; lateMin += r.lateMinutes ?? 0 }
    }
    out.push({
      employeeId: e.id, name: e.name, jobTitle: e.jobTitle, baseSalary: e.baseSalary,
      workDays, absentDays: absent, lateDays, lateMinutes: lateMin, leaveDays: leave,
      attendanceScore: attendanceScore(workDays, absent, lateDays),
    })
  }
  return out
}
