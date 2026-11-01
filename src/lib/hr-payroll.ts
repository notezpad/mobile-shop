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
import { getSql } from '@/lib/sql'
import { findEmployeeShift } from '@/lib/branch-shifts'
import {
  sellersMonthAggregates,
  applyTargetGate,
  resolveSellerTarget,
  resolveSellerRate,
  type SellerMonthNumbers,
} from '@/lib/seller-commissions'

export async function generatePayrollDraft(tenantId: string, month: string, userId: string) {
  const [tz, settings] = await Promise.all([getTenantTimezone(tenantId), loadHrSettings(tenantId)])
  const { first, last } = monthBounds(month)
  const today = dateStrInTz(new Date(), tz)

  // 💰 (التحديث الثالث عشر) عمولات البائعين — تُحسب لكل موظف مرتبط بحساب
  // مستخدم (Employee.userId) معلّم كـ«بائع»، بشرط:
  //  1. الميزة مفعّلة عند صاحب المحل.
  //  2. ما تكونش اتصرفت منفصلة (CommissionPayout للشهر موجود) — وقتها 0.
  //  3. تحقق تارجت البائع (استثناء له أو العام).
  // وبيتسجل حجز CommissionPayout (viaPayroll=true) جوه نفس الـ transaction
  // عشان التقرير يمنع صرفها منفصلة، ويتنضف لو المسودة اتعملت تاني من غير عمولة.
  const commissionsCfg = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { sellerCommissionsEnabled: true, sellerCommissionRate: true, sellerCommissionTarget: true },
  })
  const commissionsEnabled = commissionsCfg?.sellerCommissionsEnabled === true

  const [employees, records, advances, existingRun, permissions, monthPayouts] = await Promise.all([
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
    db.commissionPayout.findMany({ where: { tenantId, month } }),
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
    // 🛡️ المرحلة 4: installment/remaining بقوا Decimal — بيتحولوا number
    advDue.set(a.employeeId, (advDue.get(a.employeeId) ?? 0) + Math.min(Number(a.installment), Number(a.remaining)))
  }

  // 💰 عمولات البائعين للشهر — استعلام SQL واحد للمبيعات + واحد للمرتجعات
  const linkedUserIds = [...new Set(employees.map((e) => e.userId).filter((v): v is string => !!v))]
  let aggByUser = new Map<string, SellerMonthNumbers>()
  let sellerUsersById = new Map<string, { id: string; name: string; isSeller: boolean; sellerCommissionRate: number | null; sellerCommissionTarget: number | null }>()
  if (commissionsEnabled && linkedUserIds.length > 0) {
    const [sqlAgg, sellerUsers] = await Promise.all([
      sellersMonthAggregates(getSql(), tenantId, month, tz),
      db.user.findMany({
        where: { tenantId, id: { in: linkedUserIds } },
        select: { id: true, name: true, isSeller: true, sellerCommissionRate: true, sellerCommissionTarget: true },
      }),
    ])
    aggByUser = sqlAgg
    // 🛡️ المرحلة 4: sellerCommissionTarget بقى Decimal — بيتحول number للواجهة الداخلية
    sellerUsersById = new Map(
      sellerUsers.map((u) => [u.id, {
        ...u,
        sellerCommissionTarget: u.sellerCommissionTarget == null ? null : Number(u.sellerCommissionTarget),
      }]),
    )
  }
  // عمولة اتصرفت منفصلة (payout يدوي من تقرير العمولات)؟ → مبيتدفعش تاني في
  // القسيمة. حجوزات viaPayroll بتتحسب fresh كل توليد — مش بتمنع الحساب.
  const paidOutUsers = new Set(
    monthPayouts.filter((p) => !p.viaPayroll).map((p) => p.userId),
  )

  // 🕐 ساعات وردية كل موظف (لخصم دقيقة التأخير) — من ورديات فرعه، وإلا الإعداد العام
  const [branchRows, linkedUsers] = await Promise.all([
    db.branch.findMany({ where: { tenantId }, select: { id: true, shifts: true } }),
    linkedUserIds.length
      ? db.user.findMany({ where: { tenantId, id: { in: linkedUserIds } }, select: { id: true, branchId: true } })
      : Promise.resolve([] as { id: string; branchId: number | null }[]),
  ])
  const shiftsByBranch = new Map(branchRows.map((b) => [b.id, b.shifts]))
  const branchByUser = new Map(linkedUsers.map((u) => [u.id, u.branchId]))

  const rows = employees
    .map((e) => {
      const hire = dateStrInTz(e.hireDate, tz)
      const p = prev.get(e.id)
      // 🛡️ المرحلة 4: bonus/penalty من قسيمة سابقة بقوا Decimal — بيتحولوا number
      const bonus = p?.bonus != null ? Number(p.bonus) : 0
      const penalty = p?.penalty != null ? Number(p.penalty) : 0
      const paid = countPaidDays({
        month, today, hireDate: hire, weeklyOffDay: e.weeklyOffDay,
        records: recsByEmp.get(e.id) ?? new Map(),
        permissionDates: permsByEmp.get(e.id),
      })
      // 💰 عمولة الموظف-البائع للشهر (0 لو مش بائع / الميزة مقفولة / اتصرفت)
      let commission = 0
      let commissionMeta: { userId: string; target: number | null; netBase: number; salesTotal: number; returnsTotal: number; rate: number } | null = null
      const sellerUser = e.userId ? sellerUsersById.get(e.userId) : null
      if (sellerUser && sellerUser.isSeller && e.userId && !paidOutUsers.has(e.userId)) {
        const nums = aggByUser.get(e.userId)
        const target = resolveSellerTarget(sellerUser.sellerCommissionTarget, commissionsCfg?.sellerCommissionTarget != null ? Number(commissionsCfg.sellerCommissionTarget) : null)
        const gate = applyTargetGate(nums?.grossCommission ?? 0, nums?.netBase ?? 0, target)
        commission = gate.commission
        if (gate.targetMet && commission !== 0) {
          commissionMeta = {
            userId: e.userId,
            target,
            netBase: nums?.netBase ?? 0,
            salesTotal: nums?.salesTotal ?? 0,
            returnsTotal: nums?.returnsTotal ?? 0,
            rate: resolveSellerRate(sellerUser.sellerCommissionRate, commissionsCfg?.sellerCommissionRate ?? null) ?? 0,
          }
        }
      }
      const effBranch = e.branchId ?? (e.userId ? branchByUser.get(e.userId) ?? null : null)
      const empShift = effBranch != null ? findEmployeeShift(shiftsByBranch.get(effBranch), e.shiftName) : null
      const empSettings = empShift ? { ...settings, shiftHours: empShift.hours } : settings
      const calc = computePayslip({
        baseSalary: Number(e.baseSalary), hireDate: hire, month, settings: empSettings,
        absentDays: absent.get(e.id) ?? 0, lateMinutes: late.get(e.id) ?? 0,
        advanceDue: advDue.get(e.id) ?? 0, bonus, penalty, commission,
        paidDays: paid.paidDays,
      })
      return { e, hire, bonus, penalty, commission, commissionMeta, note: p?.note ?? null, calc }
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
        // 💰 العمولة تُحسب fresh في كل توليد مسودة (مش محفوظة زي الحافز)
        commission: r.commission,
        advanceDeduction: r.calc.advanceDeduction,
        advanceDue: advDue.get(r.e.id) ?? 0,
        net: r.calc.net,
        note: r.note,
      }
      await tx.payslip.upsert({
        where: { runId_employeeId: { runId: run.id, employeeId: r.e.id } },
        create: { runId: run.id, tenantId, employeeId: r.e.id, ...data },
        update: data,
      })
    }

    // 💰 حجز/تحديث عمولات الرواتب في تقرير العمولات (viaPayroll) — نفس tx
    const payrollMarkers = rows.filter((r) => r.commissionMeta)
    for (const r of payrollMarkers) {
      const m = r.commissionMeta!
      await tx.commissionPayout.upsert({
        where: { tenantId_userId_month: { tenantId, userId: m.userId, month } },
        create: {
          tenantId, userId: m.userId, month,
          salesTotal: m.salesTotal, returnsTotal: m.returnsTotal, netBase: m.netBase,
          rate: m.rate, target: m.target, targetMet: true,
          adjustments: 0, amount: r.commission,
          viaPayroll: true, method: 'payroll',
          note: 'محجوزة في مسير رواتب الشهر',
          paidById: userId,
        },
        update: {
          salesTotal: m.salesTotal, returnsTotal: m.returnsTotal, netBase: m.netBase,
          rate: m.rate, target: m.target, targetMet: true,
          adjustments: 0, amount: r.commission,
          viaPayroll: true, method: 'payroll',
        },
      })
    }
    // 💰 تنظيف حجوزات مسير الرواتب اللي عمولتها بقت 0 (مسودة اتولّدت تاني بعد مرتجعات مثلاً)
    const markerUserIds = new Set(payrollMarkers.map((r) => r.commissionMeta!.userId))
    const stalePayrollPayouts = monthPayouts.filter((p) => p.viaPayroll && !markerUserIds.has(p.userId))
    if (stalePayrollPayouts.length > 0) {
      await tx.commissionPayout.deleteMany({
        where: { tenantId, month, viaPayroll: true, userId: { in: stalePayrollPayouts.map((p) => p.userId) } },
      })
    }

    return run
  }, { timeout: 20_000, maxWait: 10_000 })
  return run
}
