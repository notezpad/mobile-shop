import { NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireMyProfileAccess, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'
import { normalizeShifts } from '@/lib/branch-shifts'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

/**
 * 👤 2026-11-01 (التحديث السابع عشر + الثامن عشر) — «ملفي»: بيانات الموظف لنفسه.
 *
 * الفجوة: الموظف ماعندوش صفحة يشمّ فيها نفسه — بياناته وصلاحياته عند
 * المدير بس، ومفيش مكان يقول له «اشتغلت النهاردة كام فاتورة بكام».
 *
 * المبدأ الثابت زي كل شاشات «my»: **السيشن هو مصدر الهوية** — مفيش
 * userId من الطلب خالص، أي موظف بيشوف بيانات نفسه بس ومفيش أي بيانات
 * لزميل تاني ولا أي أرباح/تكاليف (أرقام مبيعاته هو بس — نفس انضباط
 * عمولتي وجرد الدرج الأعمي).
 *
 * GET → {
 *   me:            { name, email, role, branchName, createdAt, lastLoginAt,
 *                    isSeller, canViewProfits },
 *   permissions:   { unrestricted: boolean, list: string[] },
 *   today:         { date, invoices, netTotal, refunded }   — مبيعاته هو بس,
 *   openShift:     { shiftName, userName, createdAt, mine } | null — وردية فرعه,
 *   hr:            بياناته الوظيفية (لو حسابه مربوط بموظف في الموارد البشرية):
 *                  { jobTitle, baseSalary, hireDate, shiftName, myShift
 *                    attendance(الشهر), leaves(الرصيد + آخر 5),
 *                    payslip(آخر قسيمة معتمدة) }
 *                  — القسيمة المعتمدة بس (المسودة أرقامها مش نهائية)
 *                  myShift = 🕐 ورديته المحددة بأوقاتها من ورديات الفرع
 *                  (null لو الاسم مش موجود في تعريفات الفرع حالياً)
 * }
 * عمولته لو بائع بيجيها الواجهة من /api/commissions/my (موجود بالفعل).
 */

interface MeRow {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  permissions: string | null
  canViewProfits: boolean
  isSeller: boolean
  branchId: number | null
  branchName: string | null
  createdAt: Date
  lastLoginAt: Date | null
}

function safeParseArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    requireMyProfileAccess(session)
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  return withSql(async (sql: Sql) => {
    const tid = session.tenantId

    // 👤 بياناتي أنا بس — بالاسم الفعلي من الداتابيز (مش الـ JWT القديم)
    const meRows = await sql<MeRow[]>`
      SELECT u."id", u."name", u."email", u."role", u."active", u."permissions",
             u."canViewProfits", u."isSeller", u."branchId",
             b."name" AS "branchName", u."createdAt", u."lastLoginAt"
      FROM "User" u
      LEFT JOIN "Branch" b ON b."id" = u."branchId"
      WHERE u."id" = ${session.userId} AND u."tenantId" = ${tid}
      LIMIT 1`
    const me = meRows[0] ?? null
    if (!me) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    }

    const tz = await getTenantTimezone(tid)
    const today = dateStrInTz(new Date(), tz)

    // 📅 «النهاردة» — فواتير اليوم المسجّلة باسمي أنا (بس) بتوقيت المحل.
    //    الفواتير المرتجعة خالص مستبعدة من العدد، والصافي = إجمالي − مرتجع.
    const todayRows = await sql<{ invoices: number; gross: number | null; refunded: number | null }[]>`
      SELECT COUNT(*)::int AS invoices,
             COALESCE(SUM("total"), 0) AS gross,
             COALESCE(SUM("refunded"), 0) AS refunded
      FROM "Sale"
      WHERE "tenantId" = ${tid}
        AND "userId" = ${session.userId}
        AND ("createdAt" AT TIME ZONE ${tz})::date = ${today}::date
        AND "status" <> 'مرتجعة'`
    const t = todayRows[0] ?? { invoices: 0, gross: 0, refunded: 0 }
    const gross = Math.round((Number(t.gross) || 0) * 100) / 100
    const refunded = Math.round((Number(t.refunded) || 0) * 100) / 100

    // 🔗 الوردية المفتوحة على فرعي (لو عندي فرع) — بدون أي مبالغ:
    //    اسم الوردية ومين فتحها بس (نفس انضباط الشاشات الأخرى)
    let openShift: { shiftName: string; userName: string | null; createdAt: string; mine: boolean } | null = null
    if (me.branchId != null) {
      const openRows = await sql<{ shiftName: string; userName: string | null; userId: string | null; createdAt: Date }[]>`
        SELECT "shiftName", "userName", "userId", "createdAt"
        FROM "ShiftSession"
        WHERE "tenantId" = ${tid}
          AND "closedAt" IS NULL
          AND "branchId" IS NOT DISTINCT FROM ${me.branchId}
        ORDER BY "id" DESC
        LIMIT 1`
      const os = openRows[0]
      if (os) {
        openShift = {
          shiftName: os.shiftName,
          userName: os.userName,
          createdAt: new Date(os.createdAt).toISOString(),
          mine: os.userId === session.userId,
        }
      }
    }

    // 🏢 (التحديث الثامن عشر) «ملفي» في الموارد البشرية — لو حسابي مربوط
    //    بموظف (Employee.userId): بياناتي الوظيفية + حضوري الشهر + إجازاتي
    //    + آخر قسيمة راتب **معتمدة** (مدفوعة بس — المسودة أرقامها مش نهائية).
    //    كل ده بياناتي أنا بس — نفس مبدأ الصفحة كلها.
    let hr: Record<string, unknown> | null = null
    const empRows = await sql<{
      id: number; name: string; jobTitle: string | null; baseSalary: number
      hireDate: Date; weeklyOffDay: number; active: boolean; branchName: string | null
      shiftName: string | null; branchShifts: unknown
    }[]>`
      SELECT e."id", e."name", e."jobTitle", e."baseSalary", e."hireDate",
             e."weeklyOffDay", e."active", b."name" AS "branchName",
             e."shiftName", b."shifts" AS "branchShifts"
      FROM "Employee" e
      LEFT JOIN "Branch" b ON b."id" = e."branchId"
      WHERE e."tenantId" = ${tid} AND e."userId" = ${session.userId}
      ORDER BY e."active" DESC, e."id" DESC
      LIMIT 1`
    const emp = empRows[0]
    if (emp) {
      const month = today.slice(0, 7)
      const year = today.slice(0, 4)

      // 🕐 (التحديث الحادي والعشرين) ورديتي المحددة — الاسم المحفوظ على ملفي
      //    في HR + تعريفه الحالي بأوقاته من ورديات فرعي (لو لسه موجود)
      const definedShifts = normalizeShifts(emp.branchShifts)
      const myShift = emp.shiftName
        ? definedShifts.find((s) => s.name === emp.shiftName) ?? null
        : null

      // 📅 حضوري الشهر (AttendanceRecord.date نص YYYY-MM-DD بتوقيت المحل)
      const attRows = await sql<{ status: string; cnt: number; late: number }[]>`
        SELECT "status", COUNT(*)::int AS cnt, COALESCE(SUM("lateMinutes"), 0) AS late
        FROM "AttendanceRecord"
        WHERE "tenantId" = ${tid} AND "employeeId" = ${emp.id} AND "date" LIKE ${month + '%'}
        GROUP BY "status"`
      const att: Record<string, number> = { present: 0, late: 0, absent: 0, leave: 0 }
      let lateMinutes = 0
      for (const r of attRows) {
        att[r.status] = Number(r.cnt) || 0
        lateMinutes += r.status === 'late' ? Number(r.late) || 0 : 0
      }

      // 🏖️ رصيد الإجازة السنوية + آخر الإجازات
      const settingsRows = await sql<{ annualLeaveDays: number }[]>`
        SELECT "annualLeaveDays" FROM "HrSettings" WHERE "tenantId" = ${tid} LIMIT 1`
      const annualTotal = Number(settingsRows[0]?.annualLeaveDays ?? 21) || 21
      const usedRows = await sql<{ used: number }[]>`
        SELECT COALESCE(SUM("days"), 0) AS used
        FROM "LeaveRequest"
        WHERE "tenantId" = ${tid} AND "employeeId" = ${emp.id}
          AND "type" = 'annual' AND "startDate" LIKE ${year + '%'}`
      const annualUsed = Number(usedRows[0]?.used) || 0
      const leaveRows = await sql<{ type: string; startDate: string; endDate: string; days: number; hours: number | null }[]>`
        SELECT "type", "startDate", "endDate", "days", "hours"
        FROM "LeaveRequest"
        WHERE "tenantId" = ${tid} AND "employeeId" = ${emp.id}
        ORDER BY "startDate" DESC
        LIMIT 5`

      // 💰 آخر قسيمة راتب معتمدة (القسيمة مسودة أرقامها مش نهائية فما بتظهرش)
      const payRows = await sql<{
        month: string; baseSalary: number; payableBase: number; absentDays: number
        absenceDeduction: number; lateMinutes: number; lateDeduction: number
        bonus: number; penalty: number; advanceDeduction: number; commission: number
        net: number; paidAt: Date | null
      }[]>`
        SELECT p."baseSalary", p."payableBase", p."absentDays", p."absenceDeduction",
               p."lateMinutes", p."lateDeduction", p."bonus", p."penalty",
               p."advanceDeduction", p."commission", p."net",
               r."month", r."paidAt"
        FROM "Payslip" p
        JOIN "PayrollRun" r ON r."id" = p."runId"
        WHERE p."tenantId" = ${tid} AND p."employeeId" = ${emp.id} AND r."status" = 'paid'
        ORDER BY r."month" DESC
        LIMIT 1`
      const pay = payRows[0] ?? null

      hr = {
        employeeId: emp.id,
        name: emp.name,
        jobTitle: emp.jobTitle,
        baseSalary: Number(emp.baseSalary) || 0,
        hireDate: new Date(emp.hireDate).toISOString(),
        weeklyOffDay: emp.weeklyOffDay,
        active: emp.active === true,
        branchName: emp.branchName,
        // 🕐 ورديتي المحددة (التحديث الحادي والعشرين)
        shiftName: emp.shiftName,
        myShift,
        attendance: {
          month,
          present: att.present ?? 0,
          late: att.late ?? 0,
          absent: att.absent ?? 0,
          leave: att.leave ?? 0,
          lateMinutes,
        },
        leaves: {
          annualTotal,
          annualUsed,
          annualRemaining: Math.max(0, annualTotal - annualUsed),
          recent: leaveRows.map((l) => ({
            type: l.type,
            startDate: l.startDate,
            endDate: l.endDate,
            days: Number(l.days) || 0,
            hours: l.hours != null ? Number(l.hours) : null,
          })),
        },
        payslip: pay
          ? {
              month: pay.month,
              baseSalary: Number(pay.baseSalary) || 0,
              payableBase: Number(pay.payableBase) || 0,
              absentDays: Number(pay.absentDays) || 0,
              absenceDeduction: Number(pay.absenceDeduction) || 0,
              lateMinutes: Number(pay.lateMinutes) || 0,
              lateDeduction: Number(pay.lateDeduction) || 0,
              bonus: Number(pay.bonus) || 0,
              penalty: Number(pay.penalty) || 0,
              advanceDeduction: Number(pay.advanceDeduction) || 0,
              commission: Number(pay.commission) || 0,
              net: Number(pay.net) || 0,
              paidAt: pay.paidAt ? new Date(pay.paidAt).toISOString() : null,
            }
          : null,
      }
    }

    const permList = safeParseArray(me.permissions)
    return NextResponse.json(
      {
        me: {
          name: me.name,
          email: me.email,
          role: me.role,
          active: me.active === true,
          branchName: me.branchName,
          isSeller: me.isSeller === true,
          canViewProfits: me.canViewProfits === true,
          createdAt: new Date(me.createdAt).toISOString(),
          lastLoginAt: me.lastLoginAt ? new Date(me.lastLoginAt).toISOString() : null,
        },
        permissions: {
          // موظف من غير قائمة = كل الصلاحيات (نفس قاعدة السايدبار بالظبط)
          unrestricted: permList.length === 0,
          list: permList,
        },
        today: {
          date: today,
          invoices: Number(t.invoices) || 0,
          grossTotal: gross,
          refunded,
          netTotal: Math.round((gross - refunded) * 100) / 100,
        },
        openShift,
        hr,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })
}
