import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { normalizeCycleScheduleInput } from '@/lib/cycle-count'

export const dynamic = 'force-dynamic'

/**
 * 🔄 2026-10-31 (التحديث الثاني عشر) — تعديل/حذف جدول جرد دوري (أدمن بس).
 *
 * PATCH → مفتاح التشغيل/الإيقاف لكل جدول على حدة + تعديل أي حقل
 *         (نفس تحقق normalizeCycleScheduleInput).
 * DELETE → حذف الجدول. أوراق الجرد المتولّدة منه بتفضل موجودة
 *          (cycleScheduleId بتتسكب لـ NULL عشان التاريخ ماتضيعش).
 */

async function __PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try {
    s = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id } = await ctx.params
  const sid = parseInt(id, 10)
  const existing = await db.cycleCountSchedule.findFirst({
    where: { id: sid, tenantId: s.tenantId },
  })
  if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const body = await req.json().catch(() => null)

  // مفتاح التشغيل/الإيقاف لوحده — أسرع مسار للواجهة
  if (body && typeof body === 'object' && Object.keys(body).length === 1 && body.enabled !== undefined) {
    const updated = await db.cycleCountSchedule.update({
      where: { id: sid },
      data: { enabled: Boolean(body.enabled) },
    })
    return NextResponse.json({ schedule: updated })
  }

  const norm = normalizeCycleScheduleInput(body)
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 })
  const v = norm.value
  if (v.branchId != null) {
    const br = await db.branch.findFirst({ where: { id: v.branchId, tenantId: s.tenantId }, select: { id: true } })
    if (!br) return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 400 })
  }

  const updated = await db.cycleCountSchedule.update({
    where: { id: sid },
    data: {
      branchId: v.branchId,
      category: v.category,
      mode: v.mode,
      frequency: v.frequency,
      dayOfWeek: v.dayOfWeek,
      dayOfMonth: v.dayOfMonth,
      note: v.note,
      enabled: body?.enabled !== false,
    },
  })
  return NextResponse.json({ schedule: updated })
}

async function __DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try {
    s = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id } = await ctx.params
  const sid = parseInt(id, 10)
  const deleted = await db.cycleCountSchedule.deleteMany({ where: { id: sid, tenantId: s.tenantId } })
  if (deleted.count === 0) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(...args: Parameters<typeof __PATCH>) {
  return withDb(() => __PATCH(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
