import { db } from '@/lib/db'

/**
 * 🛡️ 2026-10-20 — حماية تسجيل الدخول من التخمين (brute force).
 * بنعدّ المحاولات *الفاشلة* بس، لكل إيميل ولكل IP، في آخر 15 دقيقة.
 * بنخزّن SHA-256 للقيمة مش القيمة نفسها. لو الجدول مش موجود (قبل الـ migration)
 * كل الدوال بتفشل مفتوحة عشان ما نقفلش الدخول على المستخدمين الحقيقيين.
 */
export const LOGIN_WINDOW_MIN = 15
export const LOGIN_MAX_PER_EMAIL = 8
// سخي لأن شبكات الموبايل بتشارك IP واحد (CGNAT)
export const LOGIN_MAX_PER_IP = 40

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function loginKeys(email: string, ip: string | undefined) {
  return {
    emailKey: await sha256Hex(`login-email:${email}`),
    ipKey: ip ? await sha256Hex(`login-ip:${ip}`) : null,
  }
}

async function countFailures(keyHash: string): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM "LoginAttempt"
    WHERE "keyHash" = ${keyHash}
      AND "createdAt" > NOW() - (${LOGIN_WINDOW_MIN} * INTERVAL '1 minute')`
  return Number(rows?.[0]?.n ?? 0)
}

/** true = ممنوع مؤقتًا */
export async function isLoginBlocked(keys: { emailKey: string; ipKey: string | null }): Promise<boolean> {
  try {
    if ((await countFailures(keys.emailKey)) >= LOGIN_MAX_PER_EMAIL) return true
    if (keys.ipKey && (await countFailures(keys.ipKey)) >= LOGIN_MAX_PER_IP) return true
    return false
  } catch (e) {
    console.error('[login-guard] check failed (fail-open):', e)
    return false
  }
}

export async function recordLoginFailure(keys: { emailKey: string; ipKey: string | null }): Promise<void> {
  try {
    await db.$executeRaw`INSERT INTO "LoginAttempt" ("keyHash") VALUES (${keys.emailKey})`
    if (keys.ipKey) await db.$executeRaw`INSERT INTO "LoginAttempt" ("keyHash") VALUES (${keys.ipKey})`
    // تنظيف انتهازي للسجلات القديمة (1% من المرات)
    if (Math.random() < 0.01) {
      await db.$executeRaw`DELETE FROM "LoginAttempt" WHERE "createdAt" < NOW() - INTERVAL '1 day'`
    }
  } catch (e) {
    console.error('[login-guard] record failed (ignored):', e)
  }
}

/** بعد نجاح الدخول نمسح عدّاد الإيميل (مش الـ IP) */
export async function clearLoginFailures(emailKey: string): Promise<void> {
  try {
    await db.$executeRaw`DELETE FROM "LoginAttempt" WHERE "keyHash" = ${emailKey}`
  } catch {
    /* ignore */
  }
}
