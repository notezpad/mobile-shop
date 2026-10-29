import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { getSql } from '@/lib/sql'
import { hrGuard, bad, hrSafe, loadHrSettings, isAdminRole, STAFF_EDIT_DAYS } from '@/lib/hr-route'
import { LEAVE_TYPES, addDaysStr, isDateStr, leaveWorkDays, round2, type LeaveType } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'
import { branchScopeSql } from '@/lib/branch-scope'

export const dynamic = 'force-dynamic'

/** GET ?year=YYYY → سجل الإجازات + رصيد الإجازة السنوية لكل موظف نشط */
async function __GET(req: NextRequest) {
  const g = await hrGuard('staff')
  if ('res' in g) return g.res
  const { session } = g
  const tz = await getTenantTimezone(session.tenantId)
  const yParam = new URL(req.url).searchParams.get('year')
  const year = yParam && /^\d{4}$/.test(yParam) ? yParam : dateStrInTz(new Date(), tz).slice(0, 4)
  const sql = getSql()
  // 🏬 مشرف الفرع بيشوف إجازات موظفي فرعه بس
  const empScope = (col: string) =>
    !isAdminRole(session.role) && session.branchId
      ? sql`AND ${branchScopeSql(sql, session.tenantId, session.branchId, col)}`
      : sql``

  const [settings, items, emps] = await Promise.all([
    loadHrSettings(session.tenantId),
    sql<any[]>`
      SELECT l."id", l."employeeId", e."name" AS "employeeName", l."type", l."startDate", l."endDate",
             l."days", l."hours", l."note", l."createdAt"
      FROM "LeaveRequest" l JOIN "Employee" e ON e."id" = l."employeeId"
      WHERE l."tenantId" = ${session.tenantId} AND l."startDate" BETWEEN ${year + '-01-01'} AND ${year + '-12-31'}
        ${empScope('e.branchId')}
      ORDER BY l."startDate" DESC, l."id" DESC LIMIT 500`,
    sql<{ id: number; name: string }[]>`
      SELECT "id", "name" FROM "Employee" WHERE "tenantId" = ${session.tenantId} AND "active" = true
        ${empScope('branchId')} ORDER BY "name"`,
  ])
  const used = new Map<number, number>()
  for (const l of items) if (l.type === 'annual') used.set(l.employeeId, (used.get(l.employeeId) ?? 0) + l.days)
  const balances = emps.map((e) => ({
    employeeId: e.id, name: e.name, allowance: settings.annualLeaveDays,
    used: used.get(e.id) ?? 0, remaining: settings.annualLeaveDays - (used.get(e.id) ?? 0),
  }))
  return NextResponse.json({ year, annualLeaveDays: settings.annualLeaveDays, items, balances })
}

/**
 * POST { employeeId, type, startDate, endDate?, hours?, note? }
 * annual/sick → حضور "إجازة" (بمرتب) | unpaid → "غائب" (بيتخصم) | permission → سجل متابعة فقط.
 * أيام فيها حضور فعلي (checkIn) أو الإجازة الأسبوعية أو قبل التعيين بتتخطى.
 */
async function __POST(req: NextRequest) {
  const g = await hrGuard('staff')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return bad('بيانات غير صالحة')

  const employeeId = Number(b.employeeId)
  const type = String(b.type) as LeaveType
  if (!Number.isInteger(employeeId)) return bad('اختر الموظف')
  if (!LEAVE_TYPES.includes(type)) return bad('نوع الإجازة غير صالح')
  if (!isDateStr(b.startDate)) return bad('تاريخ البداية غير صالح')
  const startDate: string = b.startDate
  const endDate: string = type === 'permission' ? startDate : isDateStr(b.endDate) ? b.endDate : startDate
  if (endDate < startDate) return bad('تاريخ النهاية قبل البداية')
  const spanDays = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1
  if (spanDays > 90) return bad('أقصى مدة للإجازة الواحدة 90 يوم')
  let hours: number | null = null
  if (type === 'permission') {
    hours = round2(Number(b.hours))
    if (!Number.isFinite(hours) || hours <= 0 || hours > 12) return bad('عدد ساعات الإذن غير صالح')
  }
  const note = b.note ? String(b.note).trim().slice(0, 200) || null : null

  const sql = getSql()
  const tz = await getTenantTimezone(session.tenantId)
  if (!isAdminRole(session.role) && startDate < addDaysStr(dateStrInTz(new Date(), tz), -STAFF_EDIT_DAYS)) {
    return bad(`المشرف يقدر يسجل إجازة تبدأ من آخر ${STAFF_EDIT_DAYS} أيام أو بعدها — اطلب من المدير`, 403)
  }
  const emp = (await sql<{ id: number; weeklyOffDay: number; hireDate: Date; active: boolean }[]>`
    SELECT "id", "weeklyOffDay", "hireDate", "active" FROM "Employee"
    WHERE "id" = ${employeeId} AND "tenantId" = ${session.tenantId}
      ${!isAdminRole(session.role) && session.branchId ? sql`AND ${branchScopeSql(sql, session.tenantId, session.branchId)}` : sql``}`)[0]
  if (!emp) return bad('الموظف غير موجود', 404)
  if (!emp.active) return bad('الموظف موقوف')

  const dates = type === 'permission' ? [] : leaveWorkDays(startDate, endDate, emp.weeklyOffDay, dateStrInTz(emp.hireDate, tz))
  if (type !== 'permission' && dates.length === 0) return bad('الفترة دي كلها إجازة أسبوعية أو قبل تعيين الموظف')

  const status = type === 'unpaid' ? 'absent' : 'leave'
  const result = await sql.begin(async (tx) => {
    const lv = (await tx<{ id: number }[]>`
      INSERT INTO "LeaveRequest" ("tenantId", "employeeId", "type", "startDate", "endDate", "days", "hours", "note", "createdBy")
      VALUES (${session.tenantId}, ${employeeId}, ${type}, ${startDate}, ${endDate}, ${dates.length}, ${hours}, ${note}, ${session.userId})
      RETURNING "id"`)[0]
    let applied = 0
    if (dates.length > 0) {
      const payload = JSON.stringify(dates.map((date) => ({ date })))
      const rows = await tx`
        INSERT INTO "AttendanceRecord"
          ("tenantId", "employeeId", "date", "status", "lateMinutes", "note", "source", "leaveId", "createdBy", "updatedAt")
        SELECT ${session.tenantId}, ${employeeId}, r."date", ${status}, 0, ${note}, 'leave', ${lv.id}, ${session.userId}, now()
        FROM jsonb_to_recordset(${payload}::text::jsonb) AS r("date" text)
        ON CONFLICT ("employeeId", "date") DO UPDATE SET
          "status" = EXCLUDED."status", "lateMinutes" = 0, "note" = EXCLUDED."note", "source" = 'leave',
          "leaveId" = EXCLUDED."leaveId", "checkOut" = NULL, "updatedAt" = now()
        WHERE "AttendanceRecord"."checkIn" IS NULL
        RETURNING "id"`
      applied = rows.length
      // الأيام اللي اتخطت (فيها حضور فعلي) ماتتحسبش من رصيد الإجازة
      if (applied !== dates.length) await tx`UPDATE "LeaveRequest" SET "days" = ${applied} WHERE "id" = ${lv.id}`
    }
    return { id: lv.id, applied }
  })
  await logAudit({ action: 'hr.leave.create', targetType: 'employee', targetId: employeeId, details: { type, startDate, endDate } }, req)
  return NextResponse.json({ ok: true, id: result.id, days: dates.length, applied: result.applied, skipped: dates.length - result.applied }, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => hrSafe(() => __POST(...args))))
}
