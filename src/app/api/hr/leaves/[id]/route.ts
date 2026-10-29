import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { getSql } from '@/lib/sql'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** DELETE = إلغاء الإجازة + مسح سجلات الحضور اللي ولّدتها (اللي المدير ما عدّلهاش يدويًا) */
async function __DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')
  const sql = getSql()
  const removed = await sql.begin(async (tx) => {
    const lv = await tx<{ id: number }[]>`
      SELECT "id" FROM "LeaveRequest" WHERE "id" = ${id} AND "tenantId" = ${session.tenantId} FOR UPDATE`
    if (lv.length === 0) return null
    const del = await tx`
      DELETE FROM "AttendanceRecord" WHERE "tenantId" = ${session.tenantId} AND "leaveId" = ${id} RETURNING "id"`
    await tx`DELETE FROM "LeaveRequest" WHERE "id" = ${id}`
    return del.length
  })
  if (removed === null) return bad('الإجازة غير موجودة', 404)
  await logAudit({ action: 'hr.leave.cancel', targetType: 'leave', targetId: id }, req)
  return NextResponse.json({ ok: true, removedDays: removed })
}

export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => hrSafe(() => __DELETE(...args)))
}
