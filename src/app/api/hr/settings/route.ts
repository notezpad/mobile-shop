import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, loadHrSettings, hrSafe } from '@/lib/hr-route'
import { DEFAULT_HR_SETTINGS, isTimeStr } from '@/lib/hr'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function __GET() {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  return NextResponse.json(await loadHrSettings(g.session.tenantId))
}

async function __PUT(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return bad('بيانات غير صالحة')

  const shiftStart = String(b.shiftStart ?? DEFAULT_HR_SETTINGS.shiftStart)
  if (!isTimeStr(shiftStart)) return bad('ميعاد بداية الشغل غير صالح (HH:MM)')
  const shiftHours = Number(b.shiftHours)
  if (!Number.isFinite(shiftHours) || shiftHours <= 0 || shiftHours > 24) return bad('عدد ساعات الشغل غير صالح')
  const graceMinutes = Math.floor(Number(b.graceMinutes))
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0 || graceMinutes > 240) return bad('فترة السماح غير صالحة')
  const lateMode = b.lateMode === 'none' ? 'none' : 'per_minute'
  const dayDivisor = Math.floor(Number(b.dayDivisor))
  if (![0, 26, 30].includes(dayDivisor)) return bad('مقسوم قيمة اليوم يجب أن يكون 26 أو 30 أو 0')

  const annualLeaveDays = b.annualLeaveDays === undefined ? DEFAULT_HR_SETTINGS.annualLeaveDays : Math.floor(Number(b.annualLeaveDays))
  if (!(annualLeaveDays >= 0 && annualLeaveDays <= 90)) return bad('رصيد الإجازة السنوية غير صالح')

  const data = { shiftStart, shiftHours, graceMinutes, lateMode, dayDivisor, annualLeaveDays }
  await db.hrSettings.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, ...data },
    update: data,
  })
  await logAudit({ action: 'hr.settings', targetType: 'tenant', targetId: session.tenantId, details: data }, req)
  return NextResponse.json({ ok: true, ...data })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => hrSafe(() => __GET(...args)))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => hrSafe(() => __PUT(...args)))
}
