'use client'

export interface AuthUser {
  userId: string
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'
  tenantId: string
  branchId?: number | null
}

const RETRYABLE_LOGIN_STATUS = new Set([500, 502, 503, 504])

// 🛡️ PWA OFFLINE ROOT FIX (2026-10-07):
// getMe() عند الأوفلاين كان بيرجع دايماً null — لأن /api/auth/me **عمرها ما
// اتخزنت في IDB** (مفيش حد بيكتبها رغم إن نفس الدالة بتقراها!). النتيجة:
// أي ريفرش أوفلاين → bootState='guest' → طرد للموقع الرئيسي، وضغط "تسجيل
// الدخول" يفشل = "لا كأني في PWA".
//
// الحل الجذري — write-through:
//   1. أي getMe ناجح أونلاين بيكتب نسخة سيشن في IDB فوراً (تحت)
//   2. الأوفلاين يقرأها (TTL 14 يوم) فيفضل المستخدم داخل التطبيق
//   3. الأمان محفوظ: تسجيل خروج/401 حقيقي بيمسح النسخة فوراً
//      (clearLocalAccountData بتمسح كل rows + purgeCachedSession هنا)
const SESSION_IDB_KEY = '/api/auth/me'
const SESSION_OFFLINE_TTL_MS = 14 * 24 * 60 * 60 * 1000

async function cacheSessionSnapshot(user: AuthUser): Promise<void> {
  try {
    const { idb } = await import('./offline/idb')
    await idb.setCached(SESSION_IDB_KEY, { ok: true, user })
  } catch {
    /* ignore */
  }
}

async function purgeCachedSession(): Promise<void> {
  try {
    const { idb } = await import('./offline/idb')
    await idb.purgeRows([SESSION_IDB_KEY])
  } catch {
    /* ignore */
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * ⚡ v10 — أمان تغيير الحساب: مسح كل كاش الداتا المحلي عند دخول/خروج/تسجيل حساب.
 *
 * من v10 الكاش المحلي (ميموري + IDB) بقى بيتخدم للعرض الفوري (SWR)، فلازم
 * لما الحساب يتغيّر نمنع أي بيانات تينانت قديم من تظهر للحساب الجديد على
 * نفس الجهاز. بنمسح: صفوف كاش الـ API + منتجات بحث الـ POS أوفلاين + كاش
 * الميموري — وده مش بيأثر على الـ outbox (كتابات معلقة متتلمسش هنا).
 */
async function clearLocalAccountData(): Promise<void> {
  try {
    const [{ idb }, { clearMemoryApiCache }] = await Promise.all([
      import('./offline/idb'),
      import('./offline/api-offline'),
    ])
    clearMemoryApiCache()
    await idb.clearCache()
    await idb.replaceProducts([])
  } catch {
    /* ignore */
  }
}

export async function apiLogin(
  email: string,
  password: string
): Promise<AuthUser> {
  // 🛡️ 2026-09-27: login is a POST but it's a pure "check credentials"
  // call — retrying it is safe (no data gets created twice), unlike a
  // sale or a product save. Without a retry here, a transient 500 from
  // the edge runtime's cold DB connection (see PERF_FIX_503.md) surfaced
  // straight to the user as "طلب فاشل (500)" even though trying again a
  // second later — once the connection warmed up — worked fine.
  let lastRes: Response | null = null
  let lastData: any = null
  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.ok) {
      // ⚡ v10: حساب جديد → امسح كاش بيانات الحساب القديم فوراً (خلفية)
      void clearLocalAccountData()
      return data.user as AuthUser
    }
    lastRes = res
    lastData = data
    if (!RETRYABLE_LOGIN_STATUS.has(res.status) || attempt === 2) break
    await sleep(400 * (attempt + 1))
  }
  throw new Error(lastData?.error || `فشل تسجيل الدخول${lastRes ? ` (${lastRes.status})` : ''}`)
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
  // ⚡ v10: حساب جديد تماماً → أمان إضافي: مسح أي كاش محلي قديم
  void clearLocalAccountData()
  return data.user as AuthUser
}

export async function apiLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } finally {
    // ⚡ v10: بعد الخروج امسح كاش بيانات الحساب — مفيش بيانات تظهر للي بعده
    // على نفس الجهاز (والـ fetch نفسه مش لازم ينجح عشان نمسح المحلي)
    await clearLocalAccountData()
  }
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
    if (!res.ok) {
      // 🛡️ السيرفر قال بوضوح "مش مسجل" (401 مثلاً) — نلغي أي نسخة سيشن
      // أوفلاين عشان جهاز مشترك ما يرجّعش سيشن قديم بعد خروج حقيقي.
      void purgeCachedSession()
      return null
    }
    const data = await res.json()
    if (!data?.ok) {
      void purgeCachedSession()
      return null
    }
    // ⚡ PWA OFFLINE: write-through — نسخة سيشن في IDB فوراً عشان أي فتح
    // أوفلاين بعدين يلاقي نفسه مسجل دخول (راجع الثوابت فوق).
    void cacheSessionSnapshot(data.user as AuthUser)
    return data.user as AuthUser
  } catch {
    // ⚡ Offline: try to return cached user from IndexedDB
    // This allows the app to boot offline (showing cached data)
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      try {
        const { idb } = await import('./offline/idb')
        const cached = await idb.getCached<{ user: AuthUser }>(SESSION_IDB_KEY)
        if (cached?.data?.user) {
          // TTL أمان: نسخة أقدم من 14 يوم لا تُعتمد — قديمة أكد لازم تسجيل دخول جديد
          if (Date.now() - cached.at < SESSION_OFFLINE_TTL_MS) {
            return cached.data.user
          }
        }
      } catch {
        /* ignore */
      }
    }
    return null
  }
}
