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
    // 🛡️ FIX: was `cache: 'default'`, which let the browser answer this
    // from its own HTTP cache (keyed by URL, not by cookie) instead of
    // asking the server. Right after logout that meant this call could
    // still report "logged in" for up to a minute even though the
    // session cookie was already gone — see the Cache-Control note in
    // src/app/api/auth/me/route.ts. `no-store` forces a real network
    // round trip every time, so this always reflects the current cookie.
    const res = await fetch('/api/auth/me', { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.ok) return null
    return data.user as AuthUser
  } catch {
    // ⚡ Offline: try to return cached user from IndexedDB
    // This allows the app to boot offline (showing cached data)
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      try {
        const { idb } = await import('./offline/idb')
        const cached = await idb.getCached<{ user: AuthUser }>('/api/auth/me')
        if (cached?.data?.user) return cached.data.user
      } catch {
        /* ignore */
      }
    }
    return null
  }
}
