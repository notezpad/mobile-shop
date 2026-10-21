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
import { findVariantByBarcode, getVariantsOfProduct, upsertProductVariants } from './variants-index'

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

/** مسارات الـ API اللي بنتكاشها (بيتمسحوا كلهم بعد أي كتابة أونلاين ناجحة) */
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
  // 🛡️ v11: باقي مصادر الصفحات — عشان الكتابة الأونلاين تمسح نسخها القديمة
  // كمان (البيع بيأثر على /api/inventory/movements، الشراء على
  // /api/purchase-orders... إلخ)
  '/api/purchase-orders',
  '/api/inventory',
  '/api/branches',
  '/api/finance',
  '/api/reports',
  '/api/maintenance',
  '/api/notifications',
  '/api/users',
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
    // 🛡️ v13: بنخزّن الرد بطبيعته المصحّحة (درع الأشكال) عشان الكاش كله نضيف
    data = normalizeListShape(url, data)
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
 * 🛡️ v13 — درع الأشكال (SHAPE SHIELD) — قطع جذري لصنف أعطال كامل:
 * "خطأ غير متوقع" لما السيرفر/الكاش يرجّع قائمة داخل ظرف {data:[...]} بينما
 * الشاشة متوقعة مصفوفة عارية (أو العكس). الـ endpoints دي ردودها في كل
 * النسخة مصفوفات عارية (غير مُصفّحة)، فلو وصلت كظرف بحقل مصفوفة واحد
 * معروف ومن غير meta ترقيم — بنفكّ الظرف ونرجّع المصفوفة نفسها.
 * المصفوفة العارية تمر زي ما هي، والأظرف المُصفّحة (بها page/total) بتتجاهل.
 */
const BARE_LIST_PATH_RE =
  /^\/api\/(?:branches|finance|purchase-orders|reports\/branches|inventory\/(?:movements|transfers|stocktake)|suppliers)$/

const LIST_UNWRAP_KEYS = [
  'data',
  'items',
  'results',
  'rows',
  'list',
  'branches',
  'orders',
  'movements',
  'transfers',
  'stocktakes',
  'suppliers',
] as const

export function normalizeListShape(url: string, data: any): any {
  try {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data
    const u = new URL(url, 'http://localhost')
    if (!BARE_LIST_PATH_RE.test(u.pathname)) return data
    // نسخة مُصفّحة (page/limit) ظرفها مقصود — ممنوع نلمسه
    if (u.searchParams.has('page') || u.searchParams.has('limit')) return data
    if ('total' in data || 'totalPages' in data) return data
    // أولاً: الحقول المعروفة
    for (const k of LIST_UNWRAP_KEYS) {
      const v = (data as any)[k]
      if (Array.isArray(v)) return v
    }
    // ثانياً: لو الظرف فيه **حقل مصفوفة واحد فقط** باسم أي حاجة — هو ده
    // القائمة الملفوفة (سيرفر أحدث غيّر اسم الحقل) — نقطعه
    const arrayKeys = Object.keys(data).filter((k) => Array.isArray((data as any)[k]))
    if (arrayKeys.length === 1) return (data as any)[arrayKeys[0]]
    return data
  } catch {
    return data
  }
}

/**
 * 🛡️ v5: تجزئة ثابتة — بنمشي عليها في تعيين الـ ids المؤقتة للمنتجات
 * المضافة أوفلاين (id سالب مشتق من entry id بتاع الـ outbox — ثابت عبر
 * كل القراءات عشان السلة/الفاتورة تفضل متطابقة مع القائمة).
 */
export function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** مسارات الـ GET الحساسة اللي ما بنخدمهاش من كاش قديم بمسار مطابق */
const SENSITIVE_GET_PATH_RE = /^\/api\/(?:auth|admin|pay|upload)\b/

/** قائمة المنتجات (endpoint القائمة فقط — مش /api/products/<id>/units وهكذا) */
function isProductsListUrl(url: string): boolean {
  return url.startsWith('/api/products?')
}

/**
 * 🛡️ v5: المنتجات اللي اتضافت أوفلاين ولسه في الـ outbox — بنرجّعها
 * كأصناف كاملة عشان تظهر فوراً في القوائم والبحث وفعايلة البيع.
 * الـ id بيبقى سالب (مشتق ثابت من entry id) لحد ما المزامنة ترجّع
 * الـ id الحقيقي (يُخزّن في localProductMap — شوف sync.ts) ساعتها
 * بنعرضه بالـ id الحقيقي.
 */
async function getOfflineAddedProducts(): Promise<any[]> {
  if (!idbAvailable()) return []
  try {
    const outbox = await idb.getOutbox()
    if (!outbox.length) return []
    const map = await idb.getLocalProductMap().catch(() => ({}) as Record<string, number>)
    const added: any[] = []
    for (const entry of outbox) {
      if (entry.method !== 'POST') continue
      if (!entry.url.startsWith('/api/products')) continue
      const b = entry.body
      if (!b || typeof b !== 'object') continue
      added.push({
        ...b,
        id: map[entry.id] ?? -(hashStr(entry.id) + 1),
        active: b.active !== false,
        soldQuantity: 0,
        matchedVariantId: null,
        matchedVariantLabel: null,
        dynamicRetailPrice: null,
        imagePath: b.imagePath ?? null,
        _offlineAdded: true,
      })
    }
    return added
  } catch {
    return []
  }
}

/**
 * 🛡️ v5: فلترة قائمة قديمة بكلمة بحث — بيتمسح بيها كلمة `search=` في
 * الـ URL على آخر نسخة مخزّنة من نفس المسار (عملاء/موردين/أي قائمة).
 * بترجع null لو الداتا مش قائمة قابلة للفلترة (سيبها زي ما هي).
 */
function filterStaleListBySearch(url: string, data: any): any | null {
  try {
    const u = new URL(url, 'http://localhost')
    const q = (u.searchParams.get('search') || '').trim()
    if (!q) return null
    const nq = q.toLowerCase()
    const isArr = Array.isArray(data)
    const list = isArr ? data : Array.isArray(data?.data) ? data.data : null
    if (!list) return null
    const filtered = list.filter((item: any) => {
      if (!item || typeof item !== 'object') return false
      const haystacks = [item.name, item.phone, item.barcode, item.code]
      return haystacks.some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(nq)
      ) || (typeof item.barcode === 'string' && item.barcode.includes(q))
    })
    if (isArr) return filtered
    return { ...data, data: filtered, total: filtered.length, totalPages: 1 }
  } catch {
    return null
  }
}

/**
 * 🛡️ v5: جواب كامل لقائمة /api/products?... من المتجر المحلي — بنفس
 * شكل السيرفر { data, total, page, limit, totalPages } عشان كل الشاشات
 * (المنتجات/نقطة البيع/أمر الشراء) تشتغل أوفلاين من غير ما تحس.
 * الدعم: search (مطابقة جزئية زي السيرفر) + status + page/limit.
 * والمنتجات المضافة أوفلاين بتظهر في النتايج فوراً.
 */
async function offlineProductsAnswer<T>(url: string): Promise<T | null> {
  if (!idbAvailable()) return null
  try {
    const u = new URL(url, 'http://localhost')
    const q = (u.searchParams.get('search') || '').trim()
    const status = u.searchParams.get('status') || 'active'
    const page = Math.max(1, parseInt(u.searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(u.searchParams.get('limit') || '50', 10) || 50))

    let list: any[] = await idb.getAllProducts()
    const added = await getOfflineAddedProducts()
    if (added.length) {
      const seen = new Set(list.map((p) => p.id))
      for (const p of added) if (!seen.has(p.id)) list.push(p)
    }
    if (list.length === 0) return null
    const everyone = list

    if (status === 'active') list = list.filter((p) => p.active !== false)
    else if (status === 'inactive') list = list.filter((p) => p.active === false)

    if (q) {
      const nq = q.toLowerCase()
      list = list.filter(
        (p) =>
          String(p?.name || '').toLowerCase().includes(nq) ||
          String(p?.barcode || '').includes(q)
      )
    }

    // 🎨 البحث بباركود متغير (مطابقة تامة زي السيرفر) → المنتج صاحبه يظهر ومعاه matchedVariantId
    const variantHit = q ? await findVariantByBarcode(q) : null
    if (variantHit && !list.some((p) => p?.id === variantHit.productId)) {
      const owner = everyone.find((p) => p?.id === variantHit.productId)
      if (owner && (status === 'all' || (status === 'active') === (owner.active !== false))) list.push(owner)
    }

    // الأحدث أولاً (زي ترتيب السيرفر id desc) — والمضاف أوفلاين على الوش
    list.sort(
      (a, b) =>
        (b?._offlineAdded ? 1 : 0) - (a?._offlineAdded ? 1 : 0) ||
        (Number(b?.id) || 0) - (Number(a?.id) || 0)
    )

    const total = list.length
    const start = (page - 1) * limit
    const data = list.slice(start, start + limit).map((p) =>
      variantHit && p?.id === variantHit.productId
        ? {
            ...p,
            matchedVariantId: variantHit.id,
            matchedVariantLabel: [variantHit.color, variantHit.size].filter(Boolean).join(' / ') || null,
          }
        : p
    )
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    } as T
  } catch {
    return null
  }
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

  // 🔁 2026-10-18: مفتاح منع التكرار بيتولّد *قبل* المحاولة الأولى وبيتبعت معاها، وبنفس القيمة
  // في طابور الأوفلاين. لو الطلب اتنفّذ على السيرفر والرد ضاع (انقطاع بعد الـ commit)، الإرسال
  // التاني بيرجّع الرد الأصلي بدل ما ينفّذ العملية مرتين (دفعة/أمر شراء/مصروف/حركة...).
  // (طلبات idempotent:true زي الدخول مش محتاجة.)
  let writeBody = options?.body
  let idemKey: string | undefined
  if (isWrite && !options?.idempotent) {
    idemKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    // الفواتير: clientRef كمان من أول محاولة (قبل كده كان بيتولّد بعد الفشل بس)
    if (url === '/api/sales' && method === 'POST' && writeBody && typeof writeBody === 'object') {
      writeBody = { ...writeBody, clientRef: (writeBody as any).clientRef ?? idemKey }
    }
  }

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
          headers: {
            ...(writeBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(idemKey ? { 'Idempotency-Key': idemKey } : {}),
          },
          body: writeBody !== undefined ? JSON.stringify(writeBody) : undefined,
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
        // 🛡️ SECURITY (2026-10-20): طلبات auth/admin ما بتتحطش في الـ outbox أبدًا —
        // كانت كلمة المرور بتتخزن نص صريح في IndexedDB وبتتنفذ بعدين من غير علم
        // المستخدم، والواجهة كانت بتعرض نجاح كاذب. بنرجّع الخطأ للمستخدم بدل كده.
        if (/^\/api\/(?:auth|admin)(?:\/|\?|$)/.test(url)) {
          throw new Error('لا يوجد اتصال بالإنترنت — هذه العملية تحتاج اتصالاً، حاول مرة أخرى عند عودته')
        }
        // 🛡️ 2026-09-30 (M7): idempotency for queued sales — a network error
        // AFTER the server committed used to keep the outbox entry and re-POST
        // it later, creating a duplicate invoice (double stock/till/debt).
        // Each queued sale now carries a unique clientRef; the sale POST
        // returns the original invoice when it sees the same ref again.
        let queuedBody = writeBody
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
        const outboxEntry = await idb.addToOutbox({
          url, method,
          body: queuedBody,
          label: getOperationLabel(url, method, queuedBody),
          idempotencyKey: idemKey,
        })
        // 🛡️ v11 (LOCAL-FIRST ROOT FIX — قصّ جذر "كل حاجة صفر + الإجراء مش
        // بيظهر إلا بعد المزامنة"):
        //
        // قبل كده: أي كتابة أوفلاين كانت بتنادي invalidateApiCaches() اللي
        // بتمسح كل صفوف كاش الـ API من IDB (/api/sales, /api/expenses,
        // /api/cash, /api/dashboard...) — النتيجة: أول فتح لصفحة بعد أي عملية
        // أوفلاين كان يلاقي الكاش فاضي → أصفار في كل حاجة + توست أحمر
        // "لا توجد بيانات محفوظة". والسجل الجديد نفسه ما كانش بيظهر في أي
        // قائمة غير بعد المزامنة لأن رد الـ optimistic مش بيحتوي عليه.
        //
        // دلوقتي: **بنمنع المسح خالص في المسار الأوفلاين** — وبدل ده بندمج
        // السجل الجديد بنفسه جوا نسخ الكاش المحلية (فواتير في /api/sales،
        // مصروف في /api/expenses، حركة في /api/cash...) بنفس شكل ردود
        // السيرفر، فأي صفحة تفتح أوفلاين بتلاقي الكاش موجود + محتوي عليه
        // الإجراء الجديد لحظياً. الكاش بيتصلّح تلقائياً من السيرفر بعد
        // المزامنة (flushOutbox → emitDataChanged → إعادة جلب حية).
        //
        // المسح الكامل بيفضل محفوظ للمسار الأونلاين فقط (السيرفر متاح
        // فإعادة الجلب الآمنة هي الأصح هناك).
        const mutation = await applyLocalMutation(url, method, queuedBody, outboxEntry?.id).catch(() => null)
        // Optimistic: local screens usually already update their own state,
        // but nudge everyone else too (e.g. a list of the same data open in
        // another dialog) — harmless offline since it just re-reads cache.
        emitDataChanged(url, method)
        // 🛡️ v11: الرد بيحمل الـ id المؤقت للسجل المدمج محلياً (لو اتبنى) —
        // عشان النداء اللي بيستخدم ردّ الـ POST (زي ProductDialog اللي
        // بيضيف المنتج الجديد للسلة) يشتغل أوفلاين بنفس الـ id المخزن.
        return {
          ok: true,
          offline: true,
          message: 'تم الحفظ محلياً — سيتم المزامنة عند عودة الاتصال',
          ...(mutation?.id ? { id: mutation.id } : {}),
        } as T
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
      return normalizeListShape(url, mem.data) as T
    }
    // مفيش في الميموري (reload مثلاً) — جرب IDB قبل ما نسيب المستخدم يستنى الشبكة
    // (بشرط إن الصف مكتوب بعد آخر إبطال — حماية من race مسح IDB الغير متزامن)
    const idbHit = await idb.getCached<T>(url)
    if (idbHit && idbHit.at > getInvalidatedAt() && Date.now() - idbHit.at < freshMs) {
      const fixed = normalizeListShape(url, idbHit.data)
      memCache.set(url, { data: fixed, at: idbHit.at })
      void revalidateGet(url)
      return fixed
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
    // 🛡️ v13: درع الأشكال — أي رد قائمة بيتصلّح قبل التخزين قبل الرجوع
    data = normalizeListShape(url, data)
    // 🎨 متغيرات منتج جت أونلاين → نحدّث فهرس المتغيرات المحلي (أوفلاين + منتجات اتضافت بعد آخر prewarm)
    const variantsUrl = url.match(/^\/api\/products\/(\d+)\/variants(?:\?|$)/)
    if (variantsUrl) void upsertProductVariants(Number(variantsUrl[1]), data)
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

    // Step 2: network error or 5xx → try cached response (نفس الـ URL بالظبط)
    const cached = await idb.getCached<T>(url)
    if (cached) return normalizeListShape(url, cached.data) as T

    // 🎨 Step 2a: متغيرات منتج من الفهرس المحلي (اتسحب في الـ prewarm) لو الـ URL ده ما اتكاشّاش قبل كده
    const variantsPath = url.match(/^\/api\/products\/(\d+)\/variants(?:\?|$)/)
    if (variantsPath) {
      const local = await getVariantsOfProduct(Number(variantsPath[1]))
      if (local) return local as unknown as T
    }

    // 🛡️ Step 2b (v5): قوائم المنتجات أوفلاين — من متجر IDB الكامل +
    // المنتجات المضافة محلياً (outbox) — بنفس شكل ظرف السيرفر عشان
    // البحث والقوائم والفعايلة تشتغل أوفلاين بلا "غير متصل".
    if (isProductsListUrl(url)) {
      const local = await offlineProductsAnswer<T>(url)
      if (local) return local
    }

    // 🛡️ Step 2c (v5): نفس المسار بأي query (تقارير بتواريخ متغيرة/
    // إشعارات/فلاتر) — آخر نسخة معروفة أحسن من خطأ، والمسارات الحساسة
    // (auth/admin/pay/upload) مستثناة. ولو الـ URL فيه كلمة بحث بنفلتر
    // القائمة القديمة بيها بدل ما نرجّع اللستة كاملة كأنها نتايج بحث.
    try {
      const u = new URL(url, 'http://localhost')
      if (!SENSITIVE_GET_PATH_RE.test(u.pathname)) {
        const stale = await idb.getCachedByPath(u.pathname)
        if (stale && typeof stale.data !== 'undefined') {
          // 🛡️ v13: نصلّح الشكل الأول وبعدها نفلتر بالبحث لو موجود
          const fixed = normalizeListShape(url, stale.data)
          const filtered = filterStaleListBySearch(url, fixed)
          return (filtered ?? fixed) as T
        }
      }
    } catch {
      /* ignore */
    }

    // Step 4: No cache, no local data
    // If this was a server error (5xx) re-throw its message, otherwise
    // show the generic offline message.
    if (err?.status && err.status >= 500) throw err
    // 🛡️ v11: رسالة أهدأ وأوضح — دي حالة "أول مرة أوفلاين قبل ما الصفحة
    // تتفتح أونلاين غير مرة"، مش خطأ في النظام.
    throw new Error('البيانات مش محفوظة على الجهاز لسه — افتح الصفحة مرة واحدة والإنترنت متاح، وبعدها هتشتغل أوفلاين عادي')
  }
}

/* ════════════════════════════════════════════════════════════════════
   🛡️ v11 — LOCAL-FIRST MUTATIONS (قصّ الجذر)
   ────────────────────────────────────────────────────────────────────
   أي كتابة أوفلاين بتنضاف للـ outbox، وبالتوازي بندمج السجل الجديد
   بنفسه جوا نسخ الكاش المخزنة في IDB (نفس شكل ردود السيرفر بالظبط):
     - فاتورة البيع → جوا كل صفوف /api/sales (مع احترام فلاتر from/to
       والصفحة) + جوا /api/dashboard (أرقام اليوم/الشهر + آخر 10 فواتير)
       + قيد خزنة جوا /api/cash لو فيه مدفوع.
     - المصروف → جوا /api/expenses (اللستة + الإجمالي + byCategory).
     - حركة الخزنة اليدوية → جوا /api/cash (اللستة + الرصيد).
     - العميل/المورد/الفرع → prepend في مصفوفاتهم.
     - أمر الشراء → جوا /api/purchase-orders.
     - حركة المخزون/التحويل/الجرد → جوا صفوف /api/inventory/*.
     - المنتج الجديد → جوا صفوف /api/products + متجر products في IDB.
   والتعديلات/الحذف (PATCH/PUT/DELETE) بتتطبق على نفس النسخ.

   النتيجة: الصفحات تعرض الإجراء لحظياً أوفلاين، وكاش IDB عمره ما
   بيتمسح أوفلاين فمفيش "كل حاجة صفر"، وبعد المزامنة السيرفر بيرجّع
   الحقيقة النهائية (الصفوف بتتكتب فوق ببيانات حية).
   ════════════════════════════════════════════════════════════════════ */

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** id مؤقت سالب فريد للسجلات المدمجة محلياً (بيريد من الكاش المخزن نفسه) */
function localId(): number {
  return -(hashStr(`${Date.now()}-${Math.random().toString(36).slice(2)}`) + 1)
}

/** YYYY-MM-DD بتوقيت الجهاز (مطابق لصيغة buckets الداشبورد) */
function localDateKey(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** هل تاريخ السجل جوا نطاق from/to في فلتر الصف المخزن؟ (مفيش فلاتر = نطاق كامل) */
function inRange(params: URLSearchParams, isoDate: string): boolean {
  const from = params.get('from')
  const to = params.get('to')
  if (!from && !to) return true
  const t = new Date(isoDate).getTime()
  if (!Number.isFinite(t)) return false
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false
  return true
}

/**
 * امشِ على كل الصفوف المخزنة تحت البادئة وطبّق المُحوِّر عليها.
 * المُحوِّر يرجّع الداتا الجديدة أو null لو الصف ده ما ينطبقش عليه (نتخطاه).
 */
async function patchRows(
  prefix: string,
  mutator: (data: any, key: string, params: URLSearchParams) => any,
): Promise<void> {
  const rows = await idb.getRowsByPrefix(prefix).catch(() => [])
  for (const row of rows) {
    try {
      const query = row.key.includes('?') ? row.key.slice(row.key.indexOf('?') + 1) : ''
      const next = mutator(row.data, row.key, new URLSearchParams(query))
      if (next !== null && next !== undefined) {
        await idb.setCached(row.key, next)
      }
    } catch {
      /* صف فاشل — نكمل على الباقي */
    }
  }
}

/** اسم منتج من متجر IDB (fallback: الاسم المرسل في الـ body، ثم #id) */
async function productNameOf(productId: any, fallbackName?: any): Promise<string> {
  const id = Number(productId)
  if (Number.isFinite(id) && id > 0) {
    const p = await idb.getProductById(id).catch(() => null)
    if (p?.name) return String(p.name)
  }
  if (typeof fallbackName === 'string' && fallbackName.trim()) return fallbackName.trim()
  return `منتج #${Number.isFinite(id) ? id : '?'}`
}

/** عميل من آخر نسخة /api/customers المخزنة (للفتات المحلية) */
async function customerRefOf(customerId: any): Promise<{ id: number; name: string; phone?: string | null } | null> {
  const id = Number(customerId)
  if (!Number.isFinite(id) || id <= 0) return null
  try {
    const row = await idb.getCachedByPath('/api/customers')
    const list = Array.isArray(row?.data) ? row.data : null
    const c = list?.find((x: any) => Number(x?.id) === id)
    if (c) return { id: c.id, name: String(c.name ?? ''), phone: c.phone ?? null }
  } catch { /* ignore */ }
  return { id, name: `عميل #${id}` }
}

/** فرع من آخر نسخة /api/branches المخزنة */
async function branchNameOf(branchId: any): Promise<{ id: number; name: string } | null> {
  const id = Number(branchId)
  if (!Number.isFinite(id) || id <= 0) return null
  try {
    const row = await idb.getCachedByPath('/api/branches')
    const list = Array.isArray(row?.data) ? row.data : null
    const b = list?.find((x: any) => Number(x?.id) === id)
    if (b) return { id: b.id, name: String(b.name ?? `فرع #${id}`) }
  } catch { /* ignore */ }
  return { id, name: `فرع #${id}` }
}

/** prepend سجل جديد في أي مصفوفة مخزنة (عملاء/موردين/فروع) */
async function patchListAdded(prefix: string, record: any): Promise<void> {
  if (!record) return
  await patchRows(prefix, (data) => {
    if (!Array.isArray(data)) return null
    return [record, ...data]
  })
}

/* ── بنّاؤو السجلات المحلية (نفس أشكال ردود السيرفر) ── */

function buildLocalExpense(body: any) {
  const amount = round2(body?.amount)
  if (!(amount > 0)) return null
  const rec = {
    id: localId(),
    category: String(body?.category ?? 'أخرى'),
    amount,
    note: body?.note ?? null,
    userName: null,
    source: null,
    locked: false,
    createdAt: new Date().toISOString(),
  }
  return { rec }
}

async function buildLocalSale(body: any) {
  const itemsIn = Array.isArray(body?.items) ? body.items : []
  const items: any[] = []
  let total = 0
  let estProfit = 0
  for (const it of itemsIn) {
    const qty = Number(it?.quantity) || 0
    const price = round2(it?.price)
    const p = await productNameOf(it?.productId, it?.name)
    let cost = 0
    let pieceLabel: string | null = null
    const pid = Number(it?.productId)
    if (Number.isFinite(pid) && pid > 0) {
      const prod = await idb.getProductById(pid).catch(() => null)
      cost = round2(prod?.cost)
      pieceLabel = ((prod as any)?.unitLabel as string | null | undefined) ?? null
    }
    total += qty * price
    // تقدير الربح أوفلاين (تكلفة القطعة × الكمية) — المزامنة بترجّع الرقم النهائي
    estProfit += qty * Math.max(0, price - cost)
    items.push({
      id: 0,
      name: p,
      price,
      quantity: qty,
      cost,
      unitLabel: null,
      pieceLabel,
      unitQuantity: null,
      returnedQty: 0,
    })
  }
  total = round2(total)
  const paid = Math.min(round2(body?.paid), total)
  const customer = await customerRefOf(body?.customerId)
  const rec = {
    id: localId(),
    invoiceNo: `محلي-${String(Date.now()).slice(-6)}`,
    total,
    paid,
    status: 'مكتملة',
    createdAt: new Date().toISOString(),
    userName: null,
    refunded: 0,
    paymentMethod: body?.paymentMethod ?? 'cash',
    customer,
    items,
  }
  return { rec, total, estProfit, paid }
}

async function buildLocalPurchaseOrder(body: any) {
  const itemsIn = Array.isArray(body?.items) ? body.items : []
  const items: any[] = []
  let total = 0
  for (const it of itemsIn) {
    const qty = Number(it?.quantity) || 0
    const cost = round2(it?.cost)
    const name = await productNameOf(it?.productId, it?.name)
    total += qty * cost
    items.push({ id: 0, name, cost, quantity: qty, returnedQty: 0 })
  }
  total = round2(total)
  const paid = Math.min(round2(body?.paid), total)
  let supplier: { name: string; phone?: string | null } | null = null
  const sid = Number(body?.supplierId)
  if (Number.isFinite(sid) && sid > 0) {
    try {
      const row = await idb.getCachedByPath('/api/suppliers')
      const list = Array.isArray(row?.data) ? row.data : null
      const s = list?.find((x: any) => Number(x?.id) === sid)
      supplier = s ? { name: String(s.name ?? `مورد #${sid}`), phone: s.phone ?? null } : { name: `مورد #${sid}` }
    } catch { supplier = { name: `مورد #${sid}` } }
  }
  const rec = {
    id: localId(),
    orderNo: `محلي-${String(Date.now()).slice(-6)}`,
    total,
    paid,
    paymentMethod: body?.paymentMethod ?? 'cash',
    refunded: 0,
    status: 'مكتملة',
    createdAt: new Date().toISOString(),
    userName: null,
    supplier,
    items,
  }
  return rec
}

async function buildLocalMovement(body: any) {
  const qty = Number(body?.quantity) || 0
  if (!qty) return null
  const type = String(body?.type ?? 'adjust')
  const signed = type === 'in' ? Math.abs(qty) : -Math.abs(qty)
  const rec = {
    id: localId(),
    type,
    quantity: signed,
    note: body?.note ?? null,
    createdAt: new Date().toISOString(),
    branchId: body?.branchId ?? null,
    product: { name: await productNameOf(body?.productId, body?.name), barcode: null },
    branch: null,
    userName: null,
  }
  return rec
}

async function buildLocalTransfer(body: any) {
  const itemsIn = Array.isArray(body?.items) ? body.items : []
  const items: any[] = []
  for (const it of itemsIn) {
    items.push({
      productId: Number(it?.productId) || 0,
      quantity: Number(it?.quantity) || 0,
      product: { name: await productNameOf(it?.productId, it?.name), barcode: null },
    })
  }
  if (!items.length) return null
  const fromBranch = await branchNameOf(body?.fromBranchId)
  const toBranch = await branchNameOf(body?.toBranchId)
  const completed = body?.mode === 'completed'
  const rec = {
    id: localId(),
    status: completed ? 'completed' : 'pending',
    note: body?.note ?? null,
    createdAt: new Date().toISOString(),
    completedAt: completed ? new Date().toISOString() : null,
    fromBranchId: Number(body?.fromBranchId) || 0,
    toBranchId: Number(body?.toBranchId) || 0,
    fromBranch: fromBranch ?? { name: '—' },
    toBranch: toBranch ?? { name: '—' },
    items,
    createdByName: null,
  }
  return rec
}

async function buildLocalStocktake(body: any) {
  const itemsIn = Array.isArray(body?.items) ? body.items : []
  const items: any[] = []
  for (const it of itemsIn) {
    const systemQty = Number(it?.systemQty) || 0
    const countedQty = Number(it?.countedQty) || 0
    items.push({
      productId: Number(it?.productId) || 0,
      systemQty,
      countedQty,
      diff: countedQty - systemQty,
      product: { name: await productNameOf(it?.productId, it?.name), barcode: null },
    })
  }
  if (!items.length) return null
  const committed = body?.commit === true
  const rec = {
    id: localId(),
    status: committed ? 'committed' : 'draft',
    createdAt: new Date().toISOString(),
    committedAt: committed ? new Date().toISOString() : null,
    note: body?.note ?? null,
    branchId: body?.branchId ?? null,
    branch: null,
    createdByName: null,
    items,
  }
  return rec
}

/* ── مُطبِّقات الدمج لكل endpoint ── */

async function patchSaleAdded(body: any): Promise<void> {
  const built = await buildLocalSale(body)
  if (!built) return
  const { rec, total, estProfit, paid } = built

  // 1) صفوف قائمة المبيعات — نحترم فلاتر from/to و page
  await patchRows('/api/sales', (data, _key, params) => {
    if (!data || typeof data !== 'object' || !Array.isArray(data.data)) return null
    if (!inRange(params, rec.createdAt)) return null
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
    const next: any = { ...data, total: (Number(data.total) || 0) + 1 }
    if (page === 1) next.data = [rec, ...data.data]
    return next
  })

  // 2) الداشبورد — أرقام اليوم/الشهر + آخر 10 فواتير + الكروت
  await patchRows('/api/dashboard', (data, key) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    if (key.includes('/api/dashboard/')) return null
    const d: any = { ...data }
    d.todaySales = round2((Number(d.todaySales) || 0) + total)
    d.todaySalesCount = (Number(d.todaySalesCount) || 0) + 1
    d.todayProfit = round2((Number(d.todayProfit) || 0) + estProfit)
    d.monthSales = round2((Number(d.monthSales) || 0) + total)
    d.monthProfit = round2((Number(d.monthProfit) || 0) + estProfit)
    if (Array.isArray(d.last10Sales)) {
      d.last10Sales = [
        {
          id: rec.id,
          invoiceNo: rec.invoiceNo,
          createdAt: rec.createdAt,
          total: rec.total,
          paid: rec.paid,
          status: rec.status,
          customerName: rec.customer?.name ?? null,
        },
        ...d.last10Sales,
      ].slice(0, 10)
    }
    const todayKey = localDateKey(new Date())
    if (Array.isArray(d.last7DaysSales)) {
      d.last7DaysSales = d.last7DaysSales.map((b: any) =>
        b && (b.date === todayKey || String(b.date ?? '').startsWith(todayKey))
          ? { ...b, total: round2((Number(b.total) || 0) + total), profit: round2((Number(b.profit) || 0) + estProfit) }
          : b,
      )
    }
    if (Array.isArray(d.topProducts)) {
      d.topProducts = d.topProducts.map((t: any) => {
        const hit = rec.items.find((it: any) => it.name === t?.name)
        if (!hit) return t
        return {
          ...t,
          quantity: (Number(t.quantity) || 0) + hit.quantity,
          total: round2((Number(t.total) || 0) + hit.quantity * hit.price),
        }
      })
    }
    return d
  })

  // 3) الخزنة — أي مدفوع بيتسجل كقيد بيع (نفس سلوك السيرفر: source=sale)
  if (paid > 0) {
    const method = String(body?.paymentMethod ?? 'cash')
    await patchRows('/api/cash', (data) => {
      if (!data || !Array.isArray(data.entries)) return null
      return {
        ...data,
        balance: round2((Number(data.balance) || 0) + paid),
        entries: [
          {
            id: localId(),
            source: 'sale',
            amount: paid,
            note: `فاتورة بيع (${rec.invoiceNo})`,
            method,
            userName: null,
            createdAt: rec.createdAt,
          },
          ...data.entries,
        ],
      }
    })
  }
}

async function patchExpenseAdded(body: any): Promise<void> {
  const built = buildLocalExpense(body)
  if (!built) return
  const { rec } = built
  await patchRows('/api/expenses', (data, _key, params) => {
    if (!data || !Array.isArray(data.expenses)) return null
    if (!inRange(params, rec.createdAt)) return null
    return {
      ...data,
      expenses: [rec, ...data.expenses],
      total: round2((Number(data.total) || 0) + rec.amount),
      byCategory: {
        ...(data.byCategory || {}),
        [rec.category]: round2((Number(data.byCategory?.[rec.category]) || 0) + rec.amount),
      },
    }
  })
  // المصروف بيسيب فلوس من الخزنة (نفس سلوك السيرفر: source=expense, سالب)
  await patchRows('/api/cash', (data) => {
    if (!data || !Array.isArray(data.entries)) return null
    return {
      ...data,
      balance: round2((Number(data.balance) || 0) - rec.amount),
      entries: [
        {
          id: localId(),
          source: 'expense',
          amount: -rec.amount,
          note: `المصروف ${rec.category}${rec.note ? ' - ' + rec.note : ''}`,
          method: 'cash',
          userName: null,
          createdAt: rec.createdAt,
        },
        ...data.entries,
      ],
    }
  })
}

async function patchCashAdded(body: any): Promise<void> {
  const amount = round2(body?.amount)
  if (!amount) return
  const rec = {
    id: localId(),
    source: 'manual',
    amount,
    note: body?.note ?? null,
    method: String(body?.method ?? 'cash'),
    userName: null,
    createdAt: new Date().toISOString(),
  }
  await patchRows('/api/cash', (data) => {
    if (!data || !Array.isArray(data.entries)) return null
    return {
      ...data,
      balance: round2((Number(data.balance) || 0) + amount),
      entries: [rec, ...data.entries],
    }
  })
}

async function patchProductAdded(body: any, outboxId?: string): Promise<void> {
  if (!body || typeof body !== 'object' || !body.name) return
  // 🛡️ نفس معادلة getOfflineAddedProducts + remapLocalProductIds في sync.ts —
  // الـ id الثابت المشتق من قيد الـ outbox بيتظبط تلقائياً لما المزامنة
  // ترجّع الـ id الحقيقي، فأي فاتورة/أمر شراء يشاور عليه ما بيفشلش.
  const id = outboxId ? -(hashStr(outboxId) + 1) : localId()
  const rec = {
    ...body,
    id,
    active: body.active !== false,
    soldQuantity: 0,
    matchedVariantId: null,
    matchedVariantLabel: null,
    dynamicRetailPrice: null,
    _offlineAdded: true,
  }
  await idb.putProduct(rec).catch(() => {})
  await patchRows('/api/products?', (data, _key, params) => {
    if (!data || typeof data !== 'object' || !Array.isArray(data.data)) return null
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
    const next: any = { ...data, total: (Number(data.total) || 0) + 1 }
    if (page === 1) next.data = [rec, ...data.data]
    return next
  })
}

async function patchMovementAdded(body: any): Promise<void> {
  const rec = await buildLocalMovement(body)
  if (!rec) return
  await patchRows('/api/inventory/movements', (data) => {
    if (!Array.isArray(data)) return null
    return [rec, ...data]
  })
}

async function patchTransferAdded(body: any): Promise<void> {
  const rec = await buildLocalTransfer(body)
  if (!rec) return
  await patchRows('/api/inventory/transfers', (data) => {
    if (!Array.isArray(data)) return null
    return [rec, ...data]
  })
}

async function patchStocktakeAdded(body: any): Promise<void> {
  const rec = await buildLocalStocktake(body)
  if (!rec) return
  await patchRows('/api/inventory/stocktake', (data) => {
    if (!Array.isArray(data)) return null
    return [rec, ...data]
  })
}

/** تطبيق تعديل/حذف على النسخ المخزنة (PATCH/PUT/DELETE أوفلاين) */
async function patchEntityEdit(url: string, method: string, body: any): Promise<void> {
  const m = url.match(/^\/api\/(products|expenses|customers|suppliers|branches|inventory\/transfers)\/(\d+)/)
  if (!m) return
  const [, entity, idStr] = m
  const id = Number(idStr)
  const isDelete = method === 'DELETE'

  if (entity === 'products') {
    if (isDelete) {
      await idb.deleteProduct(id).catch(() => {})
      await patchRows('/api/products?', (data) => {
        if (!data || !Array.isArray(data.data)) return null
        return { ...data, data: data.data.filter((p: any) => Number(p?.id) !== id), total: Math.max(0, (Number(data.total) || 1) - 1) }
      })
    } else {
      await idb.updateProduct(id, body || {}).catch(() => {})
      await patchRows('/api/products?', (data) => {
        if (!data || !Array.isArray(data.data)) return null
        return { ...data, data: data.data.map((p: any) => (Number(p?.id) === id ? { ...p, ...(body || {}) } : p)) }
      })
    }
    return
  }

  if (entity === 'expenses') {
    await patchRows('/api/expenses', (data) => {
      if (!data || !Array.isArray(data.expenses)) return null
      let list = data.expenses
      if (isDelete) {
        list = list.filter((e: any) => Number(e?.id) !== id)
      } else if (body && typeof body === 'object') {
        list = list.map((e: any) =>
          Number(e?.id) === id
            ? { ...e, category: body.category ?? e.category, amount: body.amount !== undefined ? round2(body.amount) : e.amount, note: body.note !== undefined ? body.note : e.note }
            : e,
        )
      } else {
        return null
      }
      const total = round2(list.reduce((s: number, e: any) => s + (Number(e?.amount) || 0), 0))
      const byCategory: Record<string, number> = {}
      for (const e of list) byCategory[e.category] = round2((byCategory[e.category] || 0) + (Number(e.amount) || 0))
      return { ...data, expenses: list, total, byCategory }
    })
    return
  }

  // customers / suppliers / branches / inventory/transfers — حذف من المصفوفة
  // (والحذف هو الحالة العملية الوحيدة المهمة أوفلاين لكل ما عدا المنتجات)
  const arrayPrefix =
    entity === 'inventory/transfers' ? '/api/inventory/transfers' : `/api/${entity}`
  await patchRows(arrayPrefix, (data) => {
    if (!Array.isArray(data)) return null
    return data.filter((x: any) => Number(x?.id) !== id)
  })
}

/**
 * 🛡️ v11 — نقطة الدخول: بعد أي كتابة أوفلاين (اتقيدت في الـ outbox) طبّق
 * أثرها على نسخ الكاش المحلية فوراً. بترجّع { id } للسجل اللي اتبنى منه
 * id مؤقت (المنتجات) — أو null. لا رميات أبداً — أي فشل يُتجاهل بصمت،
 * فده تحسين عرض مش شرط صحة للحفظ.
 */
async function applyLocalMutation(url: string, method: string, body: any, outboxId?: string): Promise<{ id?: number } | null> {
  // نفضّي كاش الميموري + نرفع طابع الإبطال — الصفحات هتقرأ من IDB
  // (اللي لسا موجود ومدموج) بدل النسخ القديمة في الميموري.
  memCache.clear()
  getStore().invalidatedAt = Date.now()

  const path = url.split('?')[0]
  if (method === 'POST') {
    if (path === '/api/sales') await patchSaleAdded(body)
    else if (path === '/api/expenses') await patchExpenseAdded(body)
    else if (path === '/api/cash') await patchCashAdded(body)
    else if (path === '/api/customers') await patchListAdded('/api/customers', body ? { ...body, id: localId(), balance: 0 } : null)
    else if (path === '/api/suppliers') await patchListAdded('/api/suppliers', body ? { ...body, id: localId(), balance: 0 } : null)
    else if (path === '/api/branches') await patchListAdded('/api/branches', body ? { ...body, id: localId(), active: body.active !== false, isMain: body.isMain === true, createdAt: new Date().toISOString() } : null)
    else if (path === '/api/purchase-orders') {
      const rec = await buildLocalPurchaseOrder(body)
      if (rec) await patchListAdded('/api/purchase-orders', rec)
    } else if (path === '/api/inventory/movements') await patchMovementAdded(body)
    else if (path === '/api/inventory/transfers') await patchTransferAdded(body)
    else if (path === '/api/inventory/stocktake') await patchStocktakeAdded(body)
    else if (path === '/api/products') {
      await patchProductAdded(body, outboxId)
      // النداء اللي بيستخدم ردّ الـ POST محتاج الـ id المؤقت نفسه
      if (outboxId) return { id: -(hashStr(outboxId) + 1) }
    }
  } else if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
    await patchEntityEdit(url, method, body)
  }
  return null
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
