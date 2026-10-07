'use client'

import { idb } from './offline/idb'

export interface AuthUser {
  userId: string
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'
  tenantId: string
  branchId?: number | null
}

const RETRYABLE_LOGIN_STATUS = new Set([500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ══════════════════════════════════════════════════════════════
   🛡️ PWA ROOT FIX (2026-10-07) — «السيشن تعيش محلياً»
   ══════════════════════════════════════════════════════════════
   المشكلة الجذرية اللي كانت بتخلّي PWA «ما تشتغلش» أوفلاين:
   getMe() كان عنده fallback بيقرأ نسخة السيشن من IndexedDB تحت
   المفتاح '/api/auth/me' — لكن لا يوجد أي كود في المشروع كله
   يكتب هذا المفتاح أصلاً! (الـ SW يستبعد /api/auth/* عمداً، و
   prewarm ما كانش يتضمنه) → أي فتح/refresh أوفلاين كان بيرجع
   null → الـ layout بيعتبرك زائر → طرد للرئيسية → تسجيل دخول
   بيفشل «لا يوجد إنترنت» — كأن مفيش PWA خالص.

   الحل الجذري:
   1) كل تأكيد سيشن ناجح (getMe / apiLogin) بيكتب نسخة السيشن في IDB.
   2) عند فشل الشبكة getMe() بيرجّع النسخة المحفوظة → النظام يفتح
      أوفلاين وبيانات الكاش شغالة عادي.
   3) عند 401 حقيقي أو logout بنمسح النسخة — فمفيش رجوع لحساب
      منتهي ولا تسريب لمستخدم تاني على نفس الجهاز.
   4) تتبع سبب فشل getMe (getMeOutcome) عشان الـ layout يفرّق بين
      «السيرفر قال غير مسجل» و«النت مقطوع» — الأول يطرد للدخول
      طبيعي، والتاني يعرض شاشة أوفلاين بدل الطرد المكسور.

   ⚠️ ملاحظة أمان: النسخة المحفوظة تحمل هوية المستخدم فقط (الاسم/
   الإيميل/الدور/tenantId) — لا كلمة مرور ولا كوكيز. وبتمسح عند
   logout وعند أول 401 من السيرفر، وحتى لو اتستخدمت أوفلاين بعد
   انتهاء سيشن حقيقية، أول استدعاء API لما يرجع النت هيرجع 401
   → SessionGuard بيمسحها فوراً ويطرد للدخول.
   ══════════════════════════════════════════════════════════════ */

const ME_SNAPSHOT_URL = '/api/auth/me'

/** سبب آخر نتيجة لـ getMe() — بيقرأه (shop)/layout.tsx عند فشل السيشن. */
export type MeOutcome = 'authed' | 'unauthorized' | 'offline' | 'error'
let lastMeOutcome: MeOutcome = 'error'
export function getMeOutcome(): MeOutcome {
  return lastMeOutcome
}

/** كتابة نسخة السيشن محلياً (IndexedDB) — تُستدعى عند كل دخول ناجح. */
export async function saveAuthSnapshot(user: AuthUser): Promise<void> {
  // 🛡️ PWA: استيراد ثابت (مش dynamic import) — الـ dynamic import كان
  // بيمسك إقلاع الأوفلاين كله في dev/Turbopack (تحميل الـ lazy chunk
  // بيحتاج الـ runtime/HMR اللي ميت أوفلاين)، وفي الإنتاج كمان بنشيل
  // أي اعتماد على جلب chunk في اللحظة الحرجة. الوحدة صغيرة — التكلفة صفر.
  try {
    await idb.setCached(ME_SNAPSHOT_URL, { ok: true, user })
  } catch {
    /* IDB غير متاح — الأوفلاين مش هيشتغل لكن النظام أونلاين سليم */
  }
}

/** مسح نسخة السيشن المحفوظة — عند logout أو 401 حقيقي. */
export async function clearAuthSnapshot(): Promise<void> {
  try {
    await idb.removeCached(ME_SNAPSHOT_URL)
  } catch {
    /* ignore */
  }
}

/** قراءة الحساب المحفوظ أوفلاين (لصفحة الدخول: «الدخول بالحساب المحفوظ»). */
export async function getOfflineUser(): Promise<AuthUser | null> {
  try {
    const cached = await idb.getCached<{ user: AuthUser }>(ME_SNAPSHOT_URL)
    return cached?.data?.user ?? null
  } catch {
    return null
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
      // 🛡️ PWA: احفظ نسخة السيشن فوراً عند نجاح الدخول — لو المستخدم قفل
      // التطبيق وفتحه أوفلاين بعدها بيرجع للنظام من غير ما يتحطّم.
      void saveAuthSnapshot(data.user as AuthUser)
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
  void saveAuthSnapshot(data.user as AuthUser)
  return data.user as AuthUser
}

export async function apiLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    /* أوفلاين: طلب الخروج فشل — نمسح النسخة المحلية برضه (تحت) */
  }
  // 🛡️ PWA: الخروج = مسح النسخة المحفوظة دايماً — حتى لو طلب الخروج نفسه
  // فشل أوفلاين، نية المستخدم واضحة: مفيش حساب محفوظ على الجهاز ده.
  await clearAuthSnapshot()
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
      // 401 = السيرفر وصل وقال بوضوح «السيشن انتهت» → نمسح النسخة المحلية
      // عشان سيشن منتهية/مستخدم تاني ميرجعش أوفلاين.
      if (res.status === 401) {
        lastMeOutcome = 'unauthorized'
        void clearAuthSnapshot()
        return null
      }
      // 🛡️ PWA ROOT FIX (2026-10-07): 5xx من الإيدج/السيرفر (502/503/504
      // — شائعة جداً على موبايل «متصفح لكن الخادم ماشي») = نتعامل معها
      // زي الأوفلاين بالظبط: نرجّع النسخة المحفوظة عشان المستخدم ماتطردش
      // من النظام بسبب خطأ لحظي مش بسبب سيشن منتهية.
      if (res.status >= 500) {
        lastMeOutcome = 'offline'
        const cached = await idb.getCached<{ user: AuthUser }>(ME_SNAPSHOT_URL)
        return cached?.data?.user ?? null
      }
      lastMeOutcome = 'error'
      return null
    }
    const data = await res.json()
    if (!data?.ok || !data.user) {
      lastMeOutcome = 'error'
      return null
    }
    lastMeOutcome = 'authed'
    // 🛡️ PWA: كل تأكيد سيشن ناجح = نسخة محفوظة جديدة. دي الحلقة اللي كانت
    // ناقصة تماماً — من غيرها fallback الأوفلاين كان بيقرأ خزانة فاضية.
    void saveAuthSnapshot(data.user as AuthUser)
    return data.user as AuthUser
  } catch {
    // ⚡ Offline (الشبكة فشلت — مش السيرفر رفض): نرجّع نسخة السيشن المحفوظة
    // من IndexedDB. دي اللي بتخلي النظام يفتح أوفلاين ويشتغل بكاش البيانات.
    lastMeOutcome = 'offline'
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      try {
        const cached = await idb.getCached<{ user: AuthUser }>(ME_SNAPSHOT_URL)
        if (cached?.data?.user) return cached.data.user
      } catch {
        /* ignore */
      }
    }
    return null
  }
}
