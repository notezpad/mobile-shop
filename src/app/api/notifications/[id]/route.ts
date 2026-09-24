import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/notifications/[id]
 *
 * 🛡️ 2026-09-15 (v3): Permanently delete a single notification.
 * The previous NotificationBell only removed the notification from local
 * state — on the next 30s poll it would reappear because the row still
 * existed in the DB. This endpoint actually deletes the row.
 *
 * Tenant-scoped: the notification must belong to the caller's tenant.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { id } = await params
    const notifId = parseInt(id, 10)
    if (Number.isNaN(notifId)) {
      return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
    }

    try {
      // deleteMany is safer than delete (which throws if row doesn't exist)
      // and naturally enforces the tenant scope via `where`.
      const result = await db.notification.deleteMany({
        where: { id: notifId, tenantId: session.tenantId },
      })

      if (result.count === 0) {
        return NextResponse.json({ error: 'الإشعار غير موجود' }, { status: 404 })
      }

      return NextResponse.json({ ok: true, deleted: result.count })
    } catch (e: any) {
      console.error('[notifications/[id] DELETE] failed:', e?.message ?? e)
      return NextResponse.json(
        { error: 'فشل حذف الإشعار', detail: e?.message ?? String(e) },
        { status: 500 }
      )
    }
  })
}
