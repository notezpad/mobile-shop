import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { isDateStr, isValidPin } from '@/lib/hr'
import { hashPinV2 } from '@/lib/hr-pin'
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
  // 🏢 فرع الموظف: صريح من الفورم، أو يورث فرع الحساب المرتبط لو الموظف مالوش فرع
  let effBranchId: number | null = emp.branchId
  if (b.branchId !== undefined) {
    if (b.branchId === null || b.branchId === '') effBranchId = null
    else {
      const bid = Number(b.branchId)
      const okBranch = Number.isFinite(bid)
        ? await db.branch.findFirst({ where: { id: bid, tenantId: session.tenantId }, select: { id: true } })
        : null
      if (!okBranch) return bad('الفرع غير موجود')
      effBranchId = bid
    }
  }
  if (effBranchId == null) {
    const linkId = (data.userId as string | null | undefined) !== undefined ? (data.userId as string | null) : emp.userId
    if (linkId) {
      const ub = await db.user.findFirst({ where: { id: linkId, tenantId: session.tenantId }, select: { branchId: true } })
      effBranchId = ub?.branchId ?? null
    }
  }
  if (effBranchId !== emp.branchId) data.branchId = effBranchId

  // 🕐 وردية الموظف — لازم من ورديات فرعه الفعلي، والفاضي = بدون وردية.
  // لو الفرع اتغيّر ومحدش بعت وردية جديدة → الوردية القديمة بتتفضّى (كانت لفرع تاني)
  let wantedShift: string | null | undefined = undefined
  if (b.shiftName !== undefined) wantedShift = b.shiftName ? String(b.shiftName).trim().slice(0, 40) : null
  else if (effBranchId !== emp.branchId && emp.shiftName) wantedShift = null
  if (wantedShift !== undefined) {
    if (wantedShift) {
      if (effBranchId == null) return bad('حدد فرع الموظف الأول قبل ما تحدد ورديته — الوردية بتتحدد من ورديات الفرع')
      const br = await db.branch.findFirst({ where: { id: effBranchId, tenantId: session.tenantId }, select: { shifts: true } })
      if (!normalizeShifts(br?.shifts).some((s) => s.name === wantedShift)) {
        return bad('الوردية دي مش معرّفة على فرع الموظف — عدّل ورديات الفرع الأول من شاشة الفروع')
      }
    }
    data.shiftName = wantedShift
  }
  if (b.pin !== undefined) {
    if (b.pin === '' || b.pin === null) data.pinHash = null
    else if (!isValidPin(b.pin)) return bad('الـ PIN لازم 4 إلى 6 أرقام')
    else data.pinHash = await hashPinV2(session.tenantId, id, String(b.pin))
  }

  try {
    await db.employee.update({ where: { id }, data })
  } catch (e: any) {
    // 🛡️ مت-11 (2026-11-02): القيد الفريد Employee_userId_key — سباق ربط
    // نفس الحساب بموظفين في نفس اللحظة. نفس رسالة الفحص المسبق.
    if (e?.code === 'P2002') return bad('الحساب مربوط بموظف تاني — افصله الأول من ملفه')
    throw e
  }
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
