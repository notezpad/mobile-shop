import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { hrGuard, bad, loadHrSettings, hrSafe } from '@/lib/hr-route'
import { countedLate, isValidPin, rawLateMinutes, timeToMinutes } from '@/lib/hr'
import { verifyPin, pinAttemptBegin, pinAttemptClear } from '@/lib/hr-pin'
import { getSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { loadEmployeeShift, resolveShiftAnchor } from '@/lib/shift-attendance'

export const dynamic = 'force-dynamic'

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

  const emp = await db.employee.findUnique({ where: { id: employeeId } })
  if (!emp || emp.tenantId !== session.tenantId || !emp.active) return bad('الموظف غير موجود', 404)
  if (!emp.pinHash) return bad('لسه ماتحددش PIN للموظف ده — حدده من شاشة الموظفين')
  // 🔐 العدّ قبل التحقق (ذرّي في الداتابيز) — الزيادة الأخيرة المقفولة بترفض حتى لو الـ PIN صح
  if ((await pinAttemptBegin(session.tenantId, emp.id)).locked) {
    return bad('محاولات كتير غلط — جرّب بعد شوية', 429)
  }
  const v = await verifyPin(session.tenantId, emp.id, b.pin, emp.pinHash)
  if (!v.ok) return bad('الـ PIN غير صحيح', 401)
  await pinAttemptClear(session.tenantId, emp.id)
  if (v.upgrade) {
    // ترقية تجزئة PIN القديم لـ v2 (بصمت)
    await db.employee.update({ where: { id: emp.id }, data: { pinHash: v.upgrade } }).catch(() => {})
  }

  const [tz, settings] = await Promise.all([getTenantTimezone(session.tenantId), loadHrSettings(session.tenantId)])
  // تسجيل اتحفظ على الجهاز بدون نت: بنستخدم وقته الحقيقي (clientTime) بحدود أمان —
  // مش في المستقبل (سماح دقيقتين لفرق الساعة) ومش أقدم من 48 ساعة.
  let now = new Date()
  if (b?.clientTime !== undefined) {
    const t = new Date(String(b.clientTime))
    if (Number.isNaN(t.getTime()) || t.getTime() > Date.now() + 2 * 60_000) return bad('وقت التسجيل غير صالح')
    if (t.getTime() < Date.now() - 48 * 3600_000) return bad('التسجيل قديم (أكتر من 48 ساعة) — سجّله يدوي من الحضور', 410)
    now = t
  }
  // 🕐 وردية الموظف المحددة (لو موجودة) هي مرجع التأخير وتاريخ السجل؛ وإلا الإعداد العام
  const empShift = await loadEmployeeShift(session.tenantId, emp)
  const anchor = empShift ? resolveShiftAnchor(now, tz, empShift.from) : null
  const today = anchor ? anchor.dateKey : dateStrInTz(now, tz)
  const existing = await db.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: today } } })

  // ── انصراف ──
  if (existing?.checkIn && (existing.status === 'present' || existing.status === 'late')) {
    if (existing.checkOut) return bad('سجّلت حضورك وانصرافك النهارده خلاص', 409)
    if (now.getTime() - existing.checkIn.getTime() < 2 * 60_000) return bad('سجّلت حضورك من لحظات', 409)
    await getSql()`UPDATE "AttendanceRecord" SET "checkOut" = ${now.toISOString()}::text::timestamp, "updatedAt" = now() WHERE "id" = ${existing.id}`
    return NextResponse.json({ ok: true, action: 'out', name: emp.name, at: now.toISOString() })
  }

  // ── حضور (جديد، أو بديل لسجل يدوي غياب/إجازة اتعدّل) ──
  const shiftStartUtc = anchor
    ? anchor.startUtc
    : new Date(localDateStrToUtcBounds(today, 'start', tz).getTime() + timeToMinutes(settings.shiftStart) * 60_000)
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
