import bcrypt from 'bcryptjs'
import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
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

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 10)
}
export async function verifyPassword(p: string, hash: string) {
  return bcrypt.compare(p, hash)
}

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

  const latestSub = await db.subscription.findFirst({
    where: { tenantId },
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

  // Super admins bypass subscription checks
  if (s.role === 'SUPER_ADMIN') {
    return s
  }

  // Check impersonation: super admin may impersonate a tenant
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get('impersonate_tenant')?.value
  const effectiveTenantId = impersonateId || s.tenantId

  if (impersonateId) {
    return { ...s, tenantId: effectiveTenantId }
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
  return null
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
