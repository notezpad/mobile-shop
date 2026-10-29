import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { hrGuard, bad, loadHrSettings, hrSafe } from '@/lib/hr-route'
import { countedLate, hashPin, isValidPin, rawLateMinutes, timeToMinutes } from '@/lib/hr'
import { getSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

/** محاولات PIN غلط (ذاكرة الـ isolate — حماية خفيفة من التخمين على جهاز المحل) */
const fails = new Map<string, { n: number; at: number }>()
const WINDOW_MS = 5 * 60_000
const MAX_FAILS = 5

/** GET → قائمة الموظفين النشطين + حالة اليوم (بدون أي رواتب) */
async function __GET() {
  const g = await hrGuard('device')
  if ('res' in g) return g.res
  const { session } = g
  const tz = await getTenantTimezone(session.tenantId)
  const today = dateStrInTz(new Date(), tz)
  const [employees, records] = await Promise.all([
    db.employee.findMany({
      where: { tenantId: session.tenantId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, jobTitle: true, pinHash: true },
    }),
    db.attendanceRecord.findMany({
      where: { tenantId: session.tenantId, date: today },
      select: { employeeId: true, status: true, checkIn: true, checkOut: true },
    }),
  ])
  const byEmp = new Map(records.map((r) => [r.employeeId, r]))
  return NextResponse.json({
    today, tz,
    items: employees.map((e) => {
      const r = byEmp.get(e.id)
      return {
        id: e.id, name: e.name, jobTitle: e.jobTitle, hasPin: !!e.pinHash,
        status: r?.status ?? null, checkIn: r?.checkIn ?? null, checkOut: r?.checkOut ?? null,
      }
    }),
  })
}

/** POST { employeeId, pin } → حضور لو أول مرة النهارده، انصراف لو سجّل حضور قبل كده */
async function __POST(req: NextRequest) {
  const g = await hrGuard('device')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  const employeeId = Number(b?.employeeId)
  if (!Number.isFinite(employeeId) || !isValidPin(b?.pin)) return bad('الموظف والـ PIN مطلوبين')

  const key = `${session.tenantId}:${employeeId}`
  const f = fails.get(key)
  if (f && Date.now() - f.at < WINDOW_MS && f.n >= MAX_FAILS) {
    return bad('محاولات كتير غلط — جرّب بعد شوية', 429)
  }

  const emp = await db.employee.findUnique({ where: { id: employeeId } })
  if (!emp || emp.tenantId !== session.tenantId || !emp.active) return bad('الموظف غير موجود', 404)
  if (!emp.pinHash) return bad('لسه ماتحددش PIN للموظف ده — حدده من شاشة الموظفين')
  if ((await hashPin(session.tenantId, emp.id, b.pin)) !== emp.pinHash) {
    const cur = f && Date.now() - f.at < WINDOW_MS ? f : { n: 0, at: Date.now() }
    fails.set(key, { n: cur.n + 1, at: cur.at })
    return bad('الـ PIN غير صحيح', 401)
  }
  fails.delete(key)

  const [tz, settings] = await Promise.all([getTenantTimezone(session.tenantId), loadHrSettings(session.tenantId)])
  const now = new Date()
  const today = dateStrInTz(now, tz)
  const existing = await db.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: today } } })

  // ── انصراف ──
  if (existing?.checkIn && (existing.status === 'present' || existing.status === 'late')) {
    if (existing.checkOut) return bad('سجّلت حضورك وانصرافك النهارده خلاص', 409)
    if (now.getTime() - existing.checkIn.getTime() < 2 * 60_000) return bad('سجّلت حضورك من لحظات', 409)
    await getSql()`UPDATE "AttendanceRecord" SET "checkOut" = ${now.toISOString()}::text::timestamp, "updatedAt" = now() WHERE "id" = ${existing.id}`
    return NextResponse.json({ ok: true, action: 'out', name: emp.name, at: now.toISOString() })
  }

  // ── حضور (جديد، أو بديل لسجل يدوي غياب/إجازة اتعدّل) ──
  const shiftStartUtc = new Date(
    localDateStrToUtcBounds(today, 'start', tz).getTime() + timeToMinutes(settings.shiftStart) * 60_000,
  )
  const lateRaw = rawLateMinutes(now, shiftStartUtc)
  const isLate = countedLate(lateRaw, settings.graceMinutes) > 0
  const status = isLate ? 'late' : 'present'
  const lateMinutes = isLate ? lateRaw : 0
  await getSql()`
    INSERT INTO "AttendanceRecord"
      ("tenantId", "employeeId", "date", "status", "checkIn", "checkOut", "lateMinutes", "source", "createdBy", "updatedAt")
    VALUES (${session.tenantId}, ${emp.id}, ${today}, ${status}, ${now.toISOString()}::text::timestamp, NULL,
            ${lateMinutes}, 'kiosk', ${session.userId}, now())
    ON CONFLICT ("employeeId", "date") DO UPDATE SET
      "status" = EXCLUDED."status", "checkIn" = EXCLUDED."checkIn", "checkOut" = NULL,
      "lateMinutes" = EXCLUDED."lateMinutes", "source" = 'kiosk', "leaveId" = NULL, "createdBy" = EXCLUDED."createdBy", "updatedAt" = now()`
  return NextResponse.json({
    ok: true, action: 'in', name: emp.name, at: now.toISOString(), late: isLate, lateMinutes: isLate ? lateRaw : 0,
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => hrSafe(() => __POST(...args))))
}
