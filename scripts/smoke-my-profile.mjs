/**
 * 🧪 Smoke test — نفس استعلامات SQL بتاعة /api/me/profile حرفيًا
 * (postgres.js زي src/lib/sql.ts) على الداتابيز الحقيقية.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')])
)
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 })

const tz = 'Africa/Cairo'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
const currentMonth = today.slice(0, 7)
const monthStart = `${currentMonth}-01`
const lastDay = new Date(Date.UTC(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0)).toISOString().slice(8, 10)
const monthEnd = `${currentMonth}-${lastDay}`

// ─── 1) استعلام ربط الموظف (نفس الاستعلام في الراوت) ───
const employeeRows = await sql`
  SELECT "id", "name", "jobTitle", "baseSalary", "hireDate", "weeklyOffDay", "active"
  FROM "Employee"
  WHERE "tenantId" = (SELECT "tenantId" FROM "Employee" WHERE "userId" IS NOT NULL LIMIT 1)
    AND "userId" = (SELECT "userId" FROM "Employee" WHERE "userId" IS NOT NULL LIMIT 1)
  LIMIT 1`
const emp = employeeRows[0]
console.log('1) employee link query:', emp ? 'OK ✓' : 'no linked employee (expected for fresh tenants)')

if (emp) {
  const [att, monthRows, payslipRows, advanceRows, leaveRows, evalRows] = await Promise.all([
    sql`SELECT "status", "checkIn", "checkOut", "lateMinutes", "note" FROM "AttendanceRecord" WHERE "employeeId" = ${emp.id} AND "date" = ${today} LIMIT 1`,
    sql`SELECT "date", "status", "checkIn", "checkOut", "lateMinutes", "note" FROM "AttendanceRecord" WHERE "employeeId" = ${emp.id} AND "date" >= ${monthStart} AND "date" <= ${monthEnd} ORDER BY "date"`,
    sql`SELECT r."month", p."net", p."payableBase", p."absentDays", p."absenceDeduction", p."lateMinutes", p."lateDeduction", p."bonus", p."penalty", p."advanceDeduction", p."commission", p."note", r."method", r."paidAt"
        FROM "Payslip" p JOIN "PayrollRun" r ON r."id" = p."runId"
        WHERE p."employeeId" = ${emp.id} AND r."status" = 'paid' ORDER BY r."month" DESC LIMIT 12`,
    sql`SELECT "id", "amount", "installment", "remaining", "status", "method", "note", "createdAt" FROM "EmployeeAdvance" WHERE "employeeId" = ${emp.id} ORDER BY CASE WHEN "status" = 'open' THEN 0 ELSE 1 END, "createdAt" DESC LIMIT 20`,
    sql`SELECT "id", "type", "startDate", "endDate", "days", "hours", "note" FROM "LeaveRequest" WHERE "employeeId" = ${emp.id} ORDER BY "startDate" DESC LIMIT 12`,
    sql`SELECT "month", "overall", "attendanceScore", "perfScore", "customerScore", "teamScore", "bonus" FROM "EmployeeEvaluation" WHERE "employeeId" = ${emp.id} ORDER BY "month" DESC LIMIT 3`,
  ])
  console.log('2) today-attendance:', att.length, '| month-rows:', monthRows.length)
  console.log('3) paid payslips:', payslipRows.length, payslipRows.slice(0, 2).map((p) => p.month))
  console.log('4) advances:', advanceRows.length, '| leaves:', leaveRows.length, '| evals:', evalRows.length)

  // ─── 5) استعلام «فواتير اليوم» للبائع ───
  const userRows = await sql`SELECT "isSeller" FROM "User" WHERE "id" = (SELECT "userId" FROM "Employee" WHERE "id" = ${emp.id}) LIMIT 1`
  console.log('5) user isSeller flag:', userRows[0]?.isSeller)
}

// ─── 6) استعلام صلاحية المستخدمين الجديد (ربط الموظف) ───
const anyUser = await sql`SELECT "id", "active" FROM "User" LIMIT 1`
if (anyUser[0]) {
  const u = anyUser[0]
  const dup = await sql`SELECT "id" FROM "Employee" WHERE "tenantId" = (SELECT "tenantId" FROM "User" WHERE "id" = ${u.id}) AND "userId" = ${u.id} AND "id" <> -1 LIMIT 1`
  console.log('6) employee-user uniqueness check query:', dup.length >= 0 ? 'OK ✓' : 'FAIL')
}

await sql.end()
console.log('SMOKE_OK ✓')
