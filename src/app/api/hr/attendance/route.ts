import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, loadHrSettings } from '@/lib/hr-route'
import { HR_STATUSES, isDateStr, isMonthStr, monthBounds, type HrStatus } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
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
  const empIds = [...new Set(list.map((r) => Number(r?.employeeId)))]
  const owned = await db.employee.findMany({
    where: { tenantId: session.tenantId, id: { in: empIds.filter(Number.isFinite) } },
    select: { id: true },
  })
  const ownedSet = new Set(owned.map((e) => e.id))

  const ops: ReturnType<typeof db.attendanceRecord.upsert>[] = []
  const dels: ReturnType<typeof db.attendanceRecord.deleteMany>[] = []
  for (const r of list) {
    const employeeId = Number(r?.employeeId)
    if (!ownedSet.has(employeeId)) return bad('موظف غير موجود')
    if (!isDateStr(r?.date)) return bad('تاريخ غير صالح')
    if (r.date > today) return bad('لا يمكن تسجيل حضور ليوم لم يأتِ بعد')
    if (r.status === null) {
      dels.push(db.attendanceRecord.deleteMany({ where: { tenantId: session.tenantId, employeeId, date: r.date } }))
      continue
    }
    if (!HR_STATUSES.includes(r.status)) return bad('حالة حضور غير صالحة')
    const status = r.status as HrStatus
    const lateMinutes = status === 'late' ? Math.max(0, Math.min(600, Math.floor(Number(r.lateMinutes) || 0))) : 0
    const note = r.note ? String(r.note).trim().slice(0, 200) || null : null
    ops.push(
      db.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId, date: r.date } },
        create: { tenantId: session.tenantId, employeeId, date: r.date, status, lateMinutes, note, source: 'manual', createdBy: session.userId },
        update: { status, lateMinutes, note, source: 'manual', createdBy: session.userId },
      }),
    )
  }
  await db.$transaction([...dels, ...ops])
  await logAudit({ action: 'hr.attendance.bulk', targetType: 'tenant', targetId: session.tenantId, details: { count: list.length } }, req)
  return NextResponse.json({ ok: true, count: list.length })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
