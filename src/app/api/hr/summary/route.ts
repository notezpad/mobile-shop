import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, hrSafe } from '@/lib/hr-route'
import { addDaysStr, weekdayOf } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz, startOfMonthInTz } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

/** ملخص الصفحة الرئيسية: حاضر/متأخر/غائب النهارده، تكلفة العمالة، السلف، تنبيهات */
async function __GET() {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const tenantId = session.tenantId
  const tz = await getTenantTimezone(tenantId)
  const now = new Date()
  const today = dateStrInTz(now, tz)
  const month = today.slice(0, 7)
  const weekAgo = addDaysStr(today, -6)

  const [employees, todayRecs, weekRecs, advAgg, run, sales] = await Promise.all([
    db.employee.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, baseSalary: true, weeklyOffDay: true },
    }),
    db.attendanceRecord.findMany({
      where: { tenantId, date: today },
      select: { employeeId: true, status: true, checkIn: true, lateMinutes: true },
    }),
    db.attendanceRecord.findMany({
      where: { tenantId, date: { gte: weekAgo, lte: today }, status: { in: ['late', 'absent'] } },
      select: { employeeId: true, status: true },
    }),
    db.employeeAdvance.aggregate({ where: { tenantId, status: 'open' }, _sum: { remaining: true }, _count: true }),
    db.payrollRun.findUnique({
      where: { tenantId_month: { tenantId, month } },
      select: { id: true, status: true, totalNet: true, payslips: { select: { net: true, advanceDeduction: true } } },
    }),
    db.sale.aggregate({
      where: { tenantId, createdAt: { gte: startOfMonthInTz(now, tz) }, status: { in: ['مكتملة', 'مرتجعة جزئياً'] } },
      _sum: { total: true },
    }),
  ])

  const nameOf = new Map(employees.map((e) => [e.id, e.name]))
  const todayOff = weekdayOf(today)
  const rec = new Map(todayRecs.map((r) => [r.employeeId, r]))
  const list = (st: string) =>
    todayRecs.filter((r) => r.status === st && nameOf.has(r.employeeId)).map((r) => ({ id: r.employeeId, name: nameOf.get(r.employeeId)!, lateMinutes: r.lateMinutes }))
  const onOff = employees.filter((e) => e.weeklyOffDay === todayOff && !rec.has(e.id)).length
  const notRecorded = employees.filter((e) => !rec.has(e.id) && e.weeklyOffDay !== todayOff).length

  // تنبيه: 3 مرات تأخير/غياب أو أكتر في آخر 7 أيام
  const bad = new Map<number, number>()
  for (const r of weekRecs) bad.set(r.employeeId, (bad.get(r.employeeId) ?? 0) + 1)
  const alerts = [...bad.entries()]
    .filter(([id, n]) => n >= 3 && nameOf.has(id))
    .map(([id, n]) => ({ id, name: nameOf.get(id)!, count: n }))

  const estimated = employees.reduce((s, e) => s + e.baseSalary, 0)
  const laborCost = run?.status === 'paid'
    ? run.payslips.reduce((s, p) => s + p.net + p.advanceDeduction, 0)
    : estimated
  const salesTotal = sales._sum.total ?? 0

  return NextResponse.json({
    today, month,
    employeesCount: employees.length,
    present: todayRecs.filter((r) => r.status === 'present').length,
    late: list('late'), absent: list('absent'), leave: list('leave'),
    onOff, notRecorded,
    advances: { count: advAgg._count, remaining: advAgg._sum.remaining ?? 0 },
    payroll: { runId: run?.id ?? null, status: run?.status ?? null, estimated, laborCost, isEstimate: run?.status !== 'paid' },
    salesThisMonth: salesTotal,
    laborPct: salesTotal > 0 ? Math.round((laborCost / salesTotal) * 1000) / 10 : null,
    alerts,
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
