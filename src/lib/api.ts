'use client'

/**
 * Offline-aware API wrapper.
 *
 * GET requests:
 *   - Online: fetch from server + cache in IndexedDB
 *   - Offline: return cached response from IndexedDB
 *
 * Write requests (POST/PUT/PATCH/DELETE):
 *   - Online: fetch directly from server
 *   - Offline: queue in outbox (IndexedDB) + return optimistic success
 *
 * When the network comes back, the sync engine flushes the outbox
 * and pulls fresh data from the server.
 */

import { offlineFetch } from './offline/api-offline'

export async function api<T = any>(
  url: string,
  options?: { method?: string; body?: any; signal?: AbortSignal; idempotent?: boolean }
): Promise<T> {
  return offlineFetch<T>(url, options)
}
