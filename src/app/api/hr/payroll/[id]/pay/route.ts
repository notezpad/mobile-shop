import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { hrGuard, bad } from '@/lib/hr-route'
import { HR_EXPENSE_CATEGORY, HR_PAY_METHODS, round2 } from '@/lib/hr'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST { method } — اعتماد وصرف الرواتب (عملية واحدة ذرّية):
 *   • مصروف "مرتبات" لكل موظف = الصافي + قسط السلفة (تكلفة الراتب الفعلية).
 *   • حركة خزنة صادرة = الصافي فقط (قسط السلفة اتصرف قبل كده كـ«سلفة»).
 *   • خصم الأقساط من السلف المفتوحة (الأقدم أولًا) وإقفال اللي خلصت.
 *   • الدورة تتقفل — مفيش صرف تاني.
 */
async function __POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')
  const b = await req.json().catch(() => ({}))
  const method = b?.method ? String(b.method) : 'cash'
  if (!(HR_PAY_METHODS as readonly string[]).includes(method)) return bad('طريقة الدفع غير صالحة')

  const run = await db.payrollRun.findUnique({ where: { id }, include: { payslips: true } })
  if (!run || run.tenantId !== session.tenantId) return bad('الدورة غير موجودة', 404)
  if (run.status !== 'draft') return bad('الرواتب دي اتصرفت بالفعل', 409)
  if (run.payslips.length === 0) return bad('لا توجد قسائم للصرف')

  const empIds = run.payslips.map((p) => p.employeeId)
  const emps = await db.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, branchId: true } })
  const branchOf = new Map(emps.map((e) => [e.id, e.branchId]))

  const result = await db.$transaction(async (tx) => {
    // قفل ذرّي ضد الضغط المزدوج
    const claimed = await tx.payrollRun.updateMany({
      where: { id: run.id, status: 'draft' },
      data: { status: 'paid', method, paidAt: new Date() },
    })
    if (claimed.count === 0) return null

    const label = run.month
    const withCost = run.payslips.filter((p) => p.net + p.advanceDeduction > 0)
    if (withCost.length > 0) {
      await tx.expense.createMany({
        data: withCost.map((p) => ({
          tenantId: session.tenantId,
          branchId: branchOf.get(p.employeeId) ?? null,
          category: HR_EXPENSE_CATEGORY,
          amount: round2(p.net + p.advanceDeduction),
          note: `راتب ${p.employeeName} — ${label}`,
          userId: session.userId,
          source: 'payroll',
        })),
      })
    }
    const paying = run.payslips.filter((p) => p.net > 0)
    if (paying.length > 0) {
      await tx.cashEntry.createMany({
        data: paying.map((p) => ({
          tenantId: session.tenantId,
          source: 'payroll',
          refId: p.id,
          amount: -p.net,
          method,
          note: `راتب ${p.employeeName} — ${label}`,
          userId: session.userId,
        })),
      })
    }

    // خصم أقساط السلف (الأقدم أولًا) بقدر خصم كل قسيمة
    for (const p of run.payslips) {
      let left = p.advanceDeduction
      if (left <= 0) continue
      const open = await tx.employeeAdvance.findMany({
        where: { tenantId: session.tenantId, employeeId: p.employeeId, status: 'open', remaining: { gt: 0 } },
        orderBy: { id: 'asc' },
      })
      for (const a of open) {
        if (left <= 0.005) break
        const take = round2(Math.min(left, a.remaining, a.installment > 0 ? a.installment : a.remaining))
        const remaining = round2(a.remaining - take)
        await tx.employeeAdvance.update({
          where: { id: a.id },
          data: { remaining, status: remaining <= 0.005 ? 'settled' : 'open' },
        })
        left = round2(left - take)
      }
    }
    return { count: run.payslips.length }
  }, { timeout: 30_000, maxWait: 10_000 })

  if (!result) return bad('الرواتب دي اتصرفت بالفعل', 409)
  await purgeEdgeCache([PURGE_KEYS.expensesDefault], session.tenantId, '1').catch(() => {})
  await logAudit(
    { action: 'hr.payroll.pay', targetType: 'payroll', targetId: run.id, details: { month: run.month, totalNet: run.totalNet, method } },
    req,
  )
  return NextResponse.json({ ok: true, count: result.count })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __POST(...args)))
}
