import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { withSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { isMonthStr, shiftMonth } from '@/lib/seller-commissions'

export const dynamic = 'force-dynamic'

/**
 * 🪪 (التحديث الرابع عشر) «ملفي» — GET /api/me/profile?month=YYYY-MM
 *
 * الصفحة الشخصية للموظف — بتجمّع من **سجلاته هو بس** (السيشن هي الهوية —
 * مفيش userId من الطلب خالص):
 *   - بياناته كموظف (الاسم، الوظيفة، تاريخ التعيين، الأسبوعي) — عبر
 *     الربط الاختياري Employee.userId.
 *   - «النهاردة»: حالة الحضور (دخول/انصراف/تأخير) + للبائع فواتير يومه.
 *   - «حضوري»: سجلات شهر كامل يوم بيوم + ملخص.
 *   - «رواتبي»: قسائم الرواتب — **بعد اعتماد الصرف بس** (run.status='paid')
 *     — المسودة قبل الموافقة أوراق داخلية للمالك.
 *   - «سلفي» + «إجازاتي» + «تقييماتي».
 *
 * 🛡️ الأمان: أي مستخدم بيرجّع أرقامه هو بس؛ الحساب غير المربوط
 * بسجل موظف بيرجّع linked=false والواجهة تعرض رسالة إرشادية.
 * العمولة مش هنا — كارت «عمولتي» بيجيبها من /api/commissions/my بنفسه.
 */

/** تنسيق وقت (UTC) بساعة المحل — HH:mm بصيغة 24. */
function timeInTz(d: Date | null, timeZone: string): string | null {
  if (!d) return null
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return null
  }
}

/** تنسيق تاريخ كامل بساعة المحل — YYYY-MM-DD (لعرض تواريخ الصرف/السلف). */
function dateInTz(d: Date | null, timeZone: string): string | null {
  if (!d) return null
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d)
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { searchParams } = new URL(req.url)
  return withSql(async (sql) => {
    const tz = await getTenantTimezone(session.tenantId)
    const today = dateStrInTz(new Date(), tz)
    const currentMonth = today.slice(0, 7)
    const monthParam = searchParams.get('month')
    const month = isMonthStr(monthParam) && monthParam <= currentMonth ? monthParam : currentMonth

    // ─── 1) ربط الحساب بسجل الموظف ───
    const employeeRows = await sql<{
      id: number; name: string; jobTitle: string | null; baseSalary: number
      hireDate: Date; weeklyOffDay: number; active: boolean
    }[]>`
      SELECT "id", "name", "jobTitle", "baseSalary", "hireDate", "weeklyOffDay", "active"
      FROM "Employee"
      WHERE "tenantId" = ${session.tenantId} AND "userId" = ${session.userId}
      ORDER BY "active" DESC, "id" DESC
      LIMIT 1`

    const emp = employeeRows[0]
    if (!emp) {
      return NextResponse.json(
        { linked: false as const, month, currentMonth, prevMonth: shiftMonth(month, -1), today },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    // ─── 2) هل الحساب بائع والميزة مفعّلة؟ (لسطر «النهاردة») ───
    const [userFlagRows, tenantFlagRows] = await Promise.all([
      sql<{ isSeller: boolean }[]>`
        SELECT "isSeller" FROM "User" WHERE "id" = ${session.userId} AND "tenantId" = ${session.tenantId} LIMIT 1`,
      sql<{ sellerCommissionsEnabled: boolean }[]>`
        SELECT "sellerCommissionsEnabled" FROM "Tenant" WHERE "id" = ${session.tenantId} LIMIT 1`,
    ])
    const sellerTodayEnabled =
      userFlagRows[0]?.isSeller === true && tenantFlagRows[0]?.sellerCommissionsEnabled === true

    // ─── 3) كل الاستعلامات بالتوازي ───
    const monthStart = `${month}-01`
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
      .toISOString().slice(8, 10)
    const monthEnd = `${month}-${lastDay}`
    const todayBounds = {
      gte: localDateStrToUtcBounds(today, 'start' as const, tz),
      lte: localDateStrToUtcBounds(today, 'end' as const, tz),
    }

    const [todayAttRows, monthRows, payslipRows, advanceRows, leaveRows, evalRows, sellerTodayRows] =
      await Promise.all([
        sql<{ status: string; checkIn: Date | null; checkOut: Date | null; lateMinutes: number; note: string | null }[]>`
          SELECT "status", "checkIn", "checkOut", "lateMinutes", "note"
          FROM "AttendanceRecord"
          WHERE "employeeId" = ${emp.id} AND "date" = ${today}
          LIMIT 1`,
        sql<{ date: string; status: string; checkIn: Date | null; checkOut: Date | null; lateMinutes: number; note: string | null }[]>`
          SELECT "date", "status", "checkIn", "checkOut", "lateMinutes", "note"
          FROM "AttendanceRecord"
          WHERE "employeeId" = ${emp.id} AND "date" >= ${monthStart} AND "date" <= ${monthEnd}
          ORDER BY "date"`,
        // 🛡️ قسائم بعد الاعتماد بس — المسودة للمالك لوحده
        sql<{
          month: string; net: number; payableBase: number; absentDays: number; absenceDeduction: number
          lateMinutes: number; lateDeduction: number; bonus: number; penalty: number
          advanceDeduction: number; commission: number; note: string | null
          method: string | null; paidAt: Date | null
        }[]>`
          SELECT r."month", p."net", p."payableBase", p."absentDays", p."absenceDeduction",
                 p."lateMinutes", p."lateDeduction", p."bonus", p."penalty",
                 p."advanceDeduction", p."commission", p."note",
                 r."method", r."paidAt"
          FROM "Payslip" p
          JOIN "PayrollRun" r ON r."id" = p."runId"
          WHERE p."employeeId" = ${emp.id} AND r."status" = 'paid'
          ORDER BY r."month" DESC
          LIMIT 12`,
        sql<{ id: number; amount: number; installment: number; remaining: number; status: string; method: string; note: string | null; createdAt: Date }[]>`
          SELECT "id", "amount", "installment", "remaining", "status", "method", "note", "createdAt"
          FROM "EmployeeAdvance"
          WHERE "employeeId" = ${emp.id}
          ORDER BY CASE WHEN "status" = 'open' THEN 0 ELSE 1 END, "createdAt" DESC
          LIMIT 20`,
        sql<{ id: number; type: string; startDate: string; endDate: string; days: number; hours: number | null; note: string | null }[]>`
          SELECT "id", "type", "startDate", "endDate", "days", "hours", "note"
          FROM "LeaveRequest"
          WHERE "employeeId" = ${emp.id}
          ORDER BY "startDate" DESC
          LIMIT 12`,
        sql<{ month: string; overall: number; attendanceScore: number; perfScore: number; customerScore: number; teamScore: number; bonus: number }[]>`
          SELECT "month", "overall", "attendanceScore", "perfScore", "customerScore", "teamScore", "bonus"
          FROM "EmployeeEvaluation"
          WHERE "employeeId" = ${emp.id}
          ORDER BY "month" DESC
          LIMIT 3`,
        sellerTodayEnabled
          ? (async () => {
              const [salesRow, retRow] = await Promise.all([
                sql<{ invoices: number; sales: number }[]>`
                  SELECT COUNT(*)::int AS invoices, COALESCE(SUM("total"), 0) AS sales
                  FROM "Sale"
                  WHERE "tenantId" = ${session.tenantId} AND "sellerId" = ${session.userId}
                    AND "createdAt" >= ${todayBounds.gte} AND "createdAt" <= ${todayBounds.lte}`,
                sql<{ rets: number; ret: number }[]>`
                  SELECT COUNT(*)::int AS rets, COALESCE(SUM(r."total"), 0) AS ret
                  FROM "SaleReturn" r
                  JOIN "Sale" s ON s."id" = r."saleId"
                  WHERE r."tenantId" = ${session.tenantId} AND s."sellerId" = ${session.userId}
                    AND r."createdAt" >= ${todayBounds.gte} AND r."createdAt" <= ${todayBounds.lte}`,
              ])
              return {
                invoices: Number(salesRow[0]?.invoices) || 0,
                sales: Number(salesRow[0]?.sales) || 0,
                returns: Number(retRow[0]?.ret) || 0,
              }
            })()
          : Promise.resolve(null),
      ])

    // ─── 4) ملخص الحضور الشهري ───
    let present = 0, late = 0, absent = 0, leave = 0, lateMinutesTotal = 0
    for (const r of monthRows) {
      if (r.status === 'present') present += 1
      else if (r.status === 'late') { late += 1; lateMinutesTotal += Number(r.lateMinutes) || 0 }
      else if (r.status === 'absent') absent += 1
      else if (r.status === 'leave') leave += 1
    }

    const a = todayAttRows[0] ?? null
    return NextResponse.json(
      {
        linked: true as const,
        month, currentMonth, prevMonth: shiftMonth(month, -1), nextMonth: shiftMonth(month, 1), today,
        employee: {
          name: emp.name,
          jobTitle: emp.jobTitle,
          baseSalary: Number(emp.baseSalary) || 0,
          hireDate: dateInTz(emp.hireDate, tz),
          weeklyOffDay: emp.weeklyOffDay,
          active: emp.active,
        },
        todayData: {
          attendance: a
            ? {
                status: a.status,
                checkIn: timeInTz(a.checkIn, tz),
                checkOut: timeInTz(a.checkOut, tz),
                lateMinutes: Number(a.lateMinutes) || 0,
                note: a.note,
              }
            : null,
          // للبائع بس (والميزة مفعّلة) — غير كده null
          sales: sellerTodayRows,
        },
        attendanceMonth: {
          month,
          summary: { present, late, absent, leave, lateMinutesTotal },
          records: monthRows.map((r) => ({
            date: r.date,
            status: r.status,
            checkIn: timeInTz(r.checkIn, tz),
            checkOut: timeInTz(r.checkOut, tz),
            lateMinutes: Number(r.lateMinutes) || 0,
            note: r.note,
          })),
        },
        payslips: payslipRows.map((p) => ({
          month: p.month,
          net: Number(p.net) || 0,
          payableBase: Number(p.payableBase) || 0,
          absentDays: Number(p.absentDays) || 0,
          absenceDeduction: Number(p.absenceDeduction) || 0,
          lateMinutes: Number(p.lateMinutes) || 0,
          lateDeduction: Number(p.lateDeduction) || 0,
          bonus: Number(p.bonus) || 0,
          penalty: Number(p.penalty) || 0,
          advanceDeduction: Number(p.advanceDeduction) || 0,
          commission: Number(p.commission) || 0,
          note: p.note,
          method: p.method,
          paidAt: dateInTz(p.paidAt, tz),
        })),
        advances: advanceRows.map((v) => ({
          id: v.id,
          amount: Number(v.amount) || 0,
          installment: Number(v.installment) || 0,
          remaining: Number(v.remaining) || 0,
          status: v.status,
          method: v.method,
          note: v.note,
          createdAt: dateInTz(v.createdAt, tz),
        })),
        leaves: leaveRows,
        evaluations: evalRows.map((ev) => ({
          month: ev.month,
          overall: Number(ev.overall) || 0,
          attendanceScore: Number(ev.attendanceScore) || 0,
          perfScore: Number(ev.perfScore) || 0,
          customerScore: Number(ev.customerScore) || 0,
          teamScore: Number(ev.teamScore) || 0,
          bonus: Number(ev.bonus) || 0,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })
}
