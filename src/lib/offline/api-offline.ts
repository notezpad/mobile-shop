/**
 * Offline-aware API wrapper.
 *
 * GET strategy:
 *   1. Try fetch from server (online)
 *   2. On success → cache in IDB + return data
 *   3. On ANY failure → try cached response from IDB
 *   4. If no cache → try local IndexedDB query (products only)
 *   5. If still nothing → throw friendly error
 *
 * Write strategy:
 *   1. Try fetch from server (online)
 *   2. On success → return server response
 *   3. On network failure → queue in outbox + return optimistic success
 *   4. On server error (4xx/5xx) → throw to client
 *
 * Special: GET /api/products?search=X when offline
 *   → search IndexedDB 'products' store instead of API
 */

import { idb, idbAvailable, onOutboxChange, type OutboxEntry } from './idb'
import { emitDataChanged } from './data-events'

/**
 * 🛡️ FIX: global "session is actually gone" signal.
 *
 * Before this: when the session expired (or logout raced ahead of an
 * in-flight request — see the Cache-Control fix in
 * src/app/api/auth/me/route.ts), the app kept the authed dashboard mounted
 * and just let EVERY individual widget (dashboard, products, sales...)
 * independently hit a real 401 and show its own "غير مصرح — يرجى تسجيل
 * الدخول" toast, while their data emptied out one by one. Nothing actually
 * moved the app to the login screen, so the user was stuck looking at a
 * half-broken authed page and had to mash the logout button repeatedly
 * hoping something would eventually take.
 *
 * Now: the first real 401 from any API call fires this event once. A
 * listener (SessionGuard, mounted near the app root) clears the local
 * `user` in the store, which the existing boot logic in
 * src/app/(shop)/layout.tsx and src/app/page.tsx already watches — it
 * immediately redirects to the login page instead of leaving a stale,
 * half-empty dashboard on screen.
 */
let unauthorizedNotifiedAt = 0
function notifySessionExpired() {
  if (typeof window === 'undefined') return
  // Debounce: a page can fire several requests at once that all 401
  // together (dashboard + products + notifications...) — only the first
  // needs to trigger the redirect.
  const now = Date.now()
  if (now - unauthorizedNotifiedAt < 1000) return
  unauthorizedNotifiedAt = now
  window.dispatchEvent(new CustomEvent('shop:session-expired'))
}

/**
 * PERF / RELIABILITY FIX (2026-09-25)
 *
 * The app showed random red "فشل 500 / فشل 503" errors. Those statuses come
 * from the edge runtime when a database connection cannot be opened in time —
 * they are transient. Two safeguards are added here:
 *
 *  1. fetchWithRetry: retries GET requests up to 2 extra times with a short
 *     backoff on 500/502/503/504 and on network errors, and aborts a request
 *     that hangs longer than 20s instead of leaving the page spinning.
 *  2. in-flight de-duplication: identical concurrent GETs share one request,
 *     so a page that mounts several widgets pointing at the same endpoint no
 *     longer multiplies server load.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const REQUEST_TIMEOUT_MS = 20000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries: number,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(400 * (attempt + 1))
        continue
      }
      return res
    } catch (err) {
      lastError = err
      // A caller-triggered abort must not be retried.
      if (signal?.aborted) throw err
      if (attempt >= retries) throw err
      await sleep(400 * (attempt + 1))
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }

  throw lastError ?? new Error('طلب فاشل')
}

const inFlightGets = getInFlight()

/**
 * ⚡ v10: التخزين على globalThis مش module-scope — لأن الـ bundler بيضمّن
 * نسخ متعددة من الموديول ده في chunks مختلفة (كل dynamic import boundary
 * بياخد نسخة)، وكل نسخة كانت هتبقى ليها كاش منفصل = الكاش مش هيتبادل
 * بين الـ views خالص. globalThis = instance واحدة حقيقية مهما كان عدد النسخ.
 */
type SwrStore = {
  mem: Map<string, { data: any; at: number }>
  revalidating: Set<string>
  inFlight: Map<string, Promise<any>>
  invalidatedAt: number
}
function getStore(): SwrStore {
  const g = globalThis as any
  if (!g.__nezamSwrStore) {
    g.__nezamSwrStore = {
      mem: new Map(),
      revalidating: new Set(),
      inFlight: new Map(),
      invalidatedAt: 0,
    } as SwrStore
  }
  return g.__nezamSwrStore as SwrStore
}
function getInFlight(): Map<string, Promise<any>> {
  return getStore().inFlight
}

/**
 * ⚡ v10 — SWR (stale-while-revalidate) memory layer — "سرعة workeros"
 * ─────────────────────────────────────────────────────────────────────
 * قبل كده: كل فتح صفحة = انتظار الشبكة بالكامل حتى لو النسخة المخزنة طازة
 * (network-first دايماً) — عشان كده كل صفحة كانت بتعرض سبينر/سكيليتون
 * في كل زيارة، والتطبيق المرجعي (workeros / TanStack Query) بيفرق عنه
 * بمراحل: بيرسم الداتا من الكاش في الميموري لحظياً وبيحدّث في الخلفية.
 *
 * دلوقتي: الـ GETs المسموح ليها (اللسته تحت) لو فيها نسخة طازة (أقل من
 * نافذة الطزاجة بتاعتها) بترجع فوراً من الميموري (بدون أي انتظار) +
 * بنبدأ تحديث خلفي صامت للنسخة الجاية. لو مفيش في الميموري (reload
 * مثلاً) بنجرب IDB (بتالحافة المخزنة) — ولسه أسرع بكتير من الشبكة.
 *
 * قواعد الصحة:
 *  - أي كتابة ناجحة (أو حتى متصفة أوفلاين في الـ outbox) بتمسح كل كاش
 *    الـ API (الميموري + صفوف IDB) — فبعد أي إضافة/تعديل/حذف التحديث
 *    الجاي بيروح للشبكة دايماً، ومفيش بيانات قديمة تتع بعد mutation.
 *  - مسارات الحساسات (auth/subscription/payments/admin) مستثناة خالص —
 *    بتتكلم مع الشبكة دايماً زي الأول.
 *  - أي GET فيه نص بحث مش فاضي مستثنى — نتايج الكتابة لازم تكون حية.
 */
const memCache = {
  get: (k: string) => getStore().mem.get(k),
  set: (k: string, v: { data: any; at: number }) => getStore().mem.set(k, v),
  delete: (k: string) => getStore().mem.delete(k),
  clear: () => getStore().mem.clear(),
  get size() { return getStore().mem.size },
  keys: () => getStore().mem.keys(),
}
const MEM_CACHE_MAX = 80
/**
 * طابع زمني آخر إبطال — بيرفع أمان مسح IDB اللي بيحصل async: أي صف
 * في IDB وقت كتابته (at) أقدم من الطباع ده بيتتجاهل حتى لو "طازة" —
 * ده بيمنع الـ race اللي ممكن الـ GET بعد الـ mutation يقرا الصف القديم
 * قبل ما الـ purge يخلص.
 */
/**
 * طابع زمني آخر إبطال — بيرفع أمان مسح IDB اللي بيحصل async: أي صف
 * في IDB وقت كتابته (at) أقدم من الطباع ده بيتتجاهل حتى لو "طازة" —
 * ده بيمنع الـ race اللي ممكن الـ GET بعد الـ mutation يقرا الصف القديم
 * قبل ما الـ purge يخلص. (متخزن في الـ store المشترك — كل النسخ تشوفه)
 */
function getInvalidatedAt(): number {
  return getStore().invalidatedAt
}

/** مسارات الـ API اللي بنتكاشها (بيتمسحوا كلهم بعد أي كتابة) */
const API_CACHE_PREFIXES = [
  '/api/dashboard',
  '/api/products',
  '/api/customers',
  '/api/suppliers',
  '/api/categories',
  '/api/sales',
  '/api/expenses',
  '/api/cash',
  '/api/tenant',
]

/**
 * نافذة الطزاجة (ms) لكل endpoint. ترجع null = ممنوع يُخدم من الكاش
 * (network-first زي ما هو) — نفس فلسفة staleTime في TanStack Query
 * عند workeros (15 ثانية → 3 دقائق).
 */
function swrFreshMs(url: string): number | null {
  const qIndex = url.indexOf('?')
  const path = qIndex === -1 ? url : url.slice(0, qIndex)
  // مستثناات أمان — قرارات حساسة لازم دايماً شبكة حية
  if (path.startsWith('/api/auth')) return null
  if (path.startsWith('/api/subscription')) return null
  if (path.startsWith('/api/pay')) return null
  if (path.startsWith('/api/admin')) return null
  if (path.startsWith('/api/upload')) return null
  // نص بحث فعلي (مش فاضي) → نتايج حية دايماً
  if (/[?&]search=[^&]/.test(url)) return null
  if (path === '/api/categories') return 60_000
  if (path === '/api/tenant') return 60_000
  if (path === '/api/suppliers') return 30_000
  if (path === '/api/dashboard') return 30_000
  if (path === '/api/products') return 20_000
  if (path === '/api/customers') return 15_000
  if (path === '/api/sales') return 15_000
  if (path === '/api/expenses') return 15_000
  if (path === '/api/cash') return 15_000
  return null
}

/** تحديث خلفي صامت — يعبّي الميموري + IDB للنسخة الجاية بدون ما حد يستنى */
async function revalidateGet(url: string): Promise<void> {
  if (getStore().revalidating.has(url)) return
  if (!isOnline()) return
  getStore().revalidating.add(url)
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' })
    if (!res.ok) return
    const text = await res.text()
    let data: any = null
    if (text) {
      try { data = JSON.parse(text) } catch { data = text }
    }
    memCache.set(url, { data, at: Date.now() })
    void idb.setCached(url, data).catch(() => {})
  } catch {
    // فشل صامت — النسخة القديمة تفضل صالحة للزيارة الجاية
  } finally {
    getStore().revalidating.delete(url)
  }
}

/** مسح كاش الميموري (يُستدعى من auth-client عند تغيير الحساب أيضاً) */
export function clearMemoryApiCache(): void {
  memCache.clear()
}

/**
 * بعد أي كتابة ناجحة (أو متصفة أوفلاين): نمسح كل كاش الـ API —
 * التحديث الجاي بعد mutation بيكلم الشبكة دايماً (نفس فكرة purge
 * الخادمي في src/lib/edgeCache.ts من v9 — الكتابة الواحدة بتأثر على
 * أكتر من قائمة، فبنمسح الكل: الخريطة صغيرة والصحة أهم).
 */
function invalidateApiCaches(): void {
  memCache.clear()
  getStore().invalidatedAt = Date.now()
  void idb.purgeRows(API_CACHE_PREFIXES).catch(() => {})
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export function isNetworkError(err: any): boolean {
  if (!err) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String(err?.message || err).toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('errconnrefused') ||
    msg.includes('econnrefused') ||
    (err instanceof TypeError && msg.includes('fetch'))
  )
}

/**
 * Check if a URL is a product search that can be answered from IndexedDB.
 */
function isProductSearch(url: string): boolean {
  return url.startsWith('/api/products?') && url.includes('search=')
}

/**
 * Search products in IndexedDB when offline.
 * Returns array of products matching the search query.
 */
async function localProductSearch<T>(url: string): Promise<T | null> {
  if (!idbAvailable()) return null
  const u = new URL(url, 'http://localhost')
  const search = u.searchParams.get('search') || ''
  if (!search.trim()) return null
  const results = await idb.searchProducts(search.trim())
  if (results.length > 0) return results as T
  return null
}

/**
 * Offline-aware fetch wrapper.
 */
export async function offlineFetch<T = any>(
  url: string,
  options?: { method?: string; body?: any; signal?: AbortSignal; idempotent?: boolean }
): Promise<T> {
  const method = options?.method ?? 'GET'
  const isWrite = method !== 'GET'

  // ── Write operations ──────────────────────────────────
  if (isWrite) {
    try {
      // Writes are never retried automatically by default (that could
      // duplicate a sale/invoice/etc.), BUT a caller can opt in via
      // `idempotent: true` for requests it knows are safe to repeat —
      // e.g. login, where re-sending the same email/password on a
      // transient 500 just re-checks credentials, it never creates data.
      //
      // 🛡️ 2026-09-27: without this, a login attempt that hit the cold
      // "first DB connection of the request" delay described in
      // PERF_FIX_503.md failed immediately with a raw "طلب فاشل (500)"
      // even though trying again a moment later (once the connection was
      // warm) worked fine — the user had to notice and click "دخول" a
      // second time themselves. Login now retries that transient failure
      // automatically, same backoff as GET requests.
      const res = await fetchWithRetry(
        url,
        {
          method,
          headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : {},
          body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        },
        options?.idempotent ? 2 : 0,
        options?.signal,
      )
      const text = await res.text()
      let data: any = null
      if (text) {
        try { data = JSON.parse(text) } catch { data = text }
      }
      if (!res.ok) {
        const msg = (data && typeof data === 'object' && (data.error || data.message)) || `طلب فاشل (${res.status})`
        const errorMessage = typeof msg === 'string' ? msg : 'طلب فاشل'
        // 🛡️ 2026-09-15 (v4): attach the full structured response body to the
        // thrown Error so callers (like ProductsView removeProduct) can
        // access fields like `references`, `available_modes`,
        // `accounting_impact`, etc. from the 409 response.
        //
        // Before this fix: the wrapper threw a plain Error with only the
        // message string → callers couldn't see the structured fields →
        // smart toasts with action buttons didn't render because
        // `references` was undefined → fell to the `else` branch and showed
        // `toast.error(mainError)` with no buttons.
        //
        // After this fix: the thrown Error has `.body` = the full response
        // data (parsed JSON if available, or the text otherwise), so
        // callers can access `e.body.references`, `e.body.total_references`,
        // `e.body.available_modes`, etc.
        const err = new Error(errorMessage) as Error & { body?: any; status?: number }
        err.body = data
        err.status = res.status
        if (res.status === 401) notifySessionExpired()
        throw err
      }
      // ⚡ v10: أي كتابة ناجحة تمسح كاش الـ API (ميموري + IDB) — عشان
      // أي GET جاي بعد الـ mutation يروح للشبكة ويجيب الداتا الجديدة.
      invalidateApiCaches()
      // 🛡️ ROOT FIX (2026-09-27): announce that this kind of data changed so
      // every mounted view/dialog showing it (not just the one that made the
      // request) can refetch live instead of needing a hard refresh. See
      // src/lib/offline/data-events.ts for the full explanation.
      emitDataChanged(url, method)
      return data as T
    } catch (err: any) {
      if (isNetworkError(err)) {
        // 🛡️ 2026-09-30 (M7): idempotency for queued sales — a network error
        // AFTER the server committed used to keep the outbox entry and re-POST
        // it later, creating a duplicate invoice (double stock/till/debt).
        // Each queued sale now carries a unique clientRef; the sale POST
        // returns the original invoice when it sees the same ref again.
        let queuedBody = options?.body
        if (url === '/api/sales' && method === 'POST' && queuedBody && typeof queuedBody === 'object') {
          queuedBody = {
            ...queuedBody,
            clientRef:
              (queuedBody as any).clientRef ??
              (typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
          }
        }
        await idb.addToOutbox({
          url, method,
          body: queuedBody,
          label: getOperationLabel(url, method, queuedBody),
        })
        // ⚡ v10: الكتابة الموفّقة أوفلاين هتغيّر السيرفر بعد المزامنة —
        // نمسح الكاش دلوقتي عشان أي GET جاي ميرجّعش داتا قديمة.
        invalidateApiCaches()
        // Optimistic: local screens usually already update their own state,
        // but nudge everyone else too (e.g. a list of the same data open in
        // another dialog) — harmless offline since it just re-reads cache.
        emitDataChanged(url, method)
        return { ok: true, offline: true, message: 'تم الحفظ محلياً — سيتم المزامنة عند عودة الاتصال' } as T
      }
      throw err
    }
  }

  // ── GET operations ───────────────────────────────────
  // De-duplicate identical concurrent GETs.
  const pending = inFlightGets.get(url)
  if (pending) return pending as Promise<T>
  const request = runGet<T>(url, options)
  inFlightGets.set(url, request)
  try {
    return await request
  } finally {
    inFlightGets.delete(url)
  }
}

async function runGet<T>(
  url: string,
  options?: { method?: string; body?: any; signal?: AbortSignal },
): Promise<T> {
  // ⚡ v10 SWR fast path — نسخة طازة في الكاش؟ ارجّعها فوراً + حدّث في الخلفية.
  // (بنستثني النداءات اللي فيها signal — الاتفاق مع النداء دي فيه إلغاء محتمل)
  const freshMs = swrFreshMs(url)
  if (freshMs !== null && !options?.signal) {
    const mem = memCache.get(url)
    if (mem && Date.now() - mem.at < freshMs) {
      void revalidateGet(url)
      return mem.data as T
    }
    // مفيش في الميموري (reload مثلاً) — جرب IDB قبل ما نسيب المستخدم يستنى الشبكة
    // (بشرط إن الصف مكتوب بعد آخر إبطال — حماية من race مسح IDB الغير متزامن)
    const idbHit = await idb.getCached<T>(url)
    if (idbHit && idbHit.at > getInvalidatedAt() && Date.now() - idbHit.at < freshMs) {
      memCache.set(url, { data: idbHit.data, at: idbHit.at })
      void revalidateGet(url)
      return idbHit.data
    }
  }

  // Step 1: Try fetching from server (with retry on transient 5xx)
  try {
    const res = await fetchWithRetry(
      url,
      { method: 'GET', cache: 'default' },
      2,
      options?.signal,
    )
    const text = await res.text()
    let data: any = null
    if (text) {
      try { data = JSON.parse(text) } catch { data = text }
    }
    if (!res.ok) {
      const msg = (data && typeof data === 'object' && (data.error || data.message)) || `طلب فاشل (${res.status})`
      const err = new Error(typeof msg === 'string' ? msg : 'طلب فاشل') as Error & { status?: number }
      err.status = res.status
      if (res.status === 401) notifySessionExpired()
      throw err
    }
    // Success → cache + return
    // لا ننتظر كتابة IndexedDB (بطيئة على الموبايل) — الكاش للأوفلاين فقط
    if (freshMs !== null) {
      // ⚡ v10: اعتمّ الكاش في الميموري للزيارات الجاية (نفس فكرة gcTime)
      if (memCache.size >= MEM_CACHE_MAX) {
        const oldest = memCache.keys().next().value
        if (oldest !== undefined) memCache.delete(oldest)
      }
      memCache.set(url, { data, at: Date.now() })
    }
    void idb.setCached(url, data).catch(() => {})
    return data as T
  } catch (err: any) {
    // 4xx client errors (401 session expired, 403 forbidden, 404 not found)
    // must propagate immediately — falling back to stale cache would show
    // wrong data and hide the real problem (e.g. "please login again").
    if (err?.status && err.status >= 400 && err.status < 500) throw err

    // Step 2: network error or 5xx → try cached response
    const cached = await idb.getCached<T>(url)
    if (cached) return cached.data

    // Step 3: Try local product search from IndexedDB
    if (isProductSearch(url)) {
      const localResults = await localProductSearch<T>(url)
      if (localResults) return localResults
    }

    // Step 4: No cache, no local data
    // If this was a server error (5xx) re-throw its message, otherwise
    // show the generic offline message.
    if (err?.status && err.status >= 500) throw err
    throw new Error('لا توجد بيانات محفوظة — تحتاج اتصال بالإنترنت لتحميل البيانات لأول مرة')
  }
}

function getOperationLabel(url: string, method: string, body: any): string {
  const m = method.toUpperCase()
  if (url.includes('/products')) {
    if (m === 'POST') return `إضافة منتج: ${body?.name ?? ''}`
    if (m === 'PUT') return `تعديل منتج: ${body?.name ?? ''}`
    if (m === 'DELETE') return `حذف منتج`
    if (m === 'PATCH') return `تعديل منتج`
  }
  if (url.includes('/sales')) {
    if (m === 'POST') return `فاتورة بيع جديدة`
    if (m === 'DELETE') return `مرتجع فاتورة`
  }
  if (url.includes('/customers')) {
    if (m === 'POST') return `إضافة عميل: ${body?.name ?? ''}`
    if (m === 'PUT') return `تعديل عميل: ${body?.name ?? ''}`
    if (m === 'DELETE') return `حذف عميل`
  }
  if (url.includes('/suppliers')) {
    if (m === 'POST') return `إضافة مورد: ${body?.name ?? ''}`
    if (m === 'PUT') return `تعديل مورد: ${body?.name ?? ''}`
    if (m === 'DELETE') return `حذف مورد`
  }
  if (url.includes('/expenses')) {
    if (m === 'POST') return `تسجيل مصروف: ${body?.category ?? ''}`
    if (m === 'DELETE') return `حذف مصروف`
  }
  if (url.includes('/cash')) {
    if (m === 'POST') return `حركة خزنة يدوية`
  }
  if (url.includes('/maintenance')) {
    if (m === 'POST') return `أمر صيانة جديد: ${body?.customerName ?? ''}`
    if (m === 'PUT') return `تعديل أمر صيانة`
  }
  if (url.includes('/inventory')) {
    if (m === 'POST') return `حركة مخزون`
  }
  if (url.includes('/notifications/read')) {
    return `تعليم إشعار كمقروء`
  }
  return `${m} ${url}`
}
