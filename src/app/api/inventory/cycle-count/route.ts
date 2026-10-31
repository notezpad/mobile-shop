import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'
import { normalizeCycleScheduleInput } from '@/lib/cycle-count'

export const dynamic = 'force-dynamic'

/**
 * 🔄 2026-10-31 (التحديث الثاني عشر) — جداول الجرد الدوري المجدول.
 *
 * GET  → قايمة الجداول (للوحة المحطة — للمدير/صاحب المخزون) مع اسم الفرع
 *        + هل فيه مسودة جرد دوري لسه معلّقة من الجدول ده.
 * POST → إنشاء جدول جديد (أدمن بس) — «جرد الإكسسوارات كل سبت — أعمي».
 */

async function __GETImpl(sql: Sql) {
  let s
  try {
    s = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // لوحة الأتمتة للمدير/صاحب المخزون — موظف الجرد الأعمي مالوش دعوة بيها
  try {
    await requireModule(s, 'inventory')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const rows = await sql<{
    id: number
    branchId: number | null
    branchName: string | null
    category: string | null
    mode: string
    frequency: string
    dayOfWeek: number | null
    dayOfMonth: number | null
    enabled: boolean
    note: string | null
    lastRunAt: Date | null
    pendingDraft: number
  }[]>`
    SELECT c."id", c."branchId", b."name" AS "branchName", c."category", c."mode",
           c."frequency", c."dayOfWeek", c."dayOfMonth", c."enabled", c."note",
           c."lastRunAt",
           (SELECT COUNT(*)::int FROM "Stocktake" st
             WHERE st."cycleScheduleId" = c."id" AND st."status" = 'draft') AS "pendingDraft"
    FROM "CycleCountSchedule" c
    LEFT JOIN "Branch" b ON b."id" = c."branchId"
    WHERE c."tenantId" = ${s.tenantId}
    ORDER BY c."id" DESC`

  return NextResponse.json({
    schedules: rows.map((r) => ({
      id: r.id,
      branchId: r.branchId,
      branchName: r.branchName,
      category: r.category,
      mode: r.mode,
      frequency: r.frequency,
      dayOfWeek: r.dayOfWeek,
      dayOfMonth: r.dayOfMonth,
      enabled: r.enabled,
      note: r.note,
      lastRunAt: r.lastRunAt,
      pendingDraft: r.pendingDraft > 0,
    })),
  })
}

async function __POST(req: NextRequest) {
  let s
  try {
    s = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const body = await req.json().catch(() => null)
  const norm = normalizeCycleScheduleInput(body)
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 })
  const v = norm.value

  // الفرع لازم يبقى للمحل ده
  if (v.branchId != null) {
    const br = await db.branch.findFirst({ where: { id: v.branchId, tenantId: s.tenantId }, select: { id: true } })
    if (!br) return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 400 })
  }

  const created = await db.cycleCountSchedule.create({
    data: {
      tenantId: s.tenantId,
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
  return NextResponse.json({ schedule: created }, { status: 201 })
}

export async function GET() {
  return withSql((sql) => __GETImpl(sql))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
