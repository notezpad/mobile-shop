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
  }
  // 🛡️ 2026-09-27 (v6): customer payments live at the FLAT route
  // `/api/payments` (see src/app/api/payments/route.ts), not under
  // `/api/customers/.../payments`. The old check above only ever looked
  // for `/api/customers` + `/payments` together, which this URL never
  // satisfies — so recording/deleting a customer payment silently never
  // tagged 'customers' or 'cash' and every other open view/dialog kept
  // showing the pre-payment balance until an unrelated write happened to
  // touch one of those tags (or a full remount forced a refetch).
  if (has('/api/payments')) {
    tags.add('customers')
    tags.add('cash')
  }
  if (has('/api/suppliers')) {
    tags.add('suppliers')
  }
  // 🛡️ 2026-09-27 (v6): same bug, supplier side. The route is
  // `/api/supplier-payments` (see src/app/api/supplier-payments/route.ts)
  // — a SEPARATE path that does not contain the substring
  // `/api/suppliers` (it's "supplier-payments", not "suppliers-payments"),
  // so `has('/api/suppliers')` above was always false for it and no tag
  // ever fired for a supplier payment.
  if (has('/api/supplier-payments')) {
    tags.add('suppliers')
    tags.add('cash')
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
  // 🛡️ 2026-09-27 (v6): `/api/finance` (deposits/withdrawals in
  // FinanceView — vodafone_cash/instapay/fawry) moves money in/out of the
  // drawer just like /api/cash does, but had no tag at all. FinanceView,
  // CashView and ReportsView all subscribe to 'cash', so a deposit/
  // withdraw there was invisible to every one of them until an unrelated
  // write happened to fire 'cash' first.
  if (has('/api/finance')) tags.add('cash')
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

// ─── تجميع الأحداث (batching) ───────────────────────────────────────────
// عمليات الإضافة الجماعية (مثلاً 18 لون/مقاس ورا بعض) كانت بتطلق حدث تحديث
// مع كل طلب → الشاشات اللي ورا (المنتجات/المخزون/اللوحة) بتعيد الجلب 18 مرة
// وبتطلع/تنزل مع كل مرة. دلوقتي الكتابة جوه batch بتجمّع الـ tags وتطلق
// حدث واحد في الآخر → تحديث واحد وحركة واحدة.
let batchDepth = 0
const batchedTags = new Set<DataTag>()
let batchedMeta: { url: string; method: string } | null = null

function dispatchTags(tags: DataTag[], url: string, method: string) {
  if (tags.length === 0) return
  window.dispatchEvent(
    new CustomEvent<DataChangedDetail>(DATA_CHANGED_EVENT, { detail: { tags, url, method } })
  )
}

export function beginDataBatch() {
  batchDepth++
}

export function endDataBatch() {
  if (batchDepth === 0) return
  batchDepth--
  if (batchDepth === 0 && batchedTags.size > 0 && batchedMeta && typeof window !== 'undefined') {
    const tags = Array.from(batchedTags)
    const { url, method } = batchedMeta
    batchedTags.clear()
    batchedMeta = null
    dispatchTags(tags, url, method)
  }
}

/** شغّل fn وكل أحداث التحديث اللي جواها تتجمّع في حدث واحد بعد ما تخلص. */
export async function withDataBatch<T>(fn: () => Promise<T>): Promise<T> {
  beginDataBatch()
  try {
    return await fn()
  } finally {
    endDataBatch()
  }
}

export function emitDataChanged(url: string, method: string) {
  if (typeof window === 'undefined') return
  const tags = resourceTagsForUrl(url)
  if (tags.length === 0) return
  if (batchDepth > 0) {
    tags.forEach((t) => batchedTags.add(t))
    batchedMeta = { url, method }
    return
  }
  dispatchTags(tags, url, method)
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
  // 🛡️ 2026-10-19: تحديث الـ ref في effect بدل أثناء الرندر (قاعدة react-hooks/refs)
  useEffect(() => { cbRef.current = onChange })
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
     
  }, [tagsKey, enabled])
}
