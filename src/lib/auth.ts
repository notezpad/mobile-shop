import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { db } from './db'
import { isProductionRuntime, readEnv } from './env'

function getJwtSecret(): Uint8Array {
  const secret = readEnv('JWT_SECRET')

  if (!secret && isProductionRuntime()) {
    throw new Error(
      'JWT_SECRET is not reachable at runtime. Add JWT_SECRET as a Cloudflare Worker runtime secret/variable, then redeploy with --keep-vars.',
    )
  }

  return new TextEncoder().encode(secret || 'dev-secret-change-in-production')
}

const PLATFORM_TENANT_ID = 'platform-tenant'

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
    secure: isProductionRuntime(),
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
}

/** Returns the active subscription for a tenant, or null if none. */
export async function getActiveSubscription(tenantId: string) {
  return db.subscription.findFirst({
    where: { tenantId, status: 'active' },
    orderBy: { endDate: 'desc' },
  })
}

/** Throws 'SUBSCRIPTION_EXPIRED' if tenant has no active subscription. */
export async function requireActiveSubscription(tenantId: string) {
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
    // No subscription on record
    if (tenant.status !== 'active') throw new Error('SUBSCRIPTION_EXPIRED')
    // Allow if tenant marked active but no subscription yet (legacy)
    return null
  }

  const now = new Date()
  if (latestSub.endDate < now && latestSub.status === 'active') {
    // Auto-expire
    await db.subscription.update({
      where: { id: latestSub.id },
      data: { status: 'expired' },
    })
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: 'expired' },
    })
    throw new Error('SUBSCRIPTION_EXPIRED')
  }
  if (latestSub.endDate < now) {
    throw new Error('SUBSCRIPTION_EXPIRED')
  }
  if (tenant.status === 'expired') {
    throw new Error('SUBSCRIPTION_EXPIRED')
  }
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

  // If impersonating, ensure the real session is a super admin
  // (handled at impersonation start; here we trust the cookie)
  if (impersonateId) {
    // Allow access to impersonated tenant without subscription check
    // so the super admin can see the tenant's state even if expired
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
    secure: isProductionRuntime(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 4, // 4 hours
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
