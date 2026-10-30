import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { countPaidDays, monthBounds, round2, type DayRecordStatus } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function loadRun(id: number, tenantId: string) {
  const run = await db.payrollRun.findUnique({ where: { id }, include: { payslips: { orderBy: { employeeName: 'asc' } } } })
  return run && run.tenantId === tenantId ? run : null
}

async function __GET(_req: NextRequest, { params }: Ctx) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  const run = Number.isFinite(id) ? await loadRun(id, session.tenantId) : null
  if (!run) return bad('الدورة غير موجودة', 404)

  // تفاصيل الأيام الفعلية لكل موظف (للمسودة): أيام شغل / بدون تسجيل / لسه جاية
  const tz = await getTenantTimezone(session.tenantId)
  const today = dateStrInTz(new Date(), tz)
  const { first, last } = monthBounds(run.month)
  const breakdown = new Map<number, ReturnType<typeof countPaidDays> | null>()
  if (run.status === 'draft') {
    const [emps, recs, perms] = await Promise.all([
      db.employee.findMany({
        where: { id: { in: run.payslips.map((p) => p.employeeId) } },
        select: { id: true, hireDate: true, weeklyOffDay: true },
      }),
      db.attendanceRecord.findMany({
        where: { tenantId: session.tenantId, date: { gte: first, lte: last } },
        select: { employeeId: true, date: true, status: true },
      }),
      db.leaveRequest.findMany({
        where: { tenantId: session.tenantId, type: 'permission', startDate: { gte: first, lte: last } },
        select: { employeeId: true, startDate: true },
      }),
    ])
    const recsByEmp = new Map<number, Map<string, DayRecordStatus>>()
    for (const r of recs) {
      const m = recsByEmp.get(r.employeeId) ?? new Map<string, DayRecordStatus>()
      m.set(r.date, r.status as DayRecordStatus)
      recsByEmp.set(r.employeeId, m)
    }
    const permsByEmp = new Map<number, Set<string>>()
    for (const p of perms) {
      const s = permsByEmp.get(p.employeeId) ?? new Set<string>()
      s.add(p.startDate)
      permsByEmp.set(p.employeeId, s)
    }
    for (const e of emps) {
      breakdown.set(e.id, countPaidDays({
        month: run.month, today, hireDate: dateStrInTz(e.hireDate, tz),
        weeklyOffDay: e.weeklyOffDay, records: recsByEmp.get(e.id) ?? new Map(),
        permissionDates: permsByEmp.get(e.id),
      }))
    }
  }
  const phones = new Map<number, string | null>(
    (await db.employee.findMany({ where: { id: { in: run.payslips.map((p) => p.employeeId) } }, select: { id: true, phone: true } }))
      .map((e) => [e.id, e.phone]),
  )
  return NextResponse.json({
    id: run.id, month: run.month, status: run.status, totalNet: run.totalNet, method: run.method, paidAt: run.paidAt,
    payslips: run.payslips.map((p) => {
      const b = breakdown.get(p.employeeId)
      return {
        ...p, phone: phones.get(p.employeeId) ?? null,
        unrecordedDays: b?.unrecordedDays ?? 0,
        pendingDays: b?.pendingDays ?? 0,
        workedDays: b?.workedDays ?? null,
        expectedWorkDays: b?.expectedWorkDays ?? null,
      }
    }),
  })
}

/** PUT { payslips: [{ id, bonus, penalty, note }] } — تعديل الحافز/الجزاء قبل الاعتماد */
async function __PUT(req: NextRequest, { params }: Ctx) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  const run = Number.isFinite(id) ? await loadRun(id, session.tenantId) : null
  if (!run) return bad('الدورة غير موجودة', 404)
  if (run.status !== 'draft') return bad('الدورة اتصرفت ولا يمكن تعديلها', 409)

  const b = await req.json().catch(() => null)
  const edits: any[] = Array.isArray(b?.payslips) ? b.payslips : []
  const byId = new Map(run.payslips.map((p) => [p.id, p]))
  const updates = []
  for (const ed of edits) {
    const p = byId.get(Number(ed?.id))
    if (!p) return bad('قسيمة غير موجودة')
    const bonus = round2(Math.max(0, Number(ed.bonus) || 0))
    const penalty = round2(Math.max(0, Number(ed.penalty) || 0))
    const gross = Math.max(0, round2(p.payableBase - p.absenceDeduction - p.lateDeduction + bonus - penalty))
    const advanceDeduction = round2(Math.min(gross, p.advanceDeduction))
    const net = round2(gross - advanceDeduction)
    updates.push(db.payslip.update({
      where: { id: p.id },
      data: { bonus, penalty, advanceDeduction, net, note: ed.note ? String(ed.note).trim().slice(0, 200) || null : null },
    }))
  }
  await db.$transaction(updates)
  const sum = await db.payslip.aggregate({ where: { runId: run.id }, _sum: { net: true } })
  await db.payrollRun.update({ where: { id: run.id }, data: { totalNet: sum._sum.net ?? 0 } })
  await logAudit({ action: 'hr.payroll.adjust', targetType: 'payroll', targetId: run.id, details: { count: edits.length } }, req)
  return NextResponse.json({ ok: true })
}

async function __DELETE(req: NextRequest, { params }: Ctx) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  const run = Number.isFinite(id) ? await loadRun(id, session.tenantId) : null
  if (!run) return bad('الدورة غير موجودة', 404)
  if (run.status !== 'draft') return bad('لا يمكن حذف دورة اتصرفت', 409)
  await db.payrollRun.delete({ where: { id: run.id } })
  await logAudit({ action: 'hr.payroll.delete', targetType: 'payroll', targetId: run.id, details: { month: run.month } }, req)
  return NextResponse.json({ ok: true })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => hrSafe(() => __PUT(...args)))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => hrSafe(() => __DELETE(...args)))
}
