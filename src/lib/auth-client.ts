'use client'

export interface AuthUser {
  userId: string
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'
  tenantId: string
  branchId?: number | null
}

export async function apiLogin(
  email: string,
  password: string
): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'فشل تسجيل الدخول')
  }
  return data.user as AuthUser
}

export async function apiSignup(input: {
  shopName: string
  name: string
  email: string
  phone?: string
  password: string
}): Promise<AuthUser> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, agree: true }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'فشل إنشاء الحساب')
  }
  return data.user as AuthUser
}

export async function apiLogout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.ok) return null
    return data.user as AuthUser
  } catch {
    return null
  }
}
