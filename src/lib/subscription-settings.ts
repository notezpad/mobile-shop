import type { Sql } from './sql'

/**
 * ⚙️ إعدادات الاشتراك (من لوحة الأدمن → جدول PlatformSetting):
 *   - subscriptionGraceDays : أيام سماح بعد انتهاء الاشتراك (الخدمة تفضل شغالة). الافتراضي 0 = زي الأول.
 *   - renewalReminderDays   : أيام تذكير التجديد قبل الانتهاء، مثال "7,3,1". الافتراضي "7" = زي الأول.
 * الدوال النقية (parse*) من غير أي imports تقيلة عشان auth.ts يستخدمها.
 */
export const GRACE_KEY = 'subscriptionGraceDays'
export const REMINDER_KEY = 'renewalReminderDays'
export const MAX_GRACE_DAYS = 30
export const MAX_REMINDER_DAY = 30
export const MAX_REMINDERS = 5
export const DAY_MS = 24 * 60 * 60 * 1000

export function parseGraceDays(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, MAX_GRACE_DAYS)
}

/** "7,3,1" → [1,3,7] (تصاعدي، بدون تكرار، بحدود آمنة). الافتراضي [7]. */
export function parseReminderDays(raw: unknown): number[] {
  const out = new Set<number>()
  for (const part of String(raw ?? '').split(/[,،\s]+/)) {
    const n = Number.parseInt(part, 10)
    if (Number.isFinite(n) && n >= 1 && n <= MAX_REMINDER_DAY) out.add(n)
    if (out.size >= MAX_REMINDERS) break
  }
  return out.size ? [...out].sort((a, b) => a - b) : [7]
}

/** يقرأ الإعدادين بسطر SQL واحد. لو فشل (جدول/صلاحيات) بيرجّع الافتراضيات. */
export async function readSubscriptionSettings(sql: Sql): Promise<{ graceDays: number; reminderDays: number[] }> {
  try {
    const rows = await sql<{ key: string; value: string }[]>`
      SELECT "key", "value" FROM "PlatformSetting" WHERE "key" IN (${GRACE_KEY}, ${REMINDER_KEY})`
    const m = new Map(rows.map((r) => [r.key, r.value]))
    return { graceDays: parseGraceDays(m.get(GRACE_KEY)), reminderDays: parseReminderDays(m.get(REMINDER_KEY)) }
  } catch (e) {
    console.error('[subscription-settings] read failed (defaults):', e)
    return { graceDays: 0, reminderDays: [7] }
  }
}

/** صالح للحفظ؟ (يرجّع رسالة خطأ أو null) — بيستخدمها route الإعدادات. */
export function validateSubscriptionSetting(key: string, v: string): string | null {
  if (key === GRACE_KEY) {
    return /^\d{1,2}$/.test(v) && Number(v) <= MAX_GRACE_DAYS ? null : `أيام السماح: رقم من 0 إلى ${MAX_GRACE_DAYS}`
  }
  if (key === REMINDER_KEY) {
    const parts = v.split(/[,،\s]+/).filter(Boolean)
    const ok =
      parts.length >= 1 &&
      parts.length <= MAX_REMINDERS &&
      parts.every((p) => /^\d{1,2}$/.test(p) && Number(p) >= 1 && Number(p) <= MAX_REMINDER_DAY)
    return ok ? null : `أيام التذكير: من 1 إلى ${MAX_REMINDERS} أرقام (1–${MAX_REMINDER_DAY}) مفصولة بفواصل، مثال 7,3,1`
  }
  return null
}
