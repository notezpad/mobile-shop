import { NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { withSql } from '@/lib/sql'
import { checkLowStockAndNotify, checkExpiringSubscriptions } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/check
 *
 * 🛡️ 2026-09-14: Manual trigger for notification checks. Use this when you
 * want to force-run the checks without waiting for the 30s poll or a
 * dashboard refresh. Useful for debugging ("why don't I see notifications?").
 *
 * ⚡ 2026-10-17: بقى SQL مباشر (postgres.js) — نفس الرد بالظبط.
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
  return withSql(async (sql) => {
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
      await checkLowStockAndNotify(sql, session.tenantId)
      results.lowStock.triggered = true
    } catch (e: any) {
      results.lowStock.error = e?.message ?? String(e)
    }

    try {
      await checkExpiringSubscriptions(sql, session.tenantId)
      results.expiring.triggered = true
    } catch (e: any) {
      results.expiring.error = e?.message ?? String(e)
    }

    try {
      const cnt = await sql<{ unread: number; total: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE "isRead" = false)::int AS unread,
          COUNT(*)::int AS total
        FROM "Notification"
        WHERE "tenantId" = ${session.tenantId}`
      results.unread = Number(cnt[0]?.unread ?? 0)
      results.total = Number(cnt[0]?.total ?? 0)
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
