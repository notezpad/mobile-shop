import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { getSql } from '@/lib/sql'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { isMonthStr, round2 } from '@/lib/hr'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST { month } — يضيف حوافز التقييمات (اللي لسه ماتطبقتش) لقسايم مسودة مرتبات الشهر.
 * بيزوّد حافز القسيمة (مش بيستبدله) ويعيد حساب الصافي بنفس قاعدة تعديل المرتبات.
 */
async function __POST(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  if (!isMonthStr(b?.month)) return bad('الشهر غير صالح')
  const month: string = b.month
  const sql = getSql()

  const run = (await sql<{ id: number; status: string }[]>`
    SELECT "id", "status" FROM "PayrollRun" WHERE "tenantId" = ${session.tenantId} AND "month" = ${month}`)[0]
  if (!run) return bad('أنشئ مسودة مرتبات الشهر ده الأول من صفحة المرتبات', 409)
  if (run.status !== 'draft') return bad('مرتبات الشهر ده اتصرفت بالفعل', 409)

  const applied = await sql.begin(async (tx) => {
    const evals = await tx<{ id: number; employeeId: number; bonus: number }[]>`
      SELECT "id", "employeeId", "bonus" FROM "EmployeeEvaluation"
      WHERE "tenantId" = ${session.tenantId} AND "month" = ${month} AND "bonus" > 0 AND "bonusApplied" = false
      FOR UPDATE`
    let n = 0
    for (const ev of evals) {
      const p = (await tx<any[]>`
        SELECT "id","payableBase","absenceDeduction","lateDeduction","bonus","penalty","advanceDeduction"
        FROM "Payslip" WHERE "runId" = ${run.id} AND "employeeId" = ${ev.employeeId} FOR UPDATE`)[0]
      if (!p) continue // موظف مالوش قسيمة في الدورة دي
      const bonus = round2(p.bonus + ev.bonus)
      const gross = Math.max(0, round2(p.payableBase - p.absenceDeduction - p.lateDeduction + bonus - p.penalty))
      const adv = round2(Math.min(gross, p.advanceDeduction))
      const net = round2(gross - adv)
      await tx`UPDATE "Payslip" SET "bonus" = ${bonus}, "advanceDeduction" = ${adv}, "net" = ${net} WHERE "id" = ${p.id}`
      await tx`UPDATE "EmployeeEvaluation" SET "bonusApplied" = true WHERE "id" = ${ev.id}`
      n++
    }
    await tx`
      UPDATE "PayrollRun" SET "totalNet" = COALESCE((SELECT SUM("net") FROM "Payslip" WHERE "runId" = ${run.id}), 0)
      WHERE "id" = ${run.id}`
    return n
  })
  await logAudit({ action: 'hr.evaluation.apply_bonus', targetType: 'payroll', targetId: run.id, details: { month, applied } }, req)
  return NextResponse.json({ ok: true, applied })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => hrSafe(() => __POST(...args))))
}
