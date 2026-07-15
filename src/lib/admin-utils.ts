import { db } from './db'

const PLATFORM_TENANT_ID = 'platform-tenant'

/** Random password generator (8 chars, safe alphabet). */
export function randomPassword(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz'
  let out = ''
  const buf = new Uint32Array(length)
  // Use crypto when available
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf)
    for (let i = 0; i < length; i++) {
      out += alphabet[buf[i] % alphabet.length]
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
  }
  return out
}

/** Random code generator (default 12 chars, safe alphabet). */
export function randomCode(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const buf = new Uint32Array(length)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf)
    for (let i = 0; i < length; i++) {
      out += alphabet[buf[i] % alphabet.length]
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
  }
  return out
}

/** Compute the end date for a subscription given a period + plan. */
export function computeEndDate(
  startDate: Date,
  period: 'monthly' | 'yearly' | 'trial',
  trialDays: number
): Date {
  const end = new Date(startDate)
  if (period === 'monthly') {
    end.setDate(end.getDate() + 30)
  } else if (period === 'yearly') {
    end.setDate(end.getDate() + 365)
  } else {
    end.setDate(end.getDate() + (trialDays || 14))
  }
  return end
}

/** Default amount based on plan + period (zero for trial). */
export function computeAmount(
  plan: { priceMonthly: number; priceYearly: number },
  period: 'monthly' | 'yearly' | 'trial',
  override?: number
): number {
  if (override !== undefined && !Number.isNaN(override)) return Number(override)
  if (period === 'monthly') return plan.priceMonthly
  if (period === 'yearly') return plan.priceYearly
  return 0
}

export { PLATFORM_TENANT_ID, db }
