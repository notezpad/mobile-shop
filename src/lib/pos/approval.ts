/**
 * Manager PIN — server side only.
 * One PIN per shop (stored hashed on Tenant). Five wrong tries lock approvals for 15 minutes,
 * so a cashier can't brute-force a 4-digit PIN through the sale/return endpoints.
 */
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { PIN_LOCK_MS, PIN_MAX_FAILS, isValidPin, type PinFailure } from './pricing'

export async function verifyManagerPin(tenantId: string, pin: unknown): Promise<{ ok: true } | PinFailure> {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { posManagerPinHash: true, posPinFailCount: true, posPinLockedUntil: true },
  })
  if (!t?.posManagerPinHash) {
    return { ok: false, code: 'APPROVAL_NO_PIN', error: 'مفيش PIN للمدير متسجّل — اطلب من المدير يحدده من إعدادات نقطة البيع' }
  }
  if (t.posPinLockedUntil && t.posPinLockedUntil.getTime() > Date.now()) {
    return { ok: false, code: 'APPROVAL_LOCKED', error: 'المحاولات كتير — الموافقة مقفولة مؤقتاً، جرّب بعد شوية', lockedUntil: t.posPinLockedUntil }
  }
  if (!isValidPin(pin)) {
    return { ok: false, code: 'APPROVAL_INVALID', error: 'PIN غير صحيح' }
  }

  if (await verifyPassword(pin, t.posManagerPinHash)) {
    if (t.posPinFailCount > 0 || t.posPinLockedUntil) {
      await db.tenant.update({ where: { id: tenantId }, data: { posPinFailCount: 0, posPinLockedUntil: null } })
    }
    return { ok: true }
  }

  // Atomic increment so parallel guesses can't dodge the counter.
  const updated = await db.tenant.update({
    where: { id: tenantId },
    data: { posPinFailCount: { increment: 1 } },
    select: { posPinFailCount: true },
  })
  if (updated.posPinFailCount >= PIN_MAX_FAILS) {
    const lockedUntil = new Date(Date.now() + PIN_LOCK_MS)
    await db.tenant.update({ where: { id: tenantId }, data: { posPinFailCount: 0, posPinLockedUntil: lockedUntil } })
    return { ok: false, code: 'APPROVAL_LOCKED', error: 'المحاولات كتير — الموافقة مقفولة 15 دقيقة', lockedUntil }
  }
  return { ok: false, code: 'APPROVAL_INVALID', error: 'PIN غير صحيح', remaining: PIN_MAX_FAILS - updated.posPinFailCount }
}

export async function setManagerPin(tenantId: string, pin: string | null) {
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      posManagerPinHash: pin === null ? null : await hashPassword(pin),
      posPinFailCount: 0,
      posPinLockedUntil: null,
    },
  })
}
