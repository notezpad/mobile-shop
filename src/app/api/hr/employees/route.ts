import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { hrGuard, bad } from '@/lib/hr-route'
import { hashPin, isDateStr, isValidPin } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function __GET() {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const tz = await getTenantTimezone(session.tenantId)

  const [rows, advances] = await Promise.all([
    db.employee.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, phone: true, jobTitle: true, baseSalary: true, hireDate: true,
        weeklyOffDay: true, active: true, notes: true, branchId: true, userId: true, pinHash: true,
      },
    }),
    db.employeeAdvance.groupBy({
      by: ['employeeId'],
      where: { tenantId: session.tenantId, status: 'open' },
      _sum: { remaining: true },
    }),
  ])
  const owed = new Map(advances.map((a) => [a.employeeId, a._sum.remaining ?? 0]))
  const items = rows.map(({ pinHash, hireDate, ...r }) => ({
    ...r,
    hireDate: dateStrInTz(hireDate, tz),
    hasPin: !!pinHash,
    advanceRemaining: owed.get(r.id) ?? 0,
  }))
  return NextResponse.json({ items })
}

async function __POST(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return bad('بيانات غير صالحة')

  const name = String(b.name ?? '').trim()
  if (!name) return bad('اسم الموظف مطلوب')
  const baseSalary = Number(b.baseSalary)
  if (!Number.isFinite(baseSalary) || baseSalary < 0) return bad('الراتب غير صالح')
  const weeklyOffDay = b.weeklyOffDay === undefined ? 5 : Math.floor(Number(b.weeklyOffDay))
  if (!(weeklyOffDay >= 0 && weeklyOffDay <= 6)) return bad('يوم الإجازة غير صالح')
  const tz = await getTenantTimezone(session.tenantId)
  let hireDate = new Date()
  if (b.hireDate) {
    if (!isDateStr(b.hireDate)) return bad('تاريخ التعيين غير صالح')
    hireDate = localDateStrToUtcBounds(String(b.hireDate), 'start', tz)
  }
  if (b.pin !== undefined && b.pin !== '' && !isValidPin(b.pin)) return bad('الـ PIN لازم 4 إلى 6 أرقام')
  const branchId = b.branchId ? Number(b.branchId) : session.branchId ?? null

  const emp = await db.employee.create({
    data: {
      tenantId: session.tenantId,
      branchId: Number.isFinite(branchId as number) ? (branchId as number) : null,
      name,
      phone: b.phone ? String(b.phone).trim() || null : null,
      jobTitle: b.jobTitle ? String(b.jobTitle).trim() || null : null,
      baseSalary,
      weeklyOffDay,
      hireDate,
      notes: b.notes ? String(b.notes).trim() || null : null,
    },
  })
  if (b.pin) {
    await db.employee.update({
      where: { id: emp.id },
      data: { pinHash: await hashPin(session.tenantId, emp.id, String(b.pin)) },
    })
  }
  await logAudit({ action: 'hr.employee.create', targetType: 'employee', targetId: emp.id, details: { name, baseSalary } }, req)
  return NextResponse.json({ ok: true, id: emp.id }, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __POST(...args)))
}
