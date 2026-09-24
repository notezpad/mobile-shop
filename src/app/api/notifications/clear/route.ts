import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/notifications/clear
 *
 * 🛡️ 2026-09-15 (v3): Bulk-delete ALL notifications for the current tenant.
 *
 * Body options (optional, all default to false):
 *   - onlyRead:   only delete notifications where isRead = true
 *   - onlyUnread: only delete notifications where isRead = false
 *   - (no body / empty body): delete ALL notifications for the tenant
 *
 * Returns: { ok: true, deleted: <count> }
 */
export async function DELETE(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // Parse body — body is optional for DELETE, so guard against empty.
    let body: any = null
    try {
      const text = await req.text()
      if (text) body = JSON.parse(text)
    } catch {
      /* empty body is allowed */
    }

    const where: any = { tenantId: session.tenantId }
    if (body?.onlyRead === true) where.isRead = true
    else if (body?.onlyUnread === true) where.isRead = false

    try {
      const result = await db.notification.deleteMany({ where })
      return NextResponse.json({ ok: true, deleted: result.count })
    } catch (e: any) {
      console.error('[notifications/clear DELETE] failed:', e?.message ?? e)
      return NextResponse.json(
        { error: 'فشل مسح الإشعارات', detail: e?.message ?? String(e) },
        { status: 500 }
      )
    }
  })
}
