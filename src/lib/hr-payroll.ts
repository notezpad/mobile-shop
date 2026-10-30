/**
 * hr-payroll.ts — توليد/تحديث مسودة الرواتب (سيرفر).
 * بيجمع الحضور والسلف ويطبّق computePayslip، وبيحافظ على الحافز/الجزاء/الملاحظة
 * اللي المدير عدّلهم يدويًا لو المسودة اتولّدت تاني.
 * الحساب على الأيام الفعلية: اليوم بيتدفع بس لو عنده سجل حضور/تأخير أو
 * إجازة بمرتب أو إذن أو راحة أسبوعية مستحقة — اليوم اللي ملوش سجل مبيتدفعش.
 */
import { db } from '@/lib/db'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { loadHrSettings } from '@/lib/hr-route'
import { computePayslip, countPaidDays, countedLate, monthBounds, type DayRecordStatus } from '@/lib/hr'

export async function generatePayrollDraft(tenantId: string, month: string, userId: string) {
  const [tz, settings] = await Promise.all([getTenantTimezone(tenantId), loadHrSettings(tenantId)])
  const { first, last } = monthBounds(month)
  const today = dateStrInTz(new Date(), tz)

  const [employees, records, advances, existingRun, permissions] = await Promise.all([
    db.employee.findMany({ where: { tenantId, active: true } }),
    db.attendanceRecord.findMany({
      where: { tenantId, date: { gte: first, lte: last } },
      select: { employeeId: true, date: true, status: true, lateMinutes: true },
    }),
    db.employeeAdvance.findMany({ where: { tenantId, status: 'open', remaining: { gt: 0 } } }),
    db.payrollRun.findUnique({ where: { tenantId_month: { tenantId, month } }, include: { payslips: true } }),
    // الأذون (permission) سجل متابعة بس — مالهاش سجل حضور، بس اليوم بيتدفع زي ما هو
    db.leaveRequest.findMany({
      where: { tenantId, type: 'permission', startDate: { gte: first, lte: last } },
      select: { employeeId: true, startDate: true },
    }),
  ])
  if (existingRun && existingRun.status === 'paid') throw new Error('PAID')

  const prev = new Map((existingRun?.payslips ?? []).map((p) => [p.employeeId, p]))
  const absent = new Map<number, number>()
  const late = new Map<number, number>()
  const recsByEmp = new Map<number, Map<string, DayRecordStatus>>()
  for (const r of records) {
    if (r.status === 'absent') absent.set(r.employeeId, (absent.get(r.employeeId) ?? 0) + 1)
    if (r.status === 'late') late.set(r.employeeId, (late.get(r.employeeId) ?? 0) + countedLate(r.lateMinutes, settings.graceMinutes))
    const m = recsByEmp.get(r.employeeId) ?? new Map<string, DayRecordStatus>()
    m.set(r.date, r.status as DayRecordStatus)
    recsByEmp.set(r.employeeId, m)
  }
  const permsByEmp = new Map<number, Set<string>>()
  for (const p of permissions) {
    const s = permsByEmp.get(p.employeeId) ?? new Set<string>()
    s.add(p.startDate)
    permsByEmp.set(p.employeeId, s)
  }
  const advDue = new Map<number, number>()
  for (const a of advances) {
    advDue.set(a.employeeId, (advDue.get(a.employeeId) ?? 0) + Math.min(a.installment, a.remaining))
  }

  const rows = employees
    .map((e) => {
      const hire = dateStrInTz(e.hireDate, tz)
      const p = prev.get(e.id)
      const bonus = p?.bonus ?? 0
      const penalty = p?.penalty ?? 0
      const paid = countPaidDays({
        month, today, hireDate: hire, weeklyOffDay: e.weeklyOffDay,
        records: recsByEmp.get(e.id) ?? new Map(),
        permissionDates: permsByEmp.get(e.id),
      })
      const calc = computePayslip({
        baseSalary: e.baseSalary, hireDate: hire, month, settings,
        absentDays: absent.get(e.id) ?? 0, lateMinutes: late.get(e.id) ?? 0,
        advanceDue: advDue.get(e.id) ?? 0, bonus, penalty,
        paidDays: paid.paidDays,
      })
      return { e, hire, bonus, penalty, note: p?.note ?? null, calc }
    })
    // موظف اتعيّن بعد الشهر ده مالوش راتب فيه
    .filter((r) => r.hire <= last)

  const totalNet = rows.reduce((s, r) => s + r.calc.net, 0)

  const run = await db.$transaction(async (tx) => {
    const run = existingRun
      ? await tx.payrollRun.update({ where: { id: existingRun.id }, data: { totalNet } })
      : await tx.payrollRun.create({ data: { tenantId, month, totalNet, createdBy: userId } })
    const keep = rows.map((r) => r.e.id)
    await tx.payslip.deleteMany({ where: { runId: run.id, employeeId: { notIn: keep } } })
    for (const r of rows) {
      const data = {
        employeeName: r.e.name,
        baseSalary: r.e.baseSalary,
        payableBase: r.calc.payableBase,
        absentDays: absent.get(r.e.id) ?? 0,
        absenceDeduction: r.calc.absenceDeduction,
        lateMinutes: late.get(r.e.id) ?? 0,
        lateDeduction: r.calc.lateDeduction,
        bonus: r.bonus,
        penalty: r.penalty,
        advanceDeduction: r.calc.advanceDeduction,
        net: r.calc.net,
        note: r.note,
      }
      await tx.payslip.upsert({
        where: { runId_employeeId: { runId: run.id, employeeId: r.e.id } },
        create: { runId: run.id, tenantId, employeeId: r.e.id, ...data },
        update: data,
      })
    }
    return run
  }, { timeout: 20_000, maxWait: 10_000 })
  return run
}
