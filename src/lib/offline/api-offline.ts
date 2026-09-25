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
  options?: { method?: string; body?: any; signal?: AbortSignal }
): Promise<T> {
  const method = options?.method ?? 'GET'
  const isWrite = method !== 'GET'

  // ── Write operations ──────────────────────────────────
  if (isWrite) {
    try {
      const res = await fetch(url, {
        method,
        headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options?.signal,
      })
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
        throw err
      }
      return data as T
    } catch (err: any) {
      if (isNetworkError(err)) {
        await idb.addToOutbox({
          url, method,
          body: options?.body,
          label: getOperationLabel(url, method, options?.body),
        })
        return { ok: true, offline: true, message: 'تم الحفظ محلياً — سيتم المزامنة عند عودة الاتصال' } as T
      }
      throw err
    }
  }

  // ── GET operations ───────────────────────────────────
  // Step 1: Try fetching from server
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'default',
      signal: options?.signal,
    })
    const text = await res.text()
    let data: any = null
    if (text) {
      try { data = JSON.parse(text) } catch { data = text }
    }
    if (!res.ok) {
      const msg = (data && typeof data === 'object' && (data.error || data.message)) || `طلب فاشل (${res.status})`
      const err = new Error(typeof msg === 'string' ? msg : 'طلب فاشل') as Error & { status?: number }
      err.status = res.status
      throw err
    }
    // Success → cache + return
    await idb.setCached(url, data)
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
