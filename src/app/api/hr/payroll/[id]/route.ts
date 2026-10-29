import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { countUnrecordedDays, monthBounds, round2 } from '@/lib/hr'
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

  // تحذير: أيام عمل غير مسجّلة لكل موظف (بتتحسب حاضر ضمنيًا)
  const tz = await getTenantTimezone(session.tenantId)
  const today = dateStrInTz(new Date(), tz)
  const { first, last } = monthBounds(run.month)
  const unrecorded = new Map<number, number>()
  if (run.status === 'draft') {
    const [emps, recs] = await Promise.all([
      db.employee.findMany({
        where: { id: { in: run.payslips.map((p) => p.employeeId) } },
        select: { id: true, hireDate: true, weeklyOffDay: true },
      }),
      db.attendanceRecord.findMany({
        where: { tenantId: session.tenantId, date: { gte: first, lte: last } },
        select: { employeeId: true, date: true },
      }),
    ])
    const dates = new Map<number, Set<string>>()
    for (const r of recs) {
      const s = dates.get(r.employeeId) ?? new Set<string>()
      s.add(r.date)
      dates.set(r.employeeId, s)
    }
    for (const e of emps) {
      unrecorded.set(e.id, countUnrecordedDays({
        month: run.month, today, hireDate: dateStrInTz(e.hireDate, tz),
        weeklyOffDay: e.weeklyOffDay, recordedDates: dates.get(e.id) ?? new Set(),
      }))
    }
  }
  return NextResponse.json({
    id: run.id, month: run.month, status: run.status, totalNet: run.totalNet, method: run.method, paidAt: run.paidAt,
    payslips: run.payslips.map((p) => ({ ...p, unrecordedDays: unrecorded.get(p.employeeId) ?? 0 })),
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
