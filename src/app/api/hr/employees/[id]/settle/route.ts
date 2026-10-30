import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { hrGuard, bad, hrSafe, loadHrSettings } from '@/lib/hr-route'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import {
  HR_EXPENSE_CATEGORY, HR_PAY_METHODS, computePayslip, countPaidDays, countedLate,
  isDateStr, round2, type DayRecordStatus,
} from '@/lib/hr'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * تصفية حساب موظف بيمشي — كل المستحقات غير المدفوعة في حساب واحد:
 *   • كل شهر اتصرفت روابطه (run مدفوعة فيها قسيمة للموظف) بيتخطى — اتصرف خلاص.
 *   • الشهور الباقية (مسودة أو مفيش run) بتتحسب بنفس منطق الرواتب بالظبط:
 *     الحساب على الأيام الفعلية المسجّلة لحد آخر يوم شغل بس.
 *   • حافز/جزاء القسائم في المسودات بيتنقلوا للتصفية (وماتضيعش لما القسيمة تتشال).
 *   • كل المتبقي من السلف المفتوحة بيتخصم مرة واحدة (مش قسط واحد).
 *   • الدفع بيتسجل زي الرواتب: مصروف «مرتبات» + حركة خزنة صادرة.
 *   • الموظف يتقفل (active=false) وقسائمه في المسودات تتشال.
 */

interface SettleMonth {
  month: string
  workedDays: number
  paidDays: number
  lateMinutes: number
  lateDeduction: number
  bonus: number
  penalty: number
  net: number
}

interface SettlePreview {
  lastWorkDay: string
  months: SettleMonth[]
  totalGross: number
  advanceRemaining: number
  advanceDeduction: number
  net: number
  futureRecords: number
}

/** الحساب المشترك بين المعاينة والتنفيذ — نفس منطق generatePayrollDraft بالظبط. */
async function computeSettlement(
  tenantId: string,
  employee: { id: number; name: string; baseSalary: number; hireDate: Date; weeklyOffDay: number },
  lastWorkDay: string,
  today: string,
): Promise<SettlePreview & { draftRunIds: number[] }> {
  const [tz, settings] = await Promise.all([getTenantTimezone(tenantId), loadHrSettings(tenantId)])
  const hire = dateStrInTz(employee.hireDate, tz)
  if (lastWorkDay < hire) throw new Error('BAD_DATE_BEFORE_HIRE')

  const fromMonth = hire.slice(0, 7)
  const toMonth = lastWorkDay.slice(0, 7)

  // الشهور اللي اتصرفت فعلاً (run مدفوعة فيها قسيمة للموظف) — دي بتتخطى
  const [paidRuns, draftRuns, records, permissions, advances] = await Promise.all([
    db.payrollRun.findMany({
      where: { tenantId, status: 'paid' },
      select: { month: true, payslips: { where: { employeeId: employee.id }, select: { id: true } } },
    }),
    db.payrollRun.findMany({
      where: { tenantId, status: 'draft' },
      select: { id: true, month: true, payslips: { where: { employeeId: employee.id } } },
    }),
    db.attendanceRecord.findMany({
      where: { tenantId, employeeId: employee.id, date: { lte: lastWorkDay } },
      select: { date: true, status: true, lateMinutes: true },
    }),
    db.leaveRequest.findMany({
      where: { tenantId, employeeId: employee.id, type: 'permission', startDate: { lte: lastWorkDay } },
      select: { startDate: true },
    }),
    db.employeeAdvance.findMany({
      where: { tenantId, employeeId: employee.id, status: 'open', remaining: { gt: 0 } },
      orderBy: { id: 'asc' },
    }),
  ])
  const paidMonths = new Set(paidRuns.filter((r) => r.payslips.length > 0).map((r) => r.month))
  const draftByMonth = new Map(draftRuns.map((r) => [r.month, r.payslips[0] ?? null]))

  // تجميع السجلات والأذون بالشهر
  const recsByMonth = new Map<string, Map<string, DayRecordStatus>>()
  const lateByMonth = new Map<string, number>()
  for (const r of records) {
    const m = r.date.slice(0, 7)
    const map = recsByMonth.get(m) ?? new Map<string, DayRecordStatus>()
    map.set(r.date, r.status as DayRecordStatus)
    recsByMonth.set(m, map)
    if (r.status === 'late') {
      lateByMonth.set(m, (lateByMonth.get(m) ?? 0) + countedLate(r.lateMinutes, settings.graceMinutes))
    }
  }
  const permsByMonth = new Map<string, Set<string>>()
  for (const p of permissions) {
    const m = p.startDate.slice(0, 7)
    const s = permsByMonth.get(m) ?? new Set<string>()
    s.add(p.startDate)
    permsByMonth.set(m, s)
  }

  const months: SettleMonth[] = []
  let [y, mo] = fromMonth.split('-').map(Number)
  let cur = fromMonth
  while (cur <= toMonth) {
    if (!paidMonths.has(cur)) {
      const slip = draftByMonth.get(cur)
      const paid = countPaidDays({
        month: cur, today: lastWorkDay, hireDate: hire, weeklyOffDay: employee.weeklyOffDay,
        records: recsByMonth.get(cur) ?? new Map(),
        permissionDates: permsByMonth.get(cur),
      })
      const calc = computePayslip({
        baseSalary: employee.baseSalary, hireDate: hire, month: cur, settings,
        absentDays: 0, // مبيتحسبش — الخصم على (أيام الخدمة − الأيام المدفوعة)
        lateMinutes: lateByMonth.get(cur) ?? 0,
        advanceDue: 0, // السلف بتتخصم كلها مرة واحدة في الآخر
        bonus: slip?.bonus ?? 0,
        penalty: slip?.penalty ?? 0,
        paidDays: paid.paidDays,
      })
      months.push({
        month: cur,
        workedDays: paid.workedDays,
        paidDays: paid.paidDays,
        lateMinutes: lateByMonth.get(cur) ?? 0,
        lateDeduction: calc.lateDeduction,
        bonus: slip?.bonus ?? 0,
        penalty: slip?.penalty ?? 0,
        net: round2(calc.net),
      })
    }
    mo++
    if (mo > 12) { mo = 1; y++ }
    cur = `${y}-${String(mo).padStart(2, '0')}`
  }

  const totalGross = round2(months.reduce((s, m) => s + m.net, 0))
  const advanceRemaining = round2(advances.reduce((s, a) => s + a.remaining, 0))
  const advanceDeduction = round2(Math.min(totalGross, advanceRemaining))
  const net = round2(totalGross - advanceDeduction)

  const futureRecords = await db.attendanceRecord.count({
    where: { tenantId, employeeId: employee.id, date: { gt: lastWorkDay } },
  })

  return {
    lastWorkDay, months, totalGross, advanceRemaining, advanceDeduction, net,
    futureRecords,
    draftRunIds: draftRuns.map((r) => r.id),
  }
}

/** GET ?lastWorkDay=YYYY-MM-DD — معاينة التصفية من غير أي تنفيذ. */
async function __GET(req: NextRequest, { params }: Ctx) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')

  const emp = await db.employee.findUnique({ where: { id } })
  if (!emp || emp.tenantId !== session.tenantId) return bad('الموظف غير موجود', 404)
  if (!emp.active) return bad('الموظف موقوف بالفعل', 409)

  const tz = await getTenantTimezone(session.tenantId)
  const today = dateStrInTz(new Date(), tz)
  const q = req.nextUrl.searchParams.get('lastWorkDay') ?? today
  if (!isDateStr(q)) return bad('تاريخ آخر يوم شغل غير صالح')
  if (q > today) return bad('آخر يوم شغل ممكن يكون النهارده كأقصى حد')

  try {
    const p = await computeSettlement(session.tenantId, emp, q, today)
    const { draftRunIds, ...preview } = p
    return NextResponse.json({
      employee: { id: emp.id, name: emp.name, baseSalary: emp.baseSalary, weeklyOffDay: emp.weeklyOffDay },
      today,
      ...preview,
    })
  } catch (e: any) {
    if (e?.message === 'BAD_DATE_BEFORE_HIRE') return bad('آخر يوم شغل قبل تاريخ التعيين')
    throw e
  }
}

/** POST { lastWorkDay, method, note? } — تنفيذ التصفية (عملية واحدة ذرّية). */
async function __POST(req: NextRequest, { params }: Ctx) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')

  const b = await req.json().catch(() => ({}))
  const method = b?.method ? String(b.method) : 'cash'
  if (!(HR_PAY_METHODS as readonly string[]).includes(method)) return bad('طريقة الدفع غير صالحة')
  if (!isDateStr(b?.lastWorkDay)) return bad('تاريخ آخر يوم شغل غير صالح (YYYY-MM-DD)')
  const lastWorkDay = String(b.lastWorkDay)
  const note = b?.note ? String(b.note).slice(0, 200) : null

  const emp = await db.employee.findUnique({ where: { id } })
  if (!emp || emp.tenantId !== session.tenantId) return bad('الموظف غير موجود', 404)
  if (!emp.active) return bad('الموظف موقوف بالفعل', 409)

  const tz = await getTenantTimezone(session.tenantId)
  const today = dateStrInTz(new Date(), tz)
  if (lastWorkDay > today) return bad('آخر يوم شغل ممكن يكون النهارده كأقصى حد')

  let preview: Awaited<ReturnType<typeof computeSettlement>>
  try {
    preview = await computeSettlement(session.tenantId, emp, lastWorkDay, today)
  } catch (e: any) {
    if (e?.message === 'BAD_DATE_BEFORE_HIRE') return bad('آخر يوم شغل قبل تاريخ التعيين')
    throw e
  }
  const { net, advanceDeduction, months } = preview
  const label = `تصفية حساب ${emp.name} — لحد ${lastWorkDay}${note ? ` (${note})` : ''}`

  const result = await db.$transaction(async (tx) => {
    // قفل ذرّي ضد الضغط المزدوج: الموظف بيتقفل قبل أي حركة مالية
    const claimed = await tx.employee.updateMany({
      where: { id: emp.id, active: true },
      data: { active: false },
    })
    if (claimed.count === 0) return null

    // مصروف «مرتبات» = الصافي + اللي اتخصم من السلف (تكلفة الراتب الفعلية)
    if (net + advanceDeduction > 0) {
      await tx.expense.create({
        data: {
          tenantId: session.tenantId,
          branchId: emp.branchId ?? null,
          category: HR_EXPENSE_CATEGORY,
          amount: round2(net + advanceDeduction),
          note: label,
          userId: session.userId,
          source: 'payroll',
        },
      })
    }
    // حركة خزنة صادرة = الصافي فقط
    if (net > 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'payroll',
          refId: emp.id,
          amount: -net,
          method,
          note: label,
          userId: session.userId,
        },
      })
    }

    // خصم كل المتبقي من السلف المفتوحة (الأقدم أولًا) — بقدر الخصم بس
    let left = advanceDeduction
    if (left > 0) {
      const open = await tx.employeeAdvance.findMany({
        where: { tenantId: session.tenantId, employeeId: emp.id, status: 'open', remaining: { gt: 0 } },
        orderBy: { id: 'asc' },
      })
      for (const a of open) {
        if (left <= 0.005) break
        const take = round2(Math.min(left, a.remaining))
        const remaining = round2(a.remaining - take)
        await tx.employeeAdvance.update({
          where: { id: a.id },
          data: { remaining, status: remaining <= 0.005 ? 'settled' : 'open' },
        })
        left = round2(left - take)
      }
    }

    // شيل قسائم الموظف من المسودات (روابطه اتصرفت هنا) واظبط إجمالي كل مسودة
    for (const runId of preview.draftRunIds) {
      const deleted = await tx.payslip.deleteMany({ where: { runId, employeeId: emp.id } })
      if (deleted.count > 0) {
        const rest = await tx.payslip.findMany({ where: { runId }, select: { net: true } })
        await tx.payrollRun.update({
          where: { id: runId },
          data: { totalNet: round2(rest.reduce((s, p) => s + p.net, 0)) },
        })
      }
    }

    return { net, advanceDeduction, settledAdvanceLeft: round2(preview.advanceRemaining - advanceDeduction) }
  }, { timeout: 30_000, maxWait: 10_000 })

  if (!result) return bad('الموظف موقوف بالفعل', 409)
  await purgeEdgeCache([PURGE_KEYS.expensesDefault], session.tenantId, '1').catch(() => {})
  await logAudit(
    {
      action: 'hr.employee.settle',
      targetType: 'employee',
      targetId: emp.id,
      details: {
        lastWorkDay, net: result.net, advanceDeduction: result.advanceDeduction, method,
        months: months.map((m) => m.month), settledAdvanceLeft: result.settledAdvanceLeft,
      },
    },
    req,
  )
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => hrSafe(() => __POST(...args))))
}
