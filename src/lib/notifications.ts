/**
 * Notification helpers — used by API routes to create in-app notifications.
 *
 * 🛡️ 2026-09-15 (v3): Major overhaul to stop the ~500x duplicate spam.
 *
 * ROOT CAUSE (old v2):
 *   - The low_stock dedup checked `title contains product_name`, but the
 *     title was always the constant string "مخزون منخفض" — it NEVER contained
 *     the product name. So the dedup ALWAYS returned null, and a new
 *     notification was inserted on every 30s poll. After ~4h that's ~480
 *     duplicate rows per low-stock product.
 *   - `cleanupDuplicateNotifications` grouped by `(type, title)`, but
 *     since title was constant for all low_stock notifications, it would
 *     keep only ONE low_stock notification per tenant and delete the rest —
 *     including legitimately-different product alerts.
 *
 * FIX (v3):
 *   1. Low-stock notifications now include the product name in BOTH the
 *      title (`مخزون منخفض — ${name}`) and the message. The dedup searches
 *      by `message contains product name` — which actually matches now.
 *   2. Added an in-memory per-tenant rate limiter: checks run at most once
 *      every 5 minutes per tenant. Belt-and-suspenders on top of DB dedup.
 *   3. `cleanupDuplicateNotifications` now groups by `(type, message)`
 *      (the message uniquely identifies the alert: includes product name
 *      for low_stock, includes plan name for expiring_subscription).
 *   4. The cleanup runs on every poll but is cheap (single findMany + a
 *      deleteMany only if duplicates exist). The unreliable `globalThis`
 *      flag was removed — serverless isolates reset between requests.
 */

import { PrismaClient } from '@prisma/client'

export interface CreateNotificationInput {
  type?: string
  title: string
  message: string
  link?: string | null
  userId?: string | null
}

export async function createNotification(
  db: PrismaClient,
  tenantId: string,
  input: CreateNotificationInput
) {
  return db.notification.create({
    data: {
      tenantId,
      userId: input.userId ?? null,
      type: input.type ?? 'info',
      title: input.title,
      message: input.message,
      link: input.link ?? null,
    },
  })
}

// ─── Dedup window ──────────────────────────────────────
// How long to suppress duplicate notifications.
// Using DB-only dedup (no in-memory cache) so server restarts / hot-reload
// don't accidentally reset the cooldown and spam notifications.
const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ─── In-memory rate limiter (per tenant) ────────────────
// Prevents running the proactive checks more than once every 5 minutes
// per tenant. This is belt-and-suspenders on top of the DB dedup — even
// if dedup fails for any reason, the rate limiter caps the damage.
const CHECK_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
const lastCheckRun = new Map<string, number>() // key: `${tenantId}:${checkName}`

function shouldRunCheck(tenantId: string, checkName: string): boolean {
  const key = `${tenantId}:${checkName}`
  const now = Date.now()
  const last = lastCheckRun.get(key) ?? 0
  if (now - last < CHECK_COOLDOWN_MS) return false
  lastCheckRun.set(key, now)
  return true
}

/**
 * PERF FIX (2026-09-25): the in-memory limiter above cannot work on the edge
 * runtime — every request may land in a fresh isolate, so the map is empty and
 * the checks ran on EVERY poll. The notifications route now adds a cookie-based
 * cooldown on top of it (see `runProactiveChecks` there), and the low-stock
 * check below no longer runs one query per low-stock product.
 */

/**
 * Check for low-stock products and create notifications.
 *
 * 🛡️ 2026-09-15 (v3) fixes:
 *   - Rate limited (5 min per tenant) via in-memory `shouldRunCheck`
 *   - Dedup by `message contains product_name` (NOT title — title was constant)
 *   - Product name now appears in BOTH title and message for clarity + dedup
 */
export async function checkLowStockAndNotify(db: PrismaClient, tenantId: string) {
  // ─── Rate limit: skip if we ran this check recently ───
  if (!shouldRunCheck(tenantId, 'low_stock')) return

  // Check tenant preference — use try/catch because the column may not exist yet
  let notifyLowStock = true
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { notifyLowStock: true },
    })
    notifyLowStock = tenant?.notifyLowStock ?? true
  } catch (e) {
    console.warn('[checkLowStockAndNotify] could not read tenant preference, defaulting to true:', e)
  }
  if (!notifyLowStock) return

  // Find low-stock products
  const lowStockProducts = await db.product.findMany({
    where: { tenantId },
    select: { id: true, name: true, quantity: true, minQuantity: true },
  })

  const trulyLow = lowStockProducts.filter((p) => p.quantity <= p.minQuantity)
  if (trulyLow.length === 0) return

  // Dedup window — for suppressing duplicate notifications
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS)

  // PERF FIX (2026-09-25): previously this ran ONE dedup query per low-stock
  // product (a shop with 40 low-stock items = 40 sequential round-trips inside
  // a single request → seconds of delay and frequent 503s). Now: one query for
  // all recent low_stock messages, dedup in memory, then one bulk insert.
  let recentMessages: string[] = []
  try {
    const recent = await db.notification.findMany({
      where: { tenantId, type: 'low_stock', createdAt: { gte: dedupSince } },
      select: { message: true },
    })
    recentMessages = recent.map((r) => r.message ?? '')
  } catch (e) {
    console.error('[checkLowStockAndNotify] could not read recent notifications:', e)
    return
  }

  const toCreate = trulyLow
    .filter((p) => !recentMessages.some((m) => m.includes(p.name)))
    .map((p) => ({
      tenantId,
      userId: null,
      type: 'low_stock',
      title: `مخزون منخفض — ${p.name}`,
      message: `المنتج "${p.name}" وصل للحد الأدنى (${p.quantity} متبقي)`,
      link: '/products',
    }))

  if (toCreate.length === 0) return

  try {
    await db.notification.createMany({ data: toCreate })
  } catch (e) {
    console.error('[checkLowStockAndNotify] bulk insert failed:', e)
  }
}

/**
 * Check for expiring subscriptions and create notifications.
 *
 * 🛡️ 2026-09-15 (v3) fixes:
 *   - Rate limited (5 min per tenant)
 *   - Dedup unchanged (already correct: only one expiring_subscription
 *     per tenant per 7 days)
 *
 * 🛡️ 2026-09-21 (v4) enhancement:
 *   - ALSO checks for JUST-EXPIRED subscriptions (endDate within last 24h,
 *     status still 'active' because no API has touched it yet to flip it).
 *   - When detected, creates an 'expired_subscription' notification telling
 *     the user their subscription has ended and they need to redeem a code
 *     or renew via /pricing. The dashboard no longer locks the user out
 *     (per the 2026-09-13 layout update) — this notification is the only
 *     nudge they get.
 */
export async function checkExpiringSubscriptions(db: PrismaClient, tenantId: string) {
  // ─── Rate limit: skip if we ran this check recently ───
  if (!shouldRunCheck(tenantId, 'expiring_sub')) return

  let notifyExpiringSubscription = true
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { notifyExpiringSubscription: true },
    })
    notifyExpiringSubscription = tenant?.notifyExpiringSubscription ?? true
  } catch (e) {
    console.warn('[checkExpiringSubscriptions] could not read tenant preference, defaulting to true:', e)
  }
  if (!notifyExpiringSubscription) return

  const now = new Date()
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // ─── 1) Check for EXPIRING SOON (≤7 days) ────────────────────
  let expiringSub
  try {
    expiringSub = await db.subscription.findFirst({
      where: {
        tenantId,
        status: 'active',
        endDate: { gte: now, lte: sevenDaysLater },
      },
      include: { plan: true },
    })
  } catch (e) {
    console.error('[checkExpiringSubscriptions] could not query subscription:', e)
    return
  }

  if (expiringSub) {
    // 🛡️ DB dedup: suppress duplicate expiring-subscription notifications
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS)
    try {
      const existing = await db.notification.findFirst({
        where: {
          tenantId,
          type: 'expiring_subscription',
          createdAt: { gte: dedupSince },
        },
        select: { id: true },
      })
      if (!existing) {
        const daysLeft = Math.ceil((expiringSub.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        await createNotification(db, tenantId, {
          type: 'expiring_subscription',
          title: 'اشتراك ينتهي قريباً',
          message: `اشتراكك في باقة "${expiringSub.plan.name}" ينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'} — جدّد الآن لتجنب انقطاع الخدمة`,
          link: '/settings',
        })
        console.log(`[checkExpiringSubscriptions] created expiring-soon notification for tenant ${tenantId}, ${daysLeft} days left`)
      }
    } catch (e) {
      console.error('[checkExpiringSubscriptions] failed to create expiring notification:', e)
    }
  }

  // ─── 2) Check for JUST-EXPIRED (ended within last 24h) ──────
  // This is the renewal nudge: when the subscription crosses the end date,
  // we send a single notification telling the user to renew. The dashboard
  // doesn't lock (per the 2026-09-13 layout update) — features just stop
  // working via 402s from requireAuth. This notification explains WHY.
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  let justExpiredSub
  try {
    justExpiredSub = await db.subscription.findFirst({
      where: {
        tenantId,
        status: 'active',
        endDate: { gte: twentyFourHoursAgo, lt: now },
      },
      include: { plan: true },
    })
  } catch (e) {
    console.error('[checkExpiringSubscriptions] could not query just-expired subscription:', e)
    return
  }

  if (justExpiredSub) {
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS)
    try {
      const existing = await db.notification.findFirst({
        where: {
          tenantId,
          type: 'expired_subscription',
          createdAt: { gte: dedupSince },
        },
        select: { id: true },
      })
      if (!existing) {
        await createNotification(db, tenantId, {
          type: 'expired_subscription',
          title: 'انتهى اشتراكك',
          message:
            `انتهى اشتراكك في باقة "${justExpiredSub.plan.name}". ` +
            `يمكنك استخدام كود تفعيل من الإدارة للتجديد — افتح الإعدادات ثم "تطبيق كود اشتراك".`,
          link: '/settings',
        })
        console.log(`[checkExpiringSubscriptions] created expired notification for tenant ${tenantId}`)
      }
    } catch (e) {
      console.error('[checkExpiringSubscriptions] failed to create expired notification:', e)
    }
  }
}

/**
 * 🛡️ 2026-09-15 (v3): Clean up duplicate notifications.
 *
 * For each (tenantId, type, message) group, keep only the MOST RECENT
 * notification and delete all older duplicates. This fixes the 460+
 * duplicate notifications that accumulated due to the v2 broken dedup
 * (which deduped by `title contains product_name`, but title was a
 * constant string and never contained the product name).
 *
 * Grouping by `message` is correct because:
 *   - For low_stock: message contains the product name → unique per product
 *   - For expiring_subscription: message contains the plan name → unique per plan
 *
 * Returns the number of deleted notifications.
 */
export async function cleanupDuplicateNotifications(
  db: PrismaClient,
  tenantId: string
): Promise<number> {
  try {
    // Get all notifications for this tenant, grouped by (type, message)
    const allNotifs = await db.notification.findMany({
      where: { tenantId },
      select: { id: true, type: true, message: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    // Group by (type + message)
    const groups = new Map<string, typeof allNotifs>()
    for (const n of allNotifs) {
      const key = `${n.type}::${n.message}`
      const group = groups.get(key) ?? []
      group.push(n)
      groups.set(key, group)
    }

    // For each group, keep only the first (most recent), delete the rest
    const idsToDelete: number[] = []

    for (const [, group] of groups) {
      if (group.length > 1) {
        // Keep the first (most recent), delete the rest
        for (let i = 1; i < group.length; i++) {
          idsToDelete.push(group[i].id)
        }
      }
    }

    if (idsToDelete.length === 0) return 0

    // Delete in batches of 100 to avoid query size limits
    const deletedBatches: number[] = []
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const batch = idsToDelete.slice(i, i + 100)
      const result = await db.notification.deleteMany({
        where: { id: { in: batch } },
      })
      deletedBatches.push(result.count)
    }

    const deletedCount = deletedBatches.reduce((a, b) => a + b, 0)
    if (deletedCount > 0) {
      console.log(`[cleanupDuplicateNotifications] deleted ${deletedCount} duplicates for tenant ${tenantId}`)
    }
    return deletedCount
  } catch (e) {
    console.error('[cleanupDuplicateNotifications] failed:', e)
    return 0
  }
}
