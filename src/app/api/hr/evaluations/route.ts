import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { getSql } from '@/lib/sql'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { isMonthStr, overallScore, round2 } from '@/lib/hr'
import { monthAttendanceStats } from '@/lib/hr-eval'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET ?month=YYYY-MM → لكل موظف نشط: إحصائيات الحضور + التقييم المحفوظ (لو موجود) */
async function __GET(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const tz = await getTenantTimezone(session.tenantId)
  const mParam = new URL(req.url).searchParams.get('month')
  const month = isMonthStr(mParam) ? mParam : dateStrInTz(new Date(), tz).slice(0, 7)
  const sql = getSql()
  const [stats, saved] = await Promise.all([
    monthAttendanceStats(session.tenantId, month),
    sql<any[]>`
      SELECT "employeeId", "perfScore", "customerScore", "teamScore", "attendanceScore", "overall",
             "bonus", "bonusApplied", "note"
      FROM "EmployeeEvaluation" WHERE "tenantId" = ${session.tenantId} AND "month" = ${month}`,
  ])
  const byEmp = new Map(saved.map((s) => [s.employeeId, s]))
  return NextResponse.json({
    month,
    items: stats.map((s) => ({ ...s, evaluation: byEmp.get(s.employeeId) ?? null })),
  })
}

/** POST { employeeId, month, perfScore, customerScore, teamScore, bonus?, note? } — حفظ/تعديل (upsert) */
async function __POST(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  const employeeId = Number(b?.employeeId)
  if (!Number.isInteger(employeeId)) return bad('اختر الموظف')
  if (!isMonthStr(b?.month)) return bad('الشهر غير صالح')
  const tz = await getTenantTimezone(session.tenantId)
  if (b.month > dateStrInTz(new Date(), tz).slice(0, 7)) return bad('مينفعش تقييم شهر لسه ماجاش')
  const sc = [b.perfScore, b.customerScore, b.teamScore].map(Number)
  if (sc.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) return bad('كل التقييمات من 1 إلى 5')
  const bonus = round2(Math.max(0, Number(b.bonus) || 0))
  if (bonus > 1_000_000) return bad('قيمة الحافز غير منطقية')
  const note = b.note ? String(b.note).trim().slice(0, 300) || null : null

  const stat = (await monthAttendanceStats(session.tenantId, b.month)).find((s) => s.employeeId === employeeId)
  if (!stat) return bad('الموظف غير موجود أو لسه ما اتعيّنش في الشهر ده', 404)
  const overall = overallScore(stat.attendanceScore, sc[0], sc[1], sc[2])

  const sql = getSql()
  const prev = (await sql<{ bonus: number; bonusApplied: boolean }[]>`
    SELECT "bonus", "bonusApplied" FROM "EmployeeEvaluation"
    WHERE "employeeId" = ${employeeId} AND "month" = ${b.month} AND "tenantId" = ${session.tenantId}`)[0]
  if (prev?.bonusApplied && prev.bonus !== bonus) return bad('الحافز اتضاف للمرتبات بالفعل — عدّله من صفحة المرتبات', 409)

  await sql`
    INSERT INTO "EmployeeEvaluation"
      ("tenantId","employeeId","month","attendanceScore","perfScore","customerScore","teamScore","overall","bonus","note","createdBy","updatedAt")
    VALUES (${session.tenantId}, ${employeeId}, ${b.month}, ${stat.attendanceScore}, ${sc[0]}, ${sc[1]}, ${sc[2]}, ${overall}, ${bonus}, ${note}, ${session.userId}, now())
    ON CONFLICT ("employeeId","month") DO UPDATE SET
      "attendanceScore" = EXCLUDED."attendanceScore", "perfScore" = EXCLUDED."perfScore",
      "customerScore" = EXCLUDED."customerScore", "teamScore" = EXCLUDED."teamScore",
      "overall" = EXCLUDED."overall", "bonus" = EXCLUDED."bonus", "note" = EXCLUDED."note", "updatedAt" = now()`
  await logAudit({ action: 'hr.evaluation.save', targetType: 'employee', targetId: employeeId, details: { month: b.month, overall } }, req)
  return NextResponse.json({ ok: true, attendanceScore: stat.attendanceScore, overall })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function POST(req: NextRequest) {
  return withIdempotency(req, () => withDb(() => hrSafe(() => __POST(req))))
}
