/**
 * Sync engine — flushes outbox + pre-warms data.
 *
 * Flow:
 *   1. On app boot → pre-warm (pull products + endpoints to IDB)
 *   2. When network comes back → flush outbox + re-warm
 *   3. Periodic (every 2 min) → flush + re-warm if online
 *   4. Retry failed entries up to 5 times
 */

import { idb, type OutboxEntry } from './idb'
import { isOnline, isNetworkError, hashStr } from './api-offline'
import { prewarmAll } from './prewarm'
import { emitDataChanged } from './data-events'

/**
 * 🛡️ v5: استبدال الـ ids المؤقتة السالبة للمنتجات المضافة أوفلاين بالـ ids
 * الحقيقية قبل إرسال أي عملية للمزامنة. لما مستخدم يضيف منتج أوفلاين ثم
 * يبيعه قبل رجوع النت، الفاتورة في الـ outbox بتحمل productId سالب —
 * من غير الاستبدال ده فاتورة البيع كانت هتفشل على السيرفر (منتج مش موجود)
 * وتتضيع بعد 5 محاولات. الخريطة بتتبني من ردود إنشاء المنتجات الناجحة
 * (localProductMap — شوف idb.ts) والمفاتيح فيها الـ refs المحلية.
 */
function remapLocalProductIds(body: any, map: Record<string, number>): any {
  if (!body || typeof body !== 'object') return body
  const synToReal = new Map<number, number>()
  for (const [ref, real] of Object.entries(map)) {
    const syn = -(hashStr(ref) + 1)
    if (Number.isFinite(real)) synToReal.set(syn, real)
  }
  if (synToReal.size === 0) return body
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: any = {}
      for (const [k, val] of Object.entries(v)) {
        if (
          k === 'productId' &&
          typeof val === 'number' &&
          val < 0 &&
          synToReal.has(val)
        ) {
          out[k] = synToReal.get(val)
        } else {
          out[k] = walk(val)
        }
      }
      return out
    }
    return v
  }
  return walk(body)
}

export type SyncState = {
  online: boolean
  syncing: boolean
  pending: number
  prewarmed: number
  lastSyncAt: number | null
  lastError: string | null
}

let state: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  prewarmed: 0,
  lastSyncAt: null,
  lastError: null,
}

const subs = new Set<(s: SyncState) => void>()

export function getSyncState(): SyncState { return state }
export function subscribeSync(fn: (s: SyncState) => void) {
  subs.add(fn); fn(state); return () => subs.delete(fn)
}
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f(state))
}

/**
 * Flush all pending outbox entries to the server.
 */
export async function flushOutbox(): Promise<{ done: number; failed: number }> {
  if (!isOnline() || state.syncing) return { done: 0, failed: 0 }

  set({ syncing: true, lastError: null })
  let done = 0
  let failed = 0

  try {
    const entries = await idb.getOutbox()
    // 🛡️ v5: خريطة المنتجات المضافة أوفلاين (localRef → realId) — بتُستخدم
    // لاستبدال الـ ids السالبة في أي عملية قبل إرسالها (شوف remapLocalProductIds).
    const localMap = await idb.getLocalProductMap().catch(() => ({}) as Record<string, number>)

    for (const entry of entries) {
      try {
        const mappedBody =
          entry.body !== undefined ? remapLocalProductIds(entry.body, localMap) : undefined
        const res = await fetch(entry.url, {
          method: entry.method,
          headers: {
            ...(mappedBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
            // 🔁 نفس مفتاح المحاولة الأولى — السيرفر مابينفّذش العملية تاني لو كانت اتنفّذت
            ...(entry.idempotencyKey ? { 'Idempotency-Key': entry.idempotencyKey } : {}),
          },
          body: mappedBody !== undefined ? JSON.stringify(mappedBody) : undefined,
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          let err: any = null
          try { err = JSON.parse(text) } catch { err = { error: text } }

          if (res.status >= 500) {
            // Server down → stop, will retry later
            set({ syncing: false, lastError: err?.error || `خطأ في الخادم (${res.status})` })
            return { done, failed }
          }
          // 4xx → invalid operation, discard after 5 tries
          entry.tries += 1
          entry.lastError = err?.error || `خطأ (${res.status})`
          if (entry.tries >= 5) {
            await idb.removeFromOutbox(entry.id)
            failed++
          } else {
            await idb.updateOutboxEntry(entry)
          }
          continue
        }

        // Success
        // 🛡️ v5: منتج أُضيف أوفلاين اتعمل على السيرفر للحظة — نخزّن الـ id
        // الحقيقي عشان باقي العمليات اللي بتشاور عليه (فواتير/حركات) تتظبط.
        if (entry.method === 'POST' && entry.url.startsWith('/api/products')) {
          try {
            const created = await res.clone().json()
            const realId = Number(created?.id)
            if (Number.isFinite(realId) && realId > 0) {
              await idb.setLocalProductMapEntry(entry.id, realId)
            }
          } catch {
            /* الرد مش JSON — نتجاهل */
          }
        }
        await idb.removeFromOutbox(entry.id)
        // 🛡️ ROOT FIX (2026-09-27): an operation made while offline just
        // landed on the server for real — tell any open screen that shows
        // this kind of data to refetch, instead of leaving it showing what
        // was only a local optimistic guess until the user hard-refreshes.
        emitDataChanged(entry.url, entry.method)
        done++
      } catch (err: any) {
        if (isNetworkError(err)) {
          set({ syncing: false, lastError: 'انقطع الاتصال أثناء المزامنة' })
          return { done, failed }
        }
        entry.tries += 1
        entry.lastError = String(err?.message || err)
        if (entry.tries >= 5) {
          await idb.removeFromOutbox(entry.id)
          failed++
        } else {
          await idb.updateOutboxEntry(entry)
        }
      }
    }
  } finally {
    const pending = await idb.pendingCount()
    set({ syncing: false, pending, lastSyncAt: Date.now() })
  }

  return { done, failed }
}

/**
 * Full sync: flush outbox + pre-warm products + endpoints.
 */
export async function fullSync(): Promise<void> {
  if (!isOnline()) return

  // 1. Flush pending writes
  await flushOutbox()

  // 2. Pre-warm (pull fresh data)
  const result = await prewarmAll()
  if (result.products > 0) {
    set({ prewarmed: result.products })
  }
}

/**
 * Start the sync engine — listens for online/offline events.
 */
let started = false

export function startSyncEngine(): () => void {
  if (started || typeof window === 'undefined') return () => {}
  started = true

  set({ online: isOnline() })
  void idb.pendingCount().then((pending) => set({ pending }))
  void idb.productCount().then((count) => set({ prewarmed: count }))

  const onOnline = () => {
    set({ online: true })
    setTimeout(() => void fullSync(), 500)
  }
  const onOffline = () => set({ online: false })

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  // Initial sync after 2 seconds (let page render first)
  const timeoutId = setTimeout(() => void fullSync(), 20000)

  // PERF FIX (2026-09-25): sync every 5 minutes instead of 2, and never while
  // the tab is in the background — background syncs piled up on the server.
  const intervalId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (isOnline()) void fullSync()
  }, 20 * 60 * 1000) // 🛡️ كان 5 دقائق: كان بيسحب كل المنتجات + 8 endpoints كل 5 دقائق لكل تاب مفتوح

  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    clearTimeout(timeoutId)
    clearInterval(intervalId)
    started = false
  }
}

export async function syncNow(): Promise<{ done: number; failed: number }> {
  if (!isOnline()) return { done: 0, failed: 0 }
  await fullSync()
  return flushOutbox()
}
