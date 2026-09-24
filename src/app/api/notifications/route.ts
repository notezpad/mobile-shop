import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import {
  checkLowStockAndNotify,
  checkExpiringSubscriptions,
  cleanupDuplicateNotifications,
} from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications
 *
 * Returns unread + recent (last 50) notifications for the current user's tenant.
 * Query: ?unread=true → only unread, ?debug=true → verbose server logs
 *
 * 🔔 2026-09-14: We run the proactive checks (low stock + expiring subs) before
 * returning the list. The checks are now rate-limited (5 min per tenant) + dedup
 * is strengthened (24h window) so they won't spam.
 *
 * 🛡️ 2026-09-15 (v3): Major fix for the ~500x duplicate spam.
 *   - `cleanupDuplicateNotifications()` now runs on EVERY poll but is cheap
 *     (single findMany + a deleteMany only if duplicates exist).
 *   - Removed the unreliable `globalThis.__notifCleanupDone` flag — on
 *     Cloudflare Workers, each request gets a fresh isolate so the flag was
 *     always reset, and the cleanup was running anyway. Making it explicit
 *     + cheap is the right call.
 *   - The v3 helpers in `lib/notifications.ts` fix the actual root cause:
 *     the dedup check now searches by `message contains product_name`
 *     (was previously searching `title contains product_name`, but the
 *     title was a constant string and never contained the product name,
 *     so every poll inserted a new row).
 */

export async function GET(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      // 🛡️ 2026-09-21: Use requireAuthIgnoreSubscription so the notification
      // bell still works when the subscription is expired. This is critical
      // because the "your subscription expired" notification IS the renewal
      // nudge — if the bell 402'd, the user would never see the reminder.
      session = await requireAuthIgnoreSubscription()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const url = new URL(req.url)
    const onlyUnread = url.searchParams.get('unread') === 'true'
    const debug = url.searchParams.get('debug') === 'true'

    // 🔔 Run notification checks (await — fresh results on the same poll).
    // 🛡️ 2026-09-15 (v3): checks are now rate-limited (5 min per tenant)
    // via in-memory `shouldRunCheck()` AND dedup (7-day window by message).
    // Even if called every 30 seconds, the checks will actually run at
    // most once every 5 minutes per tenant.
    try {
      await Promise.allSettled([
        checkLowStockAndNotify(db, session.tenantId),
        checkExpiringSubscriptions(db, session.tenantId),
      ])
    } catch (e: any) {
      if (debug) console.error('[notifications GET] checks failed:', e?.message ?? e)
    }

    // 🧹 2026-09-15 (v3): Run cleanup on every poll.
    // This is now cheap (single findMany + a deleteMany only if duplicates
    // exist) and is the right call given that serverless isolates don't
    // preserve `globalThis` flags between requests. The cleanup also
    // handles any legacy duplicates from the v2 broken dedup.
    try {
      const deleted = await cleanupDuplicateNotifications(db, session.tenantId)
      if (deleted > 0 && debug) {
        console.log(`[notifications GET] cleaned up ${deleted} duplicate notifications`)
      }
    } catch (e: any) {
      if (debug) console.error('[notifications GET] cleanup failed:', e?.message ?? e)
    }

    // 🛡️ Wrap the actual list fetch in try/catch — if the Notification table
    // doesn't exist (migration not applied), return empty list + a diagnostic
    // flag instead of crashing with a 500.
    let notifications: any[] = []
    let unreadCount = 0
    let migrationNeeded = false
    let dbError: string | undefined

    try {
      const where: any = { tenantId: session.tenantId }
      if (onlyUnread) where.isRead = false

      notifications = await db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })

      unreadCount = await db.notification.count({
        where: { tenantId: session.tenantId, isRead: false },
      })
    } catch (e: any) {
      dbError = e?.message ?? String(e)
      // Detect "table does not exist" errors and surface a friendly message
      const lowerErr = (dbError ?? '').toLowerCase()
      if (
        lowerErr.includes('notification') &&
        (lowerErr.includes('does not exist') ||
          lowerErr.includes('relation') ||
          lowerErr.includes('no such table'))
      ) {
        migrationNeeded = true
      }
      console.error('[notifications GET] DB query failed:', dbError)
    }

    if (debug) {
      console.log('[notifications GET]', {
        tenant: session.tenantId,
        unread: unreadCount,
        total: notifications.length,
        migrationNeeded,
        dbError,
      })
    }

    // Always return 200 — the bell will show "no notifications" if the table
    // is missing, but at least it won't crash the page with red 500s in console.
    return NextResponse.json({
      items: notifications,
      unreadCount,
      // 🛡️ Diagnostic flags — frontend can show a small banner if needed.
      migrationNeeded,
      ...(debug && dbError ? { error: dbError } : {}),
    })
  })
}

/**
 * POST /api/notifications
 * Create a new notification (internal use — e.g. from sales, inventory, cron).
 * Body: { type, title, message, link?, userId? }
 *
 * 🛡️ Wrapped in try/catch — if the table doesn't exist, return a friendly 500
 * with the error message so the caller knows what went wrong.
 */
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })

  const type = String(body.type ?? 'info')
  const title = String(body.title ?? '')
  const message = String(body.message ?? '')
  const link = body.link ? String(body.link) : null
  const userId = body.userId ? String(body.userId) : null

  if (!title || !message) {
    return NextResponse.json({ error: 'العنوان والرسالة مطلوبان' }, { status: 400 })
  }

  try {
    const notif = await db.notification.create({
      data: { tenantId: session.tenantId, userId, type, title, message, link },
    })
    return NextResponse.json({ ok: true, notification: notif })
  } catch (e: any) {
    console.error('[notifications POST] create failed:', e?.message ?? e)
    return NextResponse.json(
      {
        error: 'فشل إنشاء الإشعار — تأكد من تطبيق migration الإشعارات على قاعدة البيانات',
        detail: e?.message ?? String(e),
      },
      { status: 500 },
    )
  }
}
