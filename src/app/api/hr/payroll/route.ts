import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad } from '@/lib/hr-route'
import { isMonthStr } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { generatePayrollDraft } from '@/lib/hr-payroll'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function __GET() {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const tz = await getTenantTimezone(session.tenantId)
  const runs = await db.payrollRun.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { month: 'desc' },
    take: 24,
    select: { id: true, month: true, status: true, totalNet: true, paidAt: true, _count: { select: { payslips: true } } },
  })
  return NextResponse.json({
    currentMonth: dateStrInTz(new Date(), tz).slice(0, 7),
    items: runs.map(({ _count, ...r }) => ({ ...r, count: _count.payslips })),
  })
}

/** POST { month } → ينشئ مسودة الشهر أو يعيد حسابها (بتحافظ على الحافز/الجزاء المعدّلين) */
async function __POST(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  if (!isMonthStr(b?.month)) return bad('الشهر غير صالح (YYYY-MM)')
  const tz = await getTenantTimezone(session.tenantId)
  if (b.month > dateStrInTz(new Date(), tz).slice(0, 7)) return bad('لا يمكن تجهيز راتب شهر لم يبدأ بعد')
  try {
    const run = await generatePayrollDraft(session.tenantId, b.month, session.userId)
    await logAudit({ action: 'hr.payroll.draft', targetType: 'payroll', targetId: run.id, details: { month: b.month } }, req)
    return NextResponse.json({ ok: true, id: run.id })
  } catch (e) {
    if (e instanceof Error && e.message === 'PAID') return bad('رواتب الشهر ده اتصرفت بالفعل', 409)
    throw e
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
