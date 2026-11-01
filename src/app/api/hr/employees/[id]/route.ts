import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { hashPin, isDateStr, isValidPin } from '@/lib/hr'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { normalizeShifts } from '@/lib/branch-shifts'
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
  // 🕐 (التحديث الحادي والعشرين) وردية الموظف — لازم تكون من ورديات فرعه
  // المعرّفة (الاسم نص snapshot زي نمط ShiftSession) — والفاضي = بدون وردية.
  // التحقق على فرع الموظف الحالي (emp.branchId) — تغيير الفرع مش شغل الفورم ده.
  if (b.shiftName !== undefined) {
    const rawShift = b.shiftName ? String(b.shiftName).trim().slice(0, 40) : ''
    if (rawShift) {
      if (emp.branchId == null) {
        return bad('حدد فرع الموظف الأول قبل ما تحدد ورديته — الوردية بتتحدد من ورديات الفرع')
      }
      const br = await db.branch.findFirst({
        where: { id: emp.branchId, tenantId: session.tenantId },
        select: { shifts: true },
      })
      const defined = normalizeShifts(br?.shifts)
      if (!defined.some((s) => s.name === rawShift)) {
        return bad('الوردية دي مش معرّفة على فرع الموظف — عدّل ورديات الفرع الأول من شاشة الفروع')
      }
      data.shiftName = rawShift
    } else {
      data.shiftName = null
    }
  }
  if (b.active !== undefined) data.active = !!b.active
  // 🔗 (التحديث الثامن عشر) ربط/فك ربط حساب الدخول — مع تحقق التفرد:
  // الحساب لازم يكون في نفس المحل وما يكونش مربوط بموظف تاني
  if (b.userId !== undefined) {
    if (b.userId === null || b.userId === '') {
      data.userId = null
    } else {
      const uid = String(b.userId)
      const u = await db.user.findFirst({ where: { id: uid, tenantId: session.tenantId }, select: { id: true } })
      if (!u) return bad('حساب الدخول غير موجود')
      const taken = await db.employee.findFirst({
        where: { tenantId: session.tenantId, userId: uid, id: { not: id } },
        select: { id: true, name: true },
      })
      if (taken) return bad(`الحساب ده مربوط بالفعل بالموظف «${taken.name}» — افصله الأول من ملفه`)
      data.userId = uid
    }
  }
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
  return withDb(() => hrSafe(() => __PUT(...args)))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => hrSafe(() => __DELETE(...args)))
}
