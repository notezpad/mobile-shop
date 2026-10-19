import { NextRequest, NextResponse } from 'next/server'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import { withSql } from '@/lib/sql'
import {
  checkLowStockAndNotify,
  checkStockIntegrityAndNotify,
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
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): كل الاستعلامات (الفحوصات + التنظيف +
 * القائمة + العدّ) بقت SQL مباشر عبر postgres.js الخفيف بدل Prisma wasm —
 * نفس الرد بنفس الشكل بالظبط. الراوتر ده بيتسحب كل 3 دقايق من كل تاب مفتوح،
 * فكان من أثقل مصادر الـ CPU المستمر.
 *
 * 🔔 2026-09-14: We run the proactive checks (low stock + expiring subs) before
 * returning the list. The checks are rate-limited (5 min per tenant, cookie
 * cooldown) + dedup is strengthened (24h window) so they won't spam.
 */

export async function GET(req: NextRequest) {
  return withSql(async (sql) => {
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

    // 🛡️ Cookie-based cooldown — the in-memory limiter alone can't be trusted
    // across Cloudflare Workers isolates (كل isolate ممكن يكون جديد).
    const COOLDOWN_MS = 5 * 60 * 1000
    const lastCheckedCookie = req.cookies.get('notif_checked_at')?.value
    const lastChecked = lastCheckedCookie ? Number(lastCheckedCookie) : 0
    const shouldRunChecks = !Number.isFinite(lastChecked) || Date.now() - lastChecked >= COOLDOWN_MS

    // 🔔 Run notification checks (await — fresh results on the same poll).
    if (shouldRunChecks) {
      try {
        await Promise.allSettled([
          checkLowStockAndNotify(sql, session.tenantId),
          checkExpiringSubscriptions(sql, session.tenantId),
          checkStockIntegrityAndNotify(sql, session.tenantId),
        ])
      } catch (e: any) {
        if (debug) console.error('[notifications GET] checks failed:', e?.message ?? e)
      }
    }

    // 🧹 Cleanup duplicates — ⚡ 2026-10-19: بس لما الفحوصات بتشتغل (كل 5 دقايق)،
    // مش مع كل طلب: كان DELETE إضافي (رحلة كاملة للداتابيز) في كل poll من كل تاب.
    if (shouldRunChecks) {
      try {
        const deleted = await cleanupDuplicateNotifications(sql, session.tenantId)
        if (deleted > 0 && debug) {
          console.log(`[notifications GET] cleaned up ${deleted} duplicate notifications`)
        }
      } catch (e: any) {
        if (debug) console.error('[notifications GET] cleanup failed:', e?.message ?? e)
      }
    }

    // 🛡️ Wrap the actual list fetch in try/catch — if the Notification table
    // doesn't exist (migration not applied), return empty list + a diagnostic
    // flag instead of crashing with a 500.
    let notifications: any[] = []
    let unreadCount = 0
    let migrationNeeded = false
    let dbError: string | undefined

    try {
      // ⚡ القايمة والعدّ بالتوازي (رحلة واحدة بدل اتنين ورا بعض)
      const [listRows, cnt] = await Promise.all([
        onlyUnread
          ? sql`
            SELECT * FROM "Notification"
            WHERE "tenantId" = ${session.tenantId} AND "isRead" = false
              AND ("userId" IS NULL OR "userId" = ${session.userId})
            ORDER BY "createdAt" DESC
            LIMIT 50`
          : sql`
            SELECT * FROM "Notification"
            WHERE "tenantId" = ${session.tenantId}
              AND ("userId" IS NULL OR "userId" = ${session.userId})
            ORDER BY "createdAt" DESC
            LIMIT 50`,
        sql<{ cnt: number }[]>`
          SELECT COUNT(*)::int AS cnt FROM "Notification"
          WHERE "tenantId" = ${session.tenantId} AND "isRead" = false
            AND ("userId" IS NULL OR "userId" = ${session.userId})`,
      ])
      notifications = listRows as any[]
      unreadCount = Number(cnt[0]?.cnt ?? 0)
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
    const res = NextResponse.json({
      items: notifications,
      unreadCount,
      // 🛡️ Diagnostic flags — frontend can show a small banner if needed.
      migrationNeeded,
      ...(debug && dbError ? { error: dbError } : {}),
    })
    if (shouldRunChecks) {
      res.cookies.set('notif_checked_at', String(Date.now()), {
        maxAge: COOLDOWN_MS / 1000,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
    }
    return res
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

  return withSql(async (sql) => {
    try {
      const rows = await sql`
        INSERT INTO "Notification" ("tenantId", "userId", "type", "title", "message", "link")
        VALUES (${session.tenantId}, ${userId}, ${type}, ${title}, ${message}, ${link})
        RETURNING *`
      return NextResponse.json({ ok: true, notification: rows[0] })
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
  })
}
