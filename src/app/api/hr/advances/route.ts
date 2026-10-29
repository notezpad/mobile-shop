import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { hrGuard, bad } from '@/lib/hr-route'
import { HR_PAY_METHODS, round2 } from '@/lib/hr'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function __GET(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const status = new URL(req.url).searchParams.get('status')
  const rows = await db.employeeAdvance.findMany({
    where: { tenantId: session.tenantId, ...(status === 'open' ? { status: 'open' } : {}) },
    orderBy: { id: 'desc' },
    take: 300,
    include: { employee: { select: { name: true } } },
  })
  const items = rows.map(({ employee, ...a }) => ({ ...a, employeeName: employee.name }))
  const totalRemaining = items.filter((a) => a.status === 'open').reduce((s, a) => s + a.remaining, 0)
  return NextResponse.json({ items, totalRemaining })
}

/** POST { employeeId, amount, months?, installment?, method?, note? } — صرف سلفة من الخزنة */
async function __POST(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return bad('بيانات غير صالحة')

  const employeeId = Number(b.employeeId)
  const amount = round2(Number(b.amount))
  if (!Number.isFinite(employeeId)) return bad('اختر الموظف')
  if (!Number.isFinite(amount) || amount <= 0) return bad('مبلغ السلفة يجب أن يكون أكبر من صفر')

  let installment = Number(b.installment)
  if (!Number.isFinite(installment) || installment <= 0) {
    const months = Math.floor(Number(b.months) || 1)
    if (!(months >= 1 && months <= 60)) return bad('عدد الشهور غير صالح')
    installment = amount / months
  }
  installment = round2(Math.min(installment, amount))
  const method = b.method ? String(b.method) : 'cash'
  if (!(HR_PAY_METHODS as readonly string[]).includes(method)) return bad('طريقة الدفع غير صالحة')
  const note = b.note ? String(b.note).trim().slice(0, 200) || null : null

  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { tenantId: true, name: true, active: true } })
  if (!emp || emp.tenantId !== session.tenantId) return bad('الموظف غير موجود', 404)
  if (!emp.active) return bad('الموظف موقوف')

  const adv = await db.$transaction(async (tx) => {
    const a = await tx.employeeAdvance.create({
      data: { tenantId: session.tenantId, employeeId, amount, installment, remaining: amount, method, note, createdBy: session.userId },
    })
    // الفلوس خرجت من الدرج (مش مصروف — دين على الموظف يتسدد من الراتب)
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId, source: 'advance', refId: a.id, amount: -amount, method,
        note: `سلفة للموظف ${emp.name}${note ? ' - ' + note : ''}`, userId: session.userId,
      },
    })
    return a
  })
  await logAudit({ action: 'hr.advance.create', targetType: 'employee', targetId: employeeId, details: { amount, installment } }, req)
  return NextResponse.json({ ok: true, id: adv.id }, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __POST(...args)))
}
