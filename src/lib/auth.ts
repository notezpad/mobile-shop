// bcryptjs kept only for verifying legacy hashes (existing users).
// New hashes use Web Crypto PBKDF2 — zero CPU overhead on Workers.
import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { countableSubWhere } from '@/lib/subscription-status'
import { db } from './db'
import { isProductionRuntime, readEnv } from './env'

function getJwtSecret(): Uint8Array {
  const secret = readEnv('JWT_SECRET')

  if (secret) {
    return new TextEncoder().encode(secret)
  }

  // SECURITY: only ever fall back to the hardcoded dev secret when we can
  // positively confirm this is a local development run (NODE_ENV === 'development').
  // Previously this fell back for ANY non-production runtime — including
  // staging/preview deployments that don't happen to set NODE_ENV=production —
  // which would silently sign/verify session tokens with a secret visible in
  // the source code. Anywhere that isn't explicitly 'development' now fails loudly.
  if (readEnv('NODE_ENV') === 'development') {
    console.warn(
      '[auth] JWT_SECRET not set — using an insecure hardcoded development secret. ' +
      'This must NEVER happen in a deployed environment.',
    )
    return new TextEncoder().encode('dev-secret-change-in-production')
  }

  throw new Error(
    'JWT_SECRET is not reachable at runtime. Add JWT_SECRET as a Cloudflare Worker runtime secret/variable, then redeploy with --keep-vars.',
  )
}

const PLATFORM_TENANT_ID = 'platform-tenant'

async function isRequestSecure(): Promise<boolean> {
  try {
    const h = await headers()
    const proto = h.get('x-forwarded-proto')
    if (proto) {
      return proto.split(',')[0].trim().toLowerCase() === 'https'
    }
  } catch {
    /* headers() unavailable outside request scope — fall through */
  }
  return isProductionRuntime()
}

export type Session = {
  userId: string
  tenantId: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'
  name: string
  email: string
  branchId: number | null
}

// ─── Password helpers (Web Crypto PBKDF2) ────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEY_LEN = 32 // bytes (256 bits)
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
  // Legacy bcrypt hash — dynamically import to avoid loading it on every request
  if (stored.startsWith('$2')) {
    const bcrypt = await import('bcryptjs')
    return bcrypt.compare(password, stored)
  }
  // PBKDF2 format: "pbkdf2:<saltHex>:<hashHex>"
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false
  const salt = Uint8Array.from(parts[1].match(/.{2}/g)!.map(h => parseInt(h, 16)))
  const computed = await pbkdf2Derive(password, salt)
  // Constant-time comparison
  const a = new TextEncoder().encode(computed)
  const b = new TextEncoder().encode(stored)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// ─────────────────────────────────────────────────────────────────────────────

export async function createSession(user: {
  id: string
  tenantId: string
  role: string
  name: string
  email: string
  branchId: number | null
}) {
  const token = await new SignJWT({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
    email: user.email,
    branchId: user.branchId ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret())
  const cookieStore = await cookies()
  cookieStore.set('shop_session', token, {
    httpOnly: true,
    secure: await isRequestSecure(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('shop_session')?.value
  if (!token) return null
  try {
    const { payload: decoded } = await jwtVerify(token, getJwtSecret())
    return {
      userId: decoded.userId as string,
      tenantId: decoded.tenantId as string,
      role: decoded.role as Session['role'],
      name: decoded.name as string,
      email: decoded.email as string,
      branchId: (decoded.branchId as number | null) ?? null,
    }
  } catch {
    return null
  }
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete('shop_session')
  cookieStore.delete('impersonate_tenant')
  cookieStore.delete('sub_ok')
}

/** Returns the active subscription for a tenant, or null if none. */
export async function getActiveSubscription(tenantId: string) {
  return db.subscription.findFirst({
    where: { tenantId, status: 'active' },
    orderBy: { endDate: 'desc' },
  })
}

/**
 * FIXED: requireActiveSubscription previously ran 2-3 sequential DB queries
 * on EVERY API request (tenant lookup → subscription lookup → optional updates).
 * Now we use a short-lived cookie `sub_ok` as a request-level cache:
 * - On first check, run the full DB validation and set the cookie (TTL: 5 min).
 * - On subsequent requests within 5 min, trust the cookie and skip DB queries.
 * - On subscription expiry/admin actions, clear the cookie explicitly.
 *
 * This trades off: a subscription could take up to 5 min to "expire" after
 * the DB record changes, which is an acceptable trade-off for a B2B POS.
 */
export async function requireActiveSubscription(tenantId: string) {
  const cookieStore = await cookies()

  // Fast path: sub_ok cookie present → skip all DB queries
  const subOk = cookieStore.get('sub_ok')?.value
  if (subOk === tenantId) return null

  // Slow path: validate subscription from DB
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true },
  })
  if (!tenant) throw new Error('TENANT_NOT_FOUND')

  if (
    tenant.status === 'suspended' ||
    tenant.status === 'cancelled'
  ) {
    throw new Error('TENANT_SUSPENDED')
  }

  // 🛡️ 2026-09-27: ONLY count real subscriptions. A 'pending' row created
  // when the user merely opened the Paymob checkout must never grant access.
  const latestSub = await db.subscription.findFirst({
    where: { tenantId, ...countableSubWhere },
    orderBy: { endDate: 'desc' },
  })

  if (!latestSub) {
    if (tenant.status !== 'active') throw new Error('SUBSCRIPTION_EXPIRED')
    // Allow if tenant marked active but no subscription yet (legacy)
    // Set sub_ok so we don't re-query for the next 5 minutes
    cookieStore.set('sub_ok', tenantId, {
      httpOnly: true,
      secure: await isRequestSecure(),
      sameSite: 'lax',
      maxAge: 300, // 5 minutes
      path: '/',
    })
    return null
  }

  const now = new Date()
  if (latestSub.endDate < now && latestSub.status === 'active') {
    // Auto-expire — run both updates in parallel
    await Promise.all([
      db.subscription.update({
        where: { id: latestSub.id },
        data: { status: 'expired' },
      }),
      db.tenant.update({
        where: { id: tenantId },
        data: { status: 'expired' },
      }),
    ])
    cookieStore.delete('sub_ok')
    throw new Error('SUBSCRIPTION_EXPIRED')
  }
  if (latestSub.endDate < now) {
    throw new Error('SUBSCRIPTION_EXPIRED')
  }
  if (tenant.status === 'expired') {
    throw new Error('SUBSCRIPTION_EXPIRED')
  }

  // Subscription is valid — cache for 5 minutes to avoid DB hit on every request
  cookieStore.set('sub_ok', tenantId, {
    httpOnly: true,
    secure: await isRequestSecure(),
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
    path: '/',
  })

  return latestSub
}

export async function requireAuth(): Promise<Session> {
  const s = await getSession()
  if (!s) throw new Error('UNAUTHORIZED')

  // 🛡️ 2026-09-17 (v2): Check impersonation BEFORE the super admin bypass.
  // Previously: the super admin bypass was BEFORE the impersonation check,
  // so when impersonating, the session still had tenantId = 'platform-tenant'.
  // All shop APIs (products, sales, tenant settings) were hitting against
  // the platform-tenant (empty/locked) instead of the impersonated tenant.
  // This also caused a security issue: PUT /api/tenant could modify the
  // platform-tenant's own data while impersonating.
  //
  // Fix: read the impersonate_tenant cookie FIRST. If set, swap the
  // tenantId in the session (for both super admin AND normal users).
  // The super admin bypass for subscription checks still applies, but
  // with the swapped tenantId.
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get('impersonate_tenant')?.value

  if (impersonateId) {
    // Swap the tenantId for this request — all subsequent API calls
    // (db queries, tenant settings, etc.) will operate against the
    // impersonated tenant, not the platform-tenant.
    return { ...s, tenantId: impersonateId }
  }

  // Super admins bypass subscription checks (only when NOT impersonating)
  if (s.role === 'SUPER_ADMIN') {
    return s
  }

  // Enforce subscription for normal users
  await requireActiveSubscription(s.tenantId)
  return s
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireAuth()
  if (s.role !== 'ADMIN' && s.role !== 'SUPER_ADMIN') throw new Error('FORBIDDEN')
  return s
}

export async function requireSuperAdmin(): Promise<Session> {
  const s = await requireAuth()
  if (s.role !== 'SUPER_ADMIN') throw new Error('FORBIDDEN')
  return s
}

/**
 * 🛡️ 2026-09-21 — Soft auth: returns the session without enforcing an
 * active subscription.
 *
 * Use this for endpoints that the user must be able to reach EVEN WHEN
 * their subscription is expired — e.g. /api/subscription (so the user
 * can see their expired status), /api/tenant (so they can open the
 * Settings page and redeem a code).
 *
 * Behavior:
 *   - Throws UNAUTHORIZED (401) if not logged in
 *   - Handles impersonation (same as requireAuth)
 *   - Super admins bypass (same as requireAuth)
 *   - Does NOT call requireActiveSubscription
 */
export async function requireAuthIgnoreSubscription(): Promise<Session> {
  const s = await getSession()
  if (!s) throw new Error('UNAUTHORIZED')

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get('impersonate_tenant')?.value

  if (impersonateId) {
    return { ...s, tenantId: impersonateId }
  }

  return s
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
  // 🛡️ 2026-10-07 (v17): كانت بترجع null هنا — وكل الـ routes كانت تعمل
  // `NextResponse.json(err?.body, { status: err?.status })` فيتحول الرد
  // لـ 200 بجسم فاضي! العميل بيحاول يقرأ JSON فاضي فيفشل بهدوء، وصفحات
  // زي دفتر الحركات بتظهر فاضية تماماً كأن البيانات "اتمسحت" — من غير
  // أي رسالة خطأ توصل للمستخدم. دلوقتي أي خطأ تحقق غير معروف = 500
  // حقيقي بجسم JSON واضح، فالواجهة بتقدر تعرض سبب الفشل وزر إعادة محاولة.
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
    secure: await isRequestSecure(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 4, // 4 hours
    path: '/',
  })
  cookieStore.delete('sub_ok') // clear subscription cache when switching tenant
}

/** Stop impersonating a tenant. */
export async function stopImpersonation() {
  const cookieStore = await cookies()
  cookieStore.delete('impersonate_tenant')
  cookieStore.delete('sub_ok')
}

/** Returns the impersonated tenant id if any. */
export async function getImpersonatedTenantId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('impersonate_tenant')?.value ?? null
}

export { PLATFORM_TENANT_ID, db }
