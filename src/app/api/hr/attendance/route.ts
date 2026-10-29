import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, loadHrSettings, hrSafe } from '@/lib/hr-route'
import { HR_STATUSES, isDateStr, isMonthStr, monthBounds, type HrStatus } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { getSql } from '@/lib/sql'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET ?month=YYYY-MM → الموظفين النشطين + سجلات الحضور للشهر */
async function __GET(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const tz = await getTenantTimezone(session.tenantId)
  const today = dateStrInTz(new Date(), tz)
  const monthParam = new URL(req.url).searchParams.get('month')
  const month = isMonthStr(monthParam) ? monthParam : today.slice(0, 7)
  const { first, last, days } = monthBounds(month)

  const [employees, records, settings] = await Promise.all([
    db.employee.findMany({
      where: { tenantId: session.tenantId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, jobTitle: true, weeklyOffDay: true, hireDate: true },
    }),
    db.attendanceRecord.findMany({
      where: { tenantId: session.tenantId, date: { gte: first, lte: last } },
      select: { employeeId: true, date: true, status: true, lateMinutes: true, checkIn: true, checkOut: true, note: true, source: true },
    }),
    loadHrSettings(session.tenantId),
  ])
  return NextResponse.json({
    month, today, tz, daysInMonth: days, settings,
    employees: employees.map((e) => ({ ...e, hireDate: dateStrInTz(e.hireDate, tz) })),
    records,
  })
}

/**
 * POST { records: [{ employeeId, date, status | null, lateMinutes?, note? }] }
 * status = null → مسح السجل (يرجع "غير مسجّل" = حاضر ضمنيًا).
 */
async function __POST(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  const list: any[] = Array.isArray(b?.records) ? b.records : []
  if (list.length === 0) return bad('لا توجد سجلات')
  if (list.length > 500) return bad('عدد السجلات كبير — أرسلها على دفعات')

  const tz = await getTenantTimezone(session.tenantId)
  const today = dateStrInTz(new Date(), tz)
  const sql = getSql()

  // ── تحقق + تجميع (آخر قيمة لنفس الموظف/اليوم هي اللي تكسب) ──
  const upserts = new Map<string, { employeeId: number; date: string; status: HrStatus; lateMinutes: number; note: string | null }>()
  const deletes = new Map<string, { employeeId: number; date: string }>()
  for (const r of list) {
    const employeeId = Number(r?.employeeId)
    if (!Number.isInteger(employeeId)) return bad('موظف غير صالح')
    if (!isDateStr(r?.date)) return bad('تاريخ غير صالح')
    if (r.date > today) return bad('لا يمكن تسجيل حضور ليوم لم يأتِ بعد')
    const key = `${employeeId}|${r.date}`
    if (r.status === null) {
      upserts.delete(key)
      deletes.set(key, { employeeId, date: r.date })
      continue
    }
    if (!HR_STATUSES.includes(r.status)) return bad('حالة حضور غير صالحة')
    const status = r.status as HrStatus
    deletes.delete(key)
    upserts.set(key, {
      employeeId, date: r.date, status,
      lateMinutes: status === 'late' ? Math.max(0, Math.min(600, Math.floor(Number(r.lateMinutes) || 0))) : 0,
      note: r.note ? String(r.note).trim().slice(0, 200) || null : null,
    })
  }

  const ids = [...new Set([...upserts.values(), ...deletes.values()].map((r) => r.employeeId))]
  const owned = await sql<{ id: number }[]>`
    SELECT "id" FROM "Employee" WHERE "tenantId" = ${session.tenantId} AND "id" IN ${sql(ids)}`
  if (owned.length !== ids.length) return bad('موظف غير موجود')

  // ⚡ استعلامين خفيفين (postgres.js) بدل معاملة Prisma — توفير CPU على الـ Worker
  if (upserts.size > 0) {
    const payload = JSON.stringify([...upserts.values()])
    await sql`
      INSERT INTO "AttendanceRecord"
        ("tenantId", "employeeId", "date", "status", "lateMinutes", "note", "source", "createdBy", "updatedAt")
      SELECT ${session.tenantId}, r."employeeId", r."date", r."status", r."lateMinutes", r."note",
             'manual', ${session.userId}, now()
      FROM jsonb_to_recordset(${payload}::text::jsonb)
        AS r("employeeId" int, "date" text, "status" text, "lateMinutes" int, "note" text)
      ON CONFLICT ("employeeId", "date") DO UPDATE SET
        "status" = EXCLUDED."status", "lateMinutes" = EXCLUDED."lateMinutes", "note" = EXCLUDED."note",
        "source" = 'manual', "createdBy" = EXCLUDED."createdBy", "updatedAt" = now()`
  }
  if (deletes.size > 0) {
    const payload = JSON.stringify([...deletes.values()])
    await sql`
      DELETE FROM "AttendanceRecord" a
      USING jsonb_to_recordset(${payload}::text::jsonb) AS r("employeeId" int, "date" text)
      WHERE a."tenantId" = ${session.tenantId} AND a."employeeId" = r."employeeId" AND a."date" = r."date"`
  }
  await logAudit({ action: 'hr.attendance.bulk', targetType: 'tenant', targetId: session.tenantId, details: { count: list.length } }, req)
  return NextResponse.json({ ok: true, count: list.length })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => hrSafe(() => __POST(...args)))
}
