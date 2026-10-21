/**
 * Notification helpers — used by API routes to create in-app notifications.
 *
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): كل الدوال اتحولت من Prisma إلى SQL
 * مباشر (postgres.js عبر Hyperdrive) — التوقيعات بقت بتستقبل عميل `Sql`
 * بدل عميل Prisma، ونفس السلوك والرسائل بالظبط. الفرق الوحيد المذكور تحت.
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
 *   1. Low-stock notifications include the product name in BOTH the title
 *      and the message. The dedup searches by `message contains product name`.
 *   2. In-memory per-tenant rate limiter: checks run at most once every
 *      5 minutes per tenant. Belt-and-suspenders on top of DB dedup.
 *   3. `cleanupDuplicateNotifications` groups by `(type, message)` —
 *      بقت عبارة DELETE واحدة بـ ROW_NUMBER() بدل تحميل 500 صف للـ Worker.
 */

import type { Sql } from './sql'
import { readSubscriptionSettings, DAY_MS } from './subscription-settings'
import { sendTemplatedEmail, fmtArDate } from './email'
import { RETENTION_KEY, parseRetentionDays } from './notification-settings'

export interface CreateNotificationInput {
  type?: string
  title: string
  message: string
  link?: string | null
  userId?: string | null
}

export async function createNotification(
  sql: Sql,
  tenantId: string,
  input: CreateNotificationInput
) {
  const rows = await sql`
    INSERT INTO "Notification" ("tenantId", "userId", "type", "title", "message", "link")
    VALUES (${tenantId}, ${input.userId ?? null}, ${input.type ?? 'info'}, ${input.title}, ${input.message}, ${input.link ?? null})
    RETURNING *`
  return rows[0]
}

// ─── Dedup window ──────────────────────────────────────
// How long to suppress duplicate notifications.
const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ─── In-memory rate limiter (per tenant) ────────────────
// Prevents running the proactive checks more than once every 5 minutes
// per tenant. Belt-and-suspenders on top of the DB dedup.
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
 * Check for low-stock products and create notifications (SQL — استعلامان
 * خفيفان + إدراج مجمّع، بنفس دلالات dedup القديمة حرفيًا).
 */
export async function checkLowStockAndNotify(sql: Sql, tenantId: string) {
  // ─── Rate limit: skip if we ran this check recently ───
  if (!shouldRunCheck(tenantId, 'low_stock')) return

  // Check tenant preference — default to true on any failure
  let notifyLowStock = true
  try {
    const t = await sql<{ notifyLowStock: boolean | null }[]>`
      SELECT "notifyLowStock" FROM "Tenant" WHERE "id" = ${tenantId} LIMIT 1`
    notifyLowStock = t[0]?.notifyLowStock ?? true
  } catch (e) {
    console.warn('[checkLowStockAndNotify] could not read tenant preference, defaulting to true:', e)
  }
  if (!notifyLowStock) return

  // Find low-stock products — filtered + capped inside PostgreSQL.
  type LowRow = { id: number; name: string; quantity: number; minQuantity: number }
  const trulyLow = await sql<LowRow[]>`
    SELECT p."id", p."name", p."quantity", p."minQuantity" FROM "Product" p
    WHERE p."tenantId" = ${tenantId} AND p."quantity" <= p."minQuantity"
    ORDER BY p."quantity" ASC LIMIT 30`
  if (trulyLow.length === 0) return

  // Dedup window — for suppressing duplicate notifications
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS)

  // One query for all recent low_stock messages, dedup in memory, one bulk insert.
  let recentMessages: string[] = []
  try {
    const recent = await sql<{ message: string | null }[]>`
      SELECT "message" FROM "Notification"
      WHERE "tenantId" = ${tenantId} AND "type" = 'low_stock' AND "createdAt" >= ${dedupSince}`
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
    await sql`
      INSERT INTO "Notification" ("tenantId", "userId", "type", "title", "message", "link")
      SELECT x."tenantId", x."userId", x."type", x."title", x."message", x."link"
      FROM jsonb_to_recordset(${JSON.stringify(toCreate)}::jsonb)
        AS x("tenantId" text, "userId" text, "type" text, "title" text, "message" text, "link" text)`
  } catch (e) {
    console.error('[checkLowStockAndNotify] bulk insert failed:', e)
  }
}


/**
 * 🔎 2026-10-18 — تنبيه سلامة المخزون (للمدير بس).
 * بيفحص (1) منتجات كميتها الإجمالية مش مساوية لمجموع مقاساتها، (2) حركات الموظفين
 * اليدوية اللي لسه ماتراجعتش، (3) أرصدة سالبة — ويبعت إشعار واحد مجمّع لكل مدير
 * (مش لكل منتج)، من غير تكرار خلال 24 ساعة. أرقام وعدادات بس — مفيش بيانات حساسة.
 */
export async function checkStockIntegrityAndNotify(sql: Sql, tenantId: string) {
  if (!shouldRunCheck(tenantId, 'stock_integrity')) return
  try {
    const rows = await sql<{ drift: number; review: number; negative: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM (
           SELECT p."id" FROM "Product" p
             JOIN "ProductVariant" v ON v."productId" = p."id"
            WHERE p."tenantId" = ${tenantId}
            GROUP BY p."id", p."quantity"
           HAVING p."quantity" <> SUM(v."quantity")
         ) d) AS drift,
        (SELECT COUNT(*)::int FROM "StockMovement" m
          WHERE m."tenantId" = ${tenantId} AND m."needsReview" = true) AS review,
        (SELECT COUNT(*)::int FROM "Product" p WHERE p."tenantId" = ${tenantId} AND p."quantity" < 0)
        + (SELECT COUNT(*)::int FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
            WHERE p."tenantId" = ${tenantId} AND v."quantity" < 0) AS negative`
    const { drift, review, negative } = rows[0] ?? { drift: 0, review: 0, negative: 0 }
    const parts: string[] = []
    if (drift > 0) parts.push(`${drift} منتج كميته لا تساوي مجموع مقاساته`)
    if (negative > 0) parts.push(`${negative} رصيد سالب`)
    if (review > 0) parts.push(`${review} حركة يدوية من الموظفين تحتاج مراجعة`)
    if (parts.length === 0) return

    const message = `فحص المخزون: ${parts.join(' — ')}`
    const admins = await sql<{ id: string }[]>`
      SELECT "id" FROM "User"
      WHERE "tenantId" = ${tenantId} AND "role" = 'ADMIN' AND "active" = true`
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    for (const a of admins) {
      const dup = await sql`
        SELECT 1 FROM "Notification"
        WHERE "tenantId" = ${tenantId} AND "userId" = ${a.id} AND "type" = 'stock_integrity'
          AND "message" = ${message} AND "createdAt" >= ${since} LIMIT 1`
      if (dup.length > 0) continue
      await sql`
        INSERT INTO "Notification" ("tenantId", "userId", "type", "title", "message", "link")
        VALUES (${tenantId}, ${a.id}, 'stock_integrity', 'تنبيه سلامة المخزون', ${message}, '/inventory')`
    }
  } catch (e) {
    console.error('[checkStockIntegrityAndNotify] failed:', e)
  }
}

/**
 * Check for expiring / just-expired subscriptions and create notifications
 * (SQL — بنفس النصوص وdedup القديم حرفيًا).
 */
/** أقصى عدد محاولات فاشلة لنفس الإيميل في نافذة الـ dedup قبل ما نبطّل (بعدها بنسيبه للدعم). */
const EMAIL_MAX_FAILED_ATTEMPTS = 3

/**
 * ✉️ بيضمن إن إيميل التذكير/الانتهاء يوصل مرة واحدة في نافذة الـ dedup.
 * بيتنادى في *كل* دورة فحص: لو مفيش إيميل 'sent' في EmailLog من بداية النافذة (والمحاولات الفاشلة < 3)
 * بيحاول يبعت. فلو الإرسال اتخطى (الحد اليومي) أو فشل (Resend/شبكة)، بيتعاد في الدورة الجاية
 * بدل ما الإيميل يضيع للأبد (قبل كده كان بيتبعت مرة واحدة بس لحظة إنشاء الإشعار).
 * لو جدول EmailLog مش موجود → بنوقف (من غير سجل مفيش طريقة نمنع التكرار) — شغّل المايجريشن.
 */
export async function ensureOwnerEmail(
  sql: Sql, tenantId: string, kind: 'renewal' | 'expired',
  sub: { endDate: Date; planName: string }, daysLeft: number, since: Date,
) {
  try {
    const rows = await sql<{ status: string; n: number }[]>`
      SELECT "status", COUNT(*)::int AS n FROM "EmailLog"
      WHERE "tenantId" = ${tenantId} AND "kind" = ${kind} AND "createdAt" >= ${since}
      GROUP BY "status"`
    const sent = rows.find((r) => r.status === 'sent')?.n ?? 0
    const failed = rows.find((r) => r.status === 'failed')?.n ?? 0
    if (sent > 0 || failed >= EMAIL_MAX_FAILED_ATTEMPTS) return
  } catch (e) {
    console.warn('[ensureOwnerEmail] EmailLog unavailable — email skipped (run the 20261021_email_log migration):', e)
    return
  }
  await emailOwner(sql, tenantId, kind, sub, daysLeft)
}

/** ✉️ إيميل تذكير/انتهاء للمالك (الاستدعاء من ensureOwnerEmail). ما بيرميش أخطاء. */
async function emailOwner(
  sql: Sql, tenantId: string, kind: 'renewal' | 'expired',
  sub: { endDate: Date; planName: string }, daysLeft: number,
) {
  try {
    const t = await sql<{ shopName: string; ownerEmail: string | null; ownerName: string | null }[]>`
      SELECT t."shopName", t."ownerEmail",
        (SELECT u."name" FROM "User" u WHERE u."tenantId" = t."id" AND u."role" = 'ADMIN' ORDER BY u."createdAt" ASC LIMIT 1) AS "ownerName"
      FROM "Tenant" t WHERE t."id" = ${tenantId} LIMIT 1`
    const row = t[0]
    if (!row?.ownerEmail) return
    await sendTemplatedEmail(sql, kind, row.ownerEmail, tenantId, {
      shopName: row.shopName, ownerName: row.ownerName ?? row.shopName,
      planName: sub.planName, daysLeft, endDate: fmtArDate(sub.endDate),
    })
  } catch (e) {
    console.error('[emailOwner] failed:', e)
  }
}

export async function checkExpiringSubscriptions(sql: Sql, tenantId: string) {
  // ─── Rate limit: skip if we ran this check recently ───
  if (!shouldRunCheck(tenantId, 'expiring_sub')) return

  let notifyExpiringSubscription = true
  try {
    const t = await sql<{ notifyExpiringSubscription: boolean | null }[]>`
      SELECT "notifyExpiringSubscription" FROM "Tenant" WHERE "id" = ${tenantId} LIMIT 1`
    notifyExpiringSubscription = t[0]?.notifyExpiringSubscription ?? true
  } catch (e) {
    console.warn('[checkExpiringSubscriptions] could not read tenant preference, defaulting to true:', e)
  }
  if (!notifyExpiringSubscription) return

  const now = new Date()
  // ⚙️ أيام التذكير من إعدادات الأدمن (الافتراضي [7] = السلوك القديم)
  const { reminderDays } = await readSubscriptionSettings(sql)
  const maxReminder = reminderDays[reminderDays.length - 1]
  const sevenDaysLater = new Date(now.getTime() + maxReminder * DAY_MS)

  // ─── 1) EXPIRING SOON (≤ أكبر يوم تذكير) ────────────────────
  type SubRow = { id: number; endDate: Date; planName: string }
  let expiringSub: SubRow | undefined
  try {
    const res = await sql<SubRow[]>`
      SELECT s."id", s."endDate", p."name" AS "planName"
      FROM "Subscription" s JOIN "Plan" p ON p."id" = s."planId"
      WHERE s."tenantId" = ${tenantId} AND s."status" = 'active'
        AND s."endDate" >= ${now} AND s."endDate" <= ${sevenDaysLater}
      ORDER BY s."endDate" DESC
      LIMIT 1`
    expiringSub = res[0]
  } catch (e) {
    console.error('[checkExpiringSubscriptions] could not query subscription:', e)
    return
  }

  // ─── 2) JUST-EXPIRED (ended within last 24h, still active) ──────
  // (بناخده في نفس الدورة — بنفس شروط النسخة القديمة حرفيًا)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  let justExpiredSub: SubRow | undefined
  try {
    const res = await sql<SubRow[]>`
      SELECT s."id", s."endDate", p."name" AS "planName"
      FROM "Subscription" s JOIN "Plan" p ON p."id" = s."planId"
      WHERE s."tenantId" = ${tenantId} AND s."status" = 'active'
        AND s."endDate" >= ${twentyFourHoursAgo} AND s."endDate" < ${now}
      ORDER BY s."endDate" DESC
      LIMIT 1`
    justExpiredSub = res[0]
  } catch (e) {
    console.error('[checkExpiringSubscriptions] could not query just-expired subscription:', e)
    return
  }

  if (!expiringSub && !justExpiredSub) return

  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS)

  if (expiringSub) {
    try {
      const daysLeft = Math.ceil((expiringSub.endDate.getTime() - now.getTime()) / DAY_MS)
      // أقرب عتبة تذكير (أصغر يوم >= الأيام المتبقية). التذكير ده اتبعت قبل كده لو فيه إشعار
      // اتعمل بعد بداية نافذة العتبة دي (endDate - العتبة).
      const threshold = reminderDays.find((d) => d >= daysLeft) ?? maxReminder
      const windowStart = new Date(expiringSub.endDate.getTime() - threshold * DAY_MS)
      const existing = await sql<{ id: number }[]>`
        SELECT "id" FROM "Notification"
        WHERE "tenantId" = ${tenantId} AND "type" = 'expiring_subscription' AND "createdAt" >= ${windowStart}
        LIMIT 1`
      if (!existing[0]) {
        await createNotification(sql, tenantId, {
          type: 'expiring_subscription',
          title: 'اشتراك ينتهي قريباً',
          message: `اشتراكك في باقة "${expiringSub.planName}" ينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'} — جدّد الآن لتجنب انقطاع الخدمة`,
          link: '/settings',
        })
        console.log(`[checkExpiringSubscriptions] created expiring-soon notification for tenant ${tenantId}, ${daysLeft} days left`)
      }
      // الإيميل مستقل عن إنشاء الإشعار: بيتحاول (وبيتعاد لو فشل/اتخطى) لحد ما يوصل مرة في نفس نافذة العتبة
      await ensureOwnerEmail(sql, tenantId, 'renewal', expiringSub, daysLeft, windowStart)
    } catch (e) {
      console.error('[checkExpiringSubscriptions] failed to create expiring notification:', e)
    }
  }

  if (justExpiredSub) {
    try {
      const existing = await sql<{ id: number }[]>`
        SELECT "id" FROM "Notification"
        WHERE "tenantId" = ${tenantId} AND "type" = 'expired_subscription' AND "createdAt" >= ${dedupSince}
        LIMIT 1`
      if (!existing[0]) {
        await createNotification(sql, tenantId, {
          type: 'expired_subscription',
          title: 'انتهى اشتراكك',
          message:
            `انتهى اشتراكك في باقة "${justExpiredSub.planName}". ` +
            `يمكنك استخدام كود تفعيل من الإدارة للتجديد — افتح الإعدادات ثم "تطبيق كود اشتراك".`,
          link: '/settings',
        })
        console.log(`[checkExpiringSubscriptions] created expired notification for tenant ${tenantId}`)
      }
      await ensureOwnerEmail(sql, tenantId, 'expired', justExpiredSub, 0, dedupSince)
    } catch (e) {
      console.error('[checkExpiringSubscriptions] failed to create expired notification:', e)
    }
  }
}

/**
 * 🛡️ v3: Clean up duplicate notifications — keep only the MOST RECENT
 * notification per (tenantId, type, message).
 *
 * ⚡ 2026-10-17: بقيت عبارة DELETE واحدة بـ window function بدل تحميل 500 صف
 * للـ Worker وتجميعهم في الذاكرة (كان الاستعلام ده بيتنادى في *كل* poll).
 * الفرق الوحيد: التنظيف دلوقتي بيغطي كل التاريخ مش آخر 500 صف بس — وده
 * هو المقصود أصلاً (حذف سبام قديم).
 *
 * Returns the number of deleted notifications.
 */
export async function cleanupDuplicateNotifications(
  sql: Sql,
  tenantId: string
): Promise<number> {
  try {
    const deleted = await sql<{ id: number }[]>`
      WITH ranked AS (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY "type", "message"
                 ORDER BY "createdAt" DESC, "id" DESC
               ) AS rn
        FROM "Notification"
        WHERE "tenantId" = ${tenantId}
      )
      DELETE FROM "Notification" n
      USING ranked r
      WHERE n."id" = r."id" AND r.rn > 1
      RETURNING n."id"`
    if (deleted.length > 0) {
      console.log(`[cleanupDuplicateNotifications] deleted ${deleted.length} duplicates for tenant ${tenantId}`)
    }
    return deleted.length
  } catch (e) {
    console.error('[cleanupDuplicateNotifications] failed:', e)
    return 0
  }
}


/**
 * 🧹 مسح الإشعارات الأقدم من مدة الاحتفاظ (إعداد الأدمن، الافتراضي 30 يوم).
 * بتتنادى مع دورة الفحص (كل ~5 دقايق لكل محل) لكن بتشتغل فعليًا في ~10% منها بس —
 * DELETE واحد على فهرس (tenantId, createdAt) فتكلفتها ضئيلة. بترجّع عدد المحذوف.
 */
export async function purgeOldNotifications(sql: Sql, tenantId: string): Promise<number> {
  if (Math.random() >= 0.1) return 0
  try {
    const cfg = await sql<{ value: string }[]>`
      SELECT "value" FROM "PlatformSetting" WHERE "key" = ${RETENTION_KEY} LIMIT 1`
    const days = parseRetentionDays(cfg[0]?.value)
    const cutoff = new Date(Date.now() - days * DAY_MS)
    const deleted = await sql<{ id: number }[]>`
      DELETE FROM "Notification"
      WHERE "tenantId" = ${tenantId} AND "createdAt" < ${cutoff}
      RETURNING "id"`
    if (deleted.length > 0) {
      console.log(`[purgeOldNotifications] deleted ${deleted.length} notifications older than ${days}d for tenant ${tenantId}`)
    }
    return deleted.length
  } catch (e) {
    console.error('[purgeOldNotifications] failed (ignored):', e)
    return 0
  }
}

/**
 * 🔔 إشعار «فاتورة جديدة» لمديري المحل (مفتاح notifyNewSales في إعدادات المحل).
 * جملة SQL واحدة: لو المفتاح مقفول أو مفيش مدير تاني غير البائع → صفر صفوف، ومفيش تكلفة تُذكر.
 * البائع نفسه ما بيستلمش إشعار على فاتورته (منع الإزعاج).
 */
export async function notifyNewSale(
  sql: Sql,
  args: { tenantId: string; sellerUserId: string; sellerName: string; invoiceNo: string; total: number }
): Promise<void> {
  try {
    const total = Math.round(args.total * 100) / 100
    const message = `فاتورة ${args.invoiceNo} بقيمة ${total} جنيه — بواسطة ${args.sellerName || 'موظف'}`
    await sql`
      INSERT INTO "Notification" ("tenantId", "userId", "type", "title", "message", "link")
      SELECT t."id", u."id", 'new_sale', 'فاتورة جديدة', ${message}, '/sales'
      FROM "Tenant" t
      JOIN "User" u ON u."tenantId" = t."id" AND u."role" = 'ADMIN' AND u."active" = true
                    AND u."id" <> ${args.sellerUserId}
      WHERE t."id" = ${args.tenantId} AND t."notifyNewSales" = true`
  } catch (e) {
    // الإشعار مش لازم يفشّل البيع أبدًا
    console.error('[notifyNewSale] failed (ignored):', e)
  }
}
