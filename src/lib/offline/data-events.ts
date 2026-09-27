/**
 * 🛡️ ROOT FIX (2026-09-27): "لازم أعمل هارد ريفرش عشان يبان" — most
 * mutations (add product, change quantity, add a payment, ...) saved fine
 * on the server but the screen the user was looking at (or a sibling
 * dialog/list mounted at the same time) kept showing the old data until a
 * full hard refresh forced every component to re-mount and re-fetch.
 *
 * Root cause: every list/dialog fetched its own data once on mount and only
 * ever refetched if THAT SAME component's own save-handler happened to call
 * its own `load()` afterwards. That works for the component that owns the
 * dialog that did the write (e.g. ProductDialog → ProductsView), but not for:
 *   - a second open view/dialog showing the same data (e.g. edit a customer's
 *     balance from CustomerDetailDialog while CustomersView list is open
 *     behind it — the dialog's own `load()` refreshes the dialog, but nobody
 *     ever told the list behind it to refetch)
 *   - views that show *related* data (adding a sale should refresh products'
 *     stock, the customer's balance, and the cash drawer, not just "sales")
 *   - anything queued offline: once the outbox flushes and syncs, no one
 *     tells the currently-open screens to reload the now-correct server data
 *
 * The fix is a tiny pub/sub bus: every successful write made through the
 * shared `api()`/`offlineFetch()` wrapper (and every successful offline-sync
 * flush) announces WHICH kinds of data just changed. Any mounted view/dialog
 * can subscribe with `useDataRefresh([...tags], refetchFn)` and will refetch
 * live, no manual wiring of onSaved/onChanged between parent/child required.
 */

import { useEffect, useRef } from 'react'

export const DATA_CHANGED_EVENT = 'shop:data-changed'

export type DataTag =
  | 'products'
  | 'categories'
  | 'customers'
  | 'suppliers'
  | 'sales'
  | 'purchase-orders'
  | 'expenses'
  | 'cash'
  | 'inventory'
  | 'maintenance'
  | 'notifications'
  | 'branches'
  | 'users'
  | 'dashboard'
  | 'settings'

export interface DataChangedDetail {
  tags: DataTag[]
  url: string
  method: string
}

/**
 * Map a written URL to every tag of data it can affect. Errs on the side of
 * over-invalidating (e.g. a sale also touches products/customers/cash) —
 * for a shop's books, a screen refetching one extra time is free; a screen
 * silently showing stale stock or a stale balance is not.
 */
export function resourceTagsForUrl(url: string): DataTag[] {
  const path = url.split('?')[0]
  const tags = new Set<DataTag>()
  const has = (s: string) => path.includes(s)

  if (has('/api/products')) tags.add('products')
  if (has('/api/categories')) tags.add('categories')

  if (has('/api/customers')) {
    tags.add('customers')
    if (has('/payments')) tags.add('cash')
  }
  if (has('/api/suppliers')) {
    tags.add('suppliers')
    if (has('/payments')) tags.add('cash')
  }
  if (has('/api/sales')) {
    tags.add('sales')
    tags.add('products')
    tags.add('customers')
    tags.add('cash')
  }
  if (has('/api/purchase-orders') || has('/api/purchases')) {
    tags.add('purchase-orders')
    tags.add('suppliers')
    tags.add('products')
    tags.add('inventory')
    tags.add('cash')
  }
  if (has('/api/expenses')) {
    tags.add('expenses')
    tags.add('cash')
  }
  if (has('/api/cash')) tags.add('cash')
  if (has('/api/inventory')) {
    tags.add('inventory')
    tags.add('products')
  }
  if (has('/api/maintenance')) {
    tags.add('maintenance')
    tags.add('customers')
    tags.add('cash')
  }
  if (has('/api/notifications')) tags.add('notifications')
  if (has('/api/branches')) tags.add('branches')
  if (has('/api/users') || has('/api/employees')) tags.add('users')
  if (has('/api/settings') || has('/api/tenant')) tags.add('settings')

  // Anything that changed data should also nudge the dashboard, since it
  // summarizes almost everything above.
  if (tags.size > 0) tags.add('dashboard')

  return Array.from(tags)
}

export function emitDataChanged(url: string, method: string) {
  if (typeof window === 'undefined') return
  const tags = resourceTagsForUrl(url)
  if (tags.length === 0) return
  window.dispatchEvent(
    new CustomEvent<DataChangedDetail>(DATA_CHANGED_EVENT, { detail: { tags, url, method } })
  )
}

/**
 * Subscribe a refetch callback to one or more data tags. Fires whenever any
 * write anywhere in the app (this tab) — including a synced offline
 * operation — touches one of the given tags.
 *
 * Usage: `useDataRefresh(['customers'], load)` inside CustomersView AND
 * inside CustomerDetailDialog — a payment added from the dialog will now
 * refresh both live, with no prop-drilled onSaved/onChanged needed.
 */
export function useDataRefresh(tags: DataTag[], onChange: () => void, enabled = true) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange
  const tagsKey = tags.join(',')

  useEffect(() => {
    if (!enabled) return
    function handler(e: Event) {
      const detail = (e as CustomEvent<DataChangedDetail>).detail
      if (!detail) return
      if (detail.tags.some((t) => tagsKey.split(',').includes(t))) {
        cbRef.current()
      }
    }
    window.addEventListener(DATA_CHANGED_EVENT, handler)
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsKey, enabled])
}
