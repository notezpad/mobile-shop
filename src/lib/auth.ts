/**
 * ⚡ SANDBOX DEMO ADAPTER (2026-10-08):
 * النسخة الأصلية تتحقق من جلسة JWT مخزّنة في كوكي (shop_session) بعد تسجيل
 * دخول حقيقي. في بيئة المعاينة هذه مفيش شاشة دخول — اللوحة تُعرض مباشرة،
 * فالجلسة دايماً "سوبر أدمن" تجريبية ثابتة.
 *
 * (النسخة الأصلية كاملة في مستودع الموقع: PBKDF2 + jose JWT + كوكيز.)
 */

import { cookies } from 'next/headers'
import { db } from './db'

const PLATFORM_TENANT_ID = 'platform-tenant'

export type Session = {
  userId: string
  tenantId: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'
  name: string
  email: string
  branchId: number | null
}

/** Demo super-admin session (sandbox preview only). */
const DEMO_SUPER_ADMIN: Session = {
  userId: 'demo-super-admin',
  tenantId: PLATFORM_TENANT_ID,
  role: 'SUPER_ADMIN',
  name: 'أحمد الأدمن',
  email: 'admin@nezam.pos',
  branchId: null,
}

// ─── Password helpers (Web Crypto PBKDF2 — same as production) ──────────────

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEY_LEN = 32
const PBKDF2_DIGEST = 'SHA-256'

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function pbkdf2Derive(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: PBKDF2_DIGEST, salt, iterations: PBKDF2_ITERATIONS },
    key, PBKDF2_KEY_LEN * 8
  )
  return `pbkdf2:${toHex(salt)}:${toHex(new Uint8Array(bits))}`
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return pbkdf2Derive(password, salt)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false
  const salt = Uint8Array.from(parts[1].match(/.{2}/g)!.map(h => parseInt(h, 16)))
  const computed = await pbkdf2Derive(password, salt)
  const a = new TextEncoder().encode(computed)
  const b = new TextEncoder().encode(stored)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// ─── Session (demo: always the super admin) ─────────────────────────────────

export async function createSession(user: {
  id: string
  tenantId: string
  role: string
  name: string
  email: string
  branchId: number | null
}) {
  void user
  /* no-op in demo */
}

export async function getSession(): Promise<Session | null> {
  return DEMO_SUPER_ADMIN
}

export async function clearSession() {
  /* no-op in demo */
}

/** Returns the active subscription for a tenant, or null if none. */
export async function getActiveSubscription(tenantId: string) {
  return db.subscription.findFirst({
    where: { tenantId, status: 'active' },
    orderBy: { endDate: 'desc' },
  })
}

export async function requireActiveSubscription(tenantId: string) {
  void tenantId
  return null
}

export async function requireAuth(): Promise<Session> {
  return DEMO_SUPER_ADMIN
}

export async function requireAdmin(): Promise<Session> {
  return DEMO_SUPER_ADMIN
}

export async function requireSuperAdmin(): Promise<Session> {
  return DEMO_SUPER_ADMIN
}

export async function requireAuthIgnoreSubscription(): Promise<Session> {
  return DEMO_SUPER_ADMIN
}

/** Helper used inside API route handlers to convert auth errors to responses. */
export function authErrorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg === 'UNAUTHORIZED') {
    return { status: 401, body: { error: 'غير مصرح — يرجى تسجيل الدخول' } }
  }
  if (msg === 'FORBIDDEN') {
    return { status: 403, body: { error: 'ممنوع — هذه العملية للمدير فقط' } }
  }
  if (msg === 'TENANT_SUSPENDED') {
    return { status: 403, body: { error: 'هذا المحل موقوف' } }
  }
  if (msg === 'SUBSCRIPTION_EXPIRED') {
    return { status: 402, body: { error: 'اشتراكك منتهي - يرجى التجديد' } }
  }
  if (msg === 'TENANT_NOT_FOUND') {
    return { status: 404, body: { error: 'المحل غير موجود' } }
  }
  return {
    status: 500,
    body: { error: 'حدث خطأ غير متوقع أثناء التحقق من الجلسة — حاول مرة أخرى' },
  }
}

/** Verify a record belongs to the current tenant; returns the record if found or null. */
export async function tenantScoped<T>(
  model: { findUnique: (args: { where: { id: number } }) => Promise<T | null> },
  id: number,
  tenantId: string,
  getTenantId: (r: T) => string | null | undefined
): Promise<T | null> {
  const rec = await model.findUnique({ where: { id } })
  if (!rec) return null
  if (getTenantId(rec) !== tenantId) return null
  return rec
}

/** Start impersonating a tenant (super admin only). */
export async function startImpersonation(tenantId: string) {
  const cookieStore = await cookies()
  cookieStore.set('impersonate_tenant', tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 4,
    path: '/',
  })
}

/** Stop impersonating a tenant. */
export async function stopImpersonation() {
  const cookieStore = await cookies()
  cookieStore.delete('impersonate_tenant')
}

/** Returns the impersonated tenant id if any. */
export async function getImpersonatedTenantId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('impersonate_tenant')?.value ?? null
}

export { PLATFORM_TENANT_ID, db }
