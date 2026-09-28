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
import { isOnline, isNetworkError } from './api-offline'
import { prewarmAll } from './prewarm'
import { emitDataChanged } from './data-events'

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

    for (const entry of entries) {
      try {
        const res = await fetch(entry.url, {
          method: entry.method,
          headers: entry.body !== undefined ? { 'Content-Type': 'application/json' } : {},
          body: entry.body !== undefined ? JSON.stringify(entry.body) : undefined,
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
  const timeoutId = setTimeout(() => void fullSync(), 2000)

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
