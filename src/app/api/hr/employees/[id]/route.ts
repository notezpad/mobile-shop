import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad } from '@/lib/hr-route'
import { hashPin, isDateStr, isValidPin } from '@/lib/hr'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function __PUT(req: NextRequest, { params }: Ctx) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')
  const emp = await db.employee.findUnique({ where: { id } })
  if (!emp || emp.tenantId !== session.tenantId) return bad('الموظف غير موجود', 404)

  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return bad('بيانات غير صالحة')

  const data: Record<string, unknown> = {}
  if (b.name !== undefined) {
    const name = String(b.name).trim()
    if (!name) return bad('اسم الموظف مطلوب')
    data.name = name
  }
  if (b.baseSalary !== undefined) {
    const v = Number(b.baseSalary)
    if (!Number.isFinite(v) || v < 0) return bad('الراتب غير صالح')
    data.baseSalary = v
  }
  if (b.weeklyOffDay !== undefined) {
    const v = Math.floor(Number(b.weeklyOffDay))
    if (!(v >= 0 && v <= 6)) return bad('يوم الإجازة غير صالح')
    data.weeklyOffDay = v
  }
  if (b.hireDate !== undefined) {
    if (!isDateStr(b.hireDate)) return bad('تاريخ التعيين غير صالح')
    data.hireDate = localDateStrToUtcBounds(String(b.hireDate), 'start', await getTenantTimezone(session.tenantId))
  }
  for (const k of ['phone', 'jobTitle', 'notes'] as const) {
    if (b[k] !== undefined) data[k] = b[k] ? String(b[k]).trim() || null : null
  }
  if (b.active !== undefined) data.active = !!b.active
  if (b.pin !== undefined) {
    if (b.pin === '' || b.pin === null) data.pinHash = null
    else if (!isValidPin(b.pin)) return bad('الـ PIN لازم 4 إلى 6 أرقام')
    else data.pinHash = await hashPin(session.tenantId, id, String(b.pin))
  }

  await db.employee.update({ where: { id }, data })
  const { pin: _pin, ...safe } = b
  await logAudit(
    { action: 'hr.employee.update', targetType: 'employee', targetId: id, details: { ...safe, pinChanged: b.pin !== undefined } },
    req,
  )
  return NextResponse.json({ ok: true })
}

/** حذف = إيقاف (الموظف بيفضل في السجلات القديمة للرواتب والحضور). */
async function __DELETE(req: NextRequest, { params }: Ctx) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')
  const emp = await db.employee.findUnique({ where: { id } })
  if (!emp || emp.tenantId !== session.tenantId) return bad('الموظف غير موجود', 404)
  await db.employee.update({ where: { id }, data: { active: false } })
  await logAudit({ action: 'hr.employee.deactivate', targetType: 'employee', targetId: id }, req)
  return NextResponse.json({ ok: true })
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
