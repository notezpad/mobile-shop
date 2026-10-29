import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { getSql } from '@/lib/sql'
import { hrGuard, bad, hrSafe, isAdminRole, STAFF_EDIT_DAYS } from '@/lib/hr-route'
import { addDaysStr } from '@/lib/hr'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** DELETE = إلغاء الإجازة + مسح سجلات الحضور اللي ولّدتها (اللي المدير ما عدّلهاش يدويًا) */
async function __DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await hrGuard('staff')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')
  const sql = getSql()
  const oldest = isAdminRole(session.role) ? '' : addDaysStr(dateStrInTz(new Date(), await getTenantTimezone(session.tenantId)), -STAFF_EDIT_DAYS)
  const removed = await sql.begin(async (tx) => {
    const lv = await tx<{ id: number; endDate: string }[]>`
      SELECT "id", "endDate" FROM "LeaveRequest" WHERE "id" = ${id} AND "tenantId" = ${session.tenantId} FOR UPDATE`
    if (lv.length === 0) return null
    if (!isAdminRole(session.role) && lv[0].endDate < oldest) return 'LOCKED' as const
    const del = await tx`
      DELETE FROM "AttendanceRecord" WHERE "tenantId" = ${session.tenantId} AND "leaveId" = ${id} RETURNING "id"`
    await tx`DELETE FROM "LeaveRequest" WHERE "id" = ${id}`
    return del.length
  })
  if (removed === null) return bad('الإجازة غير موجودة', 404)
  if (removed === 'LOCKED') return bad(`المشرف يقدر يلغي إجازات آخر ${STAFF_EDIT_DAYS} أيام بس — اطلب من المدير`, 403)
  await logAudit({ action: 'hr.leave.cancel', targetType: 'leave', targetId: id }, req)
  return NextResponse.json({ ok: true, removedDays: removed })
}

export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => hrSafe(() => __DELETE(...args)))
}
