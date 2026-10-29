/**
 * hr-route.ts — حراسة مسارات الموارد البشرية (سيرفر فقط).
 *  - 'admin'  : مدير + موديول hr (كل شاشات HR والمرتبات).
 *  - 'staff'  : مدير، أو موظف معاه صلاحية 'hr_attendance' صراحةً (مشرف الفرع) — للحضور والإجازات فقط،
 *               ومفيش في المسارات دي أي مبالغ. قائمة الصلاحيات الفاضية = مفيش وصول (عكس باقي الشاشات).
 *  - 'device' : أي مستخدم داخل بالمحل + hr مفعّل في الباقة (كشك الحضور على جهاز المحل).
 */
import { NextResponse } from 'next/server'
import { requireAdmin, requireAuth, authErrorResponse, type Session } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_HR_SETTINGS, type HrSettingsValues } from '@/lib/hr'
import { requireModule, featureErrorResponse, getTenantModules, FeatureError } from '@/lib/features'

export async function hrGuard(
  kind: 'admin' | 'device' | 'staff',
): Promise<{ session: Session } | { res: NextResponse }> {
  try {
    const session = kind === 'admin' ? await requireAdmin() : await requireAuth()
    if (kind === 'admin' || (kind === 'staff' && isAdminRole(session.role))) {
      await requireModule(session, 'hr')
    } else if (kind === 'staff' && !(session.permissions ?? []).includes(HR_STAFF_PERMISSION)) {
      throw new FeatureError('ليس لديك صلاحية لهذه العملية', 403)
    } else if (session.role !== 'SUPER_ADMIN') {
      const mods = await getTenantModules(session.tenantId)
      if (!mods.includes('hr')) throw new FeatureError('الميزة دي مش متاحة في باقتك الحالية', 403)
    }
    return { session }
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return { res: NextResponse.json(fe.body, { status: fe.status }) }
    const err = authErrorResponse(e)
    return { res: NextResponse.json(err.body, { status: err.status }) }
  }
}

export const HR_STAFF_PERMISSION = 'hr_attendance'
/** أقصى رجوع للخلف (بالأيام) لتعديل المشرف — المدير بدون حد */
export const STAFF_EDIT_DAYS = 3
export const isAdminRole = (role: string) => role === 'ADMIN' || role === 'SUPER_ADMIN'

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function loadHrSettings(tenantId: string): Promise<HrSettingsValues> {
  const row = await db.hrSettings.findUnique({ where: { tenantId } })
  if (!row) return { ...DEFAULT_HR_SETTINGS }
  return {
    shiftStart: row.shiftStart,
    shiftHours: row.shiftHours,
    graceMinutes: row.graceMinutes,
    lateMode: row.lateMode === 'none' ? 'none' : 'per_minute',
    dayDivisor: row.dayDivisor,
    annualLeaveDays: row.annualLeaveDays,
  }
}

/**
 * يلفّ الـ handler: أي استثناء غير متوقع بيتحوّل لرد JSON فيه سبب الخطأ (بدل 500 فاضي)،
 * فالواجهة تعرض السبب الحقيقي وتقدر نصلحه بسرعة. السبب بيتسجل في لوج السيرفر كمان.
 */
export async function hrSafe(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    console.error('[hr] unhandled error:', e)
    const msg = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(-300)
    return NextResponse.json({ error: `خطأ في الخادم: ${msg}` }, { status: 500 })
  }
}
