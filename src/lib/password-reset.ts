import { db } from '@/lib/db'

/**
 * 🔑 2026-10-24 — استعادة كلمة المرور.
 * - التوكن عشوائي 256-bit، بيتبعت في الإيميل بس؛ في الداتابيز بنخزّن SHA-256 له.
 * - صلاحية 30 دقيقة ومرة واحدة.
 * - حد الطلبات بيستخدم جدول LoginAttempt (مفاتيح بـ prefix مختلف عن الدخول):
 *   بنعدّ *كل* الطلبات (حتى لو الإيميل مش موجود) عشان ما نكشفش وجوده.
 * - لو الجدول مش موجود (قبل الـ migration) الفحص بيفشل مفتوح.
 */
export const RESET_TTL_MIN = 30
export const RESET_WINDOW_MIN = 60
export const RESET_MAX_PER_EMAIL = 3
export const RESET_MAX_PER_IP = 10
export const RESET_CONFIRM_MAX_FAIL_PER_IP = 20

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function newResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const isValidTokenShape = (t: unknown): t is string =>
  typeof t === 'string' && /^[a-f0-9]{64}$/.test(t)

export const hashResetToken = (token: string) => sha256Hex(`pw-reset:${token}`)

export async function resetRequestKeys(email: string, ip: string | undefined) {
  return {
    emailKey: await sha256Hex(`reset-email:${email}`),
    ipKey: ip ? await sha256Hex(`reset-ip:${ip}`) : null,
  }
}

export async function confirmFailKey(ip: string | undefined): Promise<string | null> {
  return ip ? sha256Hex(`reset-confirm-ip:${ip}`) : null
}

async function countRecent(keyHash: string): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM "LoginAttempt"
    WHERE "keyHash" = ${keyHash}
      AND "createdAt" > NOW() - (${RESET_WINDOW_MIN} * INTERVAL '1 minute')`
  return Number(rows?.[0]?.n ?? 0)
}

/** true = ممنوع مؤقتًا */
export async function isResetRequestBlocked(keys: { emailKey: string; ipKey: string | null }): Promise<boolean> {
  try {
    if ((await countRecent(keys.emailKey)) >= RESET_MAX_PER_EMAIL) return true
    if (keys.ipKey && (await countRecent(keys.ipKey)) >= RESET_MAX_PER_IP) return true
    return false
  } catch (e) {
    console.error('[password-reset] limit check failed (fail-open):', e)
    return false
  }
}

export async function recordAttempt(...keyHashes: (string | null)[]): Promise<void> {
  try {
    for (const k of keyHashes) {
      if (k) await db.$executeRaw`INSERT INTO "LoginAttempt" ("keyHash") VALUES (${k})`
    }
  } catch (e) {
    console.error('[password-reset] record failed (ignored):', e)
  }
}

export async function isConfirmBlocked(ipKey: string | null): Promise<boolean> {
  if (!ipKey) return false
  try {
    return (await countRecent(ipKey)) >= RESET_CONFIRM_MAX_FAIL_PER_IP
  } catch {
    return false
  }
}
