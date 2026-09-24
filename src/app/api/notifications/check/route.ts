import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { checkLowStockAndNotify, checkExpiringSubscriptions } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/check
 *
 * 🛡️ 2026-09-14: Manual trigger for notification checks. Use this when you
 * want to force-run the checks without waiting for the 30s poll or a
 * dashboard refresh. Useful for debugging ("why don't I see notifications?").
 *
 * Response: {
 *   ok: true,
 *   lowStock: { triggered: true/false, error?: string },
 *   expiring: { triggered: true/false, error?: string },
 *   unread: number,
 *   total: number,
 * }
 */
export async function POST() {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const results: {
      ok: true
      tenantId: string
      lowStock: { triggered: boolean; error?: string }
      expiring: { triggered: boolean; error?: string }
      unread: number
      total: number
    } = {
      ok: true,
      tenantId: session.tenantId,
      lowStock: { triggered: false },
      expiring: { triggered: false },
      unread: 0,
      total: 0,
    }

    try {
      await checkLowStockAndNotify(db, session.tenantId)
      results.lowStock.triggered = true
    } catch (e: any) {
      results.lowStock.error = e?.message ?? String(e)
    }

    try {
      await checkExpiringSubscriptions(db, session.tenantId)
      results.expiring.triggered = true
    } catch (e: any) {
      results.expiring.error = e?.message ?? String(e)
    }

    try {
      const unreadCount = await db.notification.count({
        where: { tenantId: session.tenantId, isRead: false },
      })
      const totalCount = await db.notification.count({
        where: { tenantId: session.tenantId },
      })
      results.unread = unreadCount
      results.total = totalCount
    } catch (e: any) {
      // likely: Notification table doesn't exist
      return NextResponse.json(
        {
          ok: false,
          error: 'فشل الوصول لجدول الإشعارات — تأكد من تطبيق migration',
          detail: e?.message ?? String(e),
          results,
        },
        { status: 500 },
      )
    }

    return NextResponse.json(results)
  })
}
