import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { isDateStr, isValidPin } from '@/lib/hr'
import { hashPinV2 } from '@/lib/hr-pin'
import { getTenantTimezone, dateStrInTz, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { normalizeShifts } from '@/lib/branch-shifts'
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
        shiftName: true,
      },
    }),
    db.employeeAdvance.groupBy({
      by: ['employeeId'],
      where: { tenantId: session.tenantId, status: 'open' },
      _sum: { remaining: true },
    }),
  ])
  const owed = new Map(advances.map((a) => [a.employeeId, a._sum.remaining ?? 0]))

  // 🔗 (التحديث الثامن عشر) بيانات الحساب المرتبط (Employee.userId) — علشان
  // الكارت يعرض الحساب وشارة البائع (العمولة هتنزل في راتبه تلقائياً)
  const linkedIds = rows.map((r) => r.userId).filter((v): v is string => !!v)
  const linkedUsers = linkedIds.length
    ? await db.user.findMany({
        where: { tenantId: session.tenantId, id: { in: linkedIds } },
        select: { id: true, email: true, isSeller: true, branchId: true },
      })
    : []
  const userById = new Map(linkedUsers.map((u) => [u.id, u]))

  const items = rows.map(({ pinHash, hireDate, ...r }) => ({
    ...r,
    // 🏢 فرع الموظف الفعلي = فرعه المسجل في HR، وإلا فرع حسابه المرتبط
    branchId: r.branchId ?? (r.userId ? userById.get(r.userId)?.branchId ?? null : null),
    hireDate: dateStrInTz(hireDate, tz),
    hasPin: !!pinHash,
    advanceRemaining: owed.get(r.id) ?? 0,
    userEmail: r.userId ? userById.get(r.userId)?.email ?? null : null,
    userIsSeller: r.userId ? userById.get(r.userId)?.isSeller === true : false,
  }))

  // 🕐 (التحديث الحادي والعشرين) ورديات الفروع — عشان فورم الموظف يعرض
  // اختيار الوردية من ورديات فرعه المعرّفة (صباحي/مسائي/ليلي...)
  const branchRows = await db.branch.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, shifts: true },
    orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
  })
  return NextResponse.json({
    items,
    branches: branchRows.map((b) => ({ id: b.id, name: b.name, shifts: normalizeShifts(b.shifts) })),
    // فرع الجلسة — الموظف الجديد بيتحطّم عليه لما المدير ماعندوش فرع محدد
    sessionBranchId: session.branchId ?? null,
  })
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
  let branchId: number | null = b.branchId ? Number(b.branchId) : null
  if (branchId != null) {
    const okBranch = await db.branch.findFirst({ where: { id: branchId, tenantId: session.tenantId }, select: { id: true } })
    if (!okBranch) return bad('الفرع غير موجود')
  }

  // 🔗 (التحديث الثامن عشر) ربط حساب الدخول — اختياري، مع تحقق التفرد:
  // الحساب لازم يكون في نفس المحل وما يكونش مربوط بموظف تاني
  let userId: string | null = null
  if (b.userId !== undefined && b.userId !== null && b.userId !== '') {
    const uid = String(b.userId)
    const u = await db.user.findFirst({ where: { id: uid, tenantId: session.tenantId }, select: { id: true } })
    if (!u) return bad('حساب الدخول غير موجود')
    const taken = await db.employee.findFirst({
      where: { tenantId: session.tenantId, userId: uid },
      select: { id: true, name: true },
    })
    if (taken) return bad(`الحساب ده مربوط بالفعل بالموظف «${taken.name}» — افصله الأول من ملفه`)
    userId = uid
    // 🏢 مفيش فرع محدد → الموظف ياخد فرع حسابه المرتبط
    if (branchId == null) {
      const ub = await db.user.findFirst({ where: { id: uid, tenantId: session.tenantId }, select: { branchId: true } })
      branchId = ub?.branchId ?? null
    }
  }
  if (branchId == null) branchId = session.branchId ?? null

  // 🕐 (التحديث الحادي والعشرين) وردية الموظف — لازم تكون من ورديات فرعه
  // المعرّفة (الاسم نص snapshot زي نمط ShiftSession) — والفاضي = بدون وردية
  const branchIdNum = Number.isFinite(branchId as number) ? (branchId as number) : null
  let shiftName: string | null = null
  const rawShift = b.shiftName ? String(b.shiftName).trim().slice(0, 40) : ''
  if (rawShift) {
    if (branchIdNum == null) return bad('حدد فرع الموظف الأول قبل ما تحدد ورديته — الوردية بتتحدد من ورديات الفرع')
    const br = await db.branch.findFirst({
      where: { id: branchIdNum, tenantId: session.tenantId },
      select: { shifts: true },
    })
    const defined = normalizeShifts(br?.shifts)
    if (!defined.some((s) => s.name === rawShift)) {
      return bad('الوردية دي مش معرّفة على فرع الموظف — عدّل ورديات الفرع الأول من شاشة الفروع')
    }
    shiftName = rawShift
  }

  let emp
  try {
    emp = await db.employee.create({
      data: {
        tenantId: session.tenantId,
        branchId: branchIdNum,
        name,
        phone: b.phone ? String(b.phone).trim() || null : null,
        jobTitle: b.jobTitle ? String(b.jobTitle).trim() || null : null,
        baseSalary,
        weeklyOffDay,
        hireDate,
        notes: b.notes ? String(b.notes).trim() || null : null,
        userId,
        shiftName,
      },
    })
  } catch (e: any) {
    // 🛡️ مت-11 (2026-11-02): القيد الفريد Employee_userId_key في الداتابيز —
    // سباق طلبين متوازيين يربطان نفس الحساب بموظفين. نفس رسالة الفحص المسبق.
    if (e?.code === 'P2002') return bad('الحساب مربوط بموظف تاني — افصله الأول من ملفه')
    throw e
  }
  if (b.pin) {
    await db.employee.update({
      where: { id: emp.id },
      data: { pinHash: await hashPinV2(session.tenantId, emp.id, String(b.pin)) },
    })
  }
  await logAudit({ action: 'hr.employee.create', targetType: 'employee', targetId: emp.id, details: { name, baseSalary } }, req)
  return NextResponse.json({ ok: true, id: emp.id }, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => hrSafe(() => __POST(...args))))
}
