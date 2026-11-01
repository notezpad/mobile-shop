/**
 * 🔐 (v26) حماية PIN كشك الحضور — سيرفر فقط.
 *  1) تجزئة v2: HMAC-SHA256 بسر السيرفر (HR_PIN_SECRET أو JWT_SECRET) — لو الداتابيز اتسربت
 *     لوحدها الـ PIN مش بيتكسر بالتخمين (كان SHA-256 بملح معروف: 10^4–10^6 احتمال في ثواني).
 *     الـ PINs القديمة لسه بتشتغل وبتترقّى تلقائياً لـ v2 عند أول دخول صحيح.
 *  2) عدّاد محاولات غلط في الداتابيز (HrPinAttempt) بدل ذاكرة الـ isolate اللي بتتصفّر وبتتوزّع.
 *     العدّ بيحصل **قبل** التحقق (ذرّي) فالمحاولات المتوازية مش بتفلت.
 */
import { readEnv } from '@/lib/env'
import { hashPin as legacyHashPin } from '@/lib/hr'
import { getSql } from '@/lib/sql'

export const PIN_MAX_FAILS = 5
export const PIN_WINDOW_MINUTES = 10

const enc = new TextEncoder()

function pepper(): string {
  const s = readEnv('HR_PIN_SECRET') || readEnv('JWT_SECRET')
  if (s) return s
  if (readEnv('NODE_ENV') === 'development') return 'dev-pin-secret'
  throw new Error('HR_PIN_SECRET/JWT_SECRET is not reachable at runtime')
}

export async function hashPinV2(tenantId: string, employeeId: number, pin: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`hr-pin-v2:${tenantId}:${employeeId}:${pin}`))
  return 'v2:' + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** يتحقق من PIN (v2 أو القديم). upgrade = تجزئة v2 جديدة لو القديم صح (احفظها مكان القديمة). */
export async function verifyPin(
  tenantId: string, employeeId: number, pin: string, stored: string,
): Promise<{ ok: boolean; upgrade?: string }> {
  if (stored.startsWith('v2:')) {
    return { ok: safeEqual(await hashPinV2(tenantId, employeeId, pin), stored) }
  }
  const ok = safeEqual(await legacyHashPin(tenantId, employeeId, pin), stored)
  return ok ? { ok, upgrade: await hashPinV2(tenantId, employeeId, pin) } : { ok }
}

/** يزوّد عدّاد المحاولات (ذرّي) ويرجّع هل الموظف مقفول مؤقتاً. */
export async function pinAttemptBegin(tenantId: string, employeeId: number): Promise<{ locked: boolean }> {
  const sql = getSql()
  const rows = await sql<{ fails: number }[]>`
    INSERT INTO "HrPinAttempt" ("tenantId", "employeeId", "fails", "firstAt")
    VALUES (${tenantId}, ${employeeId}, 1, now())
    ON CONFLICT ("tenantId", "employeeId") DO UPDATE SET
      "fails" = CASE WHEN "HrPinAttempt"."firstAt" > now() - make_interval(mins => ${PIN_WINDOW_MINUTES})
                     THEN "HrPinAttempt"."fails" + 1 ELSE 1 END,
      "firstAt" = CASE WHEN "HrPinAttempt"."firstAt" > now() - make_interval(mins => ${PIN_WINDOW_MINUTES})
                       THEN "HrPinAttempt"."firstAt" ELSE now() END
    RETURNING "fails"`
  return { locked: (rows[0]?.fails ?? 1) > PIN_MAX_FAILS }
}

/** PIN صح → صفّر العدّاد. */
export async function pinAttemptClear(tenantId: string, employeeId: number): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM "HrPinAttempt" WHERE "tenantId" = ${tenantId} AND "employeeId" = ${employeeId}`
}
