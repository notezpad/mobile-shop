/**
 * useViewRouter — URL ↔ Zustand sync for the shop dashboard views.
 *
 * WHY: Without URL routing, every navigation was a pure client-side state
 * change (Zustand `set({ activeView: k })`). This caused several issues:
 *
 * 1. **No URL in the browser bar** — the browser always showed "/" regardless
 *    of which page the user was on. This is confusing and prevents:
 *    - Bookmarking a specific page
 *    - Sharing a link to a specific page
 *    - Browser back/forward buttons working
 *    - Page refresh keeping the user on the same page
 *
 * 2. **No code-splitting benefit** — without a URL, Next.js can't do
 *    route-level code splitting. All views are lazy-loaded via React.lazy
 *    but there's no route boundary for the bundler to split on.
 *
 * 3. **No prefetching** — the browser can't prefetch the next page's data
 *    because there's no URL to prefetch from.
 *
 * SOLUTION: Sync the active view with the URL hash (#dashboard, #products, etc.).
 * We use hash routing (not path routing) because:
 * - It doesn't trigger a full page reload
 * - It doesn't require Next.js App Router changes
 * - It works with the existing Zustand state management
 * - The browser back/forward buttons work naturally
 *
 * Usage:
 *   const { activeView, setActiveView } = useViewRouter()
 *
 * The hook syncs:
 *   - URL hash → Zustand (on page load + back/forward)
 *   - Zustand → URL hash (on navigation click)
 */

'use client'

import * as React from 'react'
import { useShopStore, type ViewKey } from '@/lib/store'

const VALID_VIEWS: ViewKey[] = [
  'dashboard', 'pos', 'products', 'sales', 'maintenance', 'customers',
  'suppliers', 'purchases', 'inventory', 'finance', 'expenses', 'cash',
  'reports', 'settings', 'users', 'branches',
]

function isValidView(v: string | null): v is ViewKey {
  return v !== null && VALID_VIEWS.includes(v as ViewKey)
}

function getViewFromHash(): ViewKey {
  if (typeof window === 'undefined') return 'dashboard'
  const hash = window.location.hash.replace('#', '')
  return isValidView(hash) ? hash : 'dashboard'
}

function setViewInHash(view: ViewKey) {
  if (typeof window === 'undefined') return
  // Use replaceState for the FIRST navigation (to avoid creating a new
  // history entry on initial load), then pushState for subsequent ones.
  const newUrl = `${window.location.pathname}${window.location.search}#${view}`
  window.history.pushState({ view }, '', newUrl)
}

export function useViewRouter() {
  const activeView = useShopStore((s) => s.activeView)
  const setActiveViewInStore = useShopStore((s) => s.setActiveView)

  // On mount: sync URL hash → Zustand
  React.useEffect(() => {
    const viewFromHash = getViewFromHash()
    if (viewFromHash !== activeView) {
      setActiveViewInStore(viewFromHash)
    }

    // Listen for back/forward buttons
    const onPopState = (e: PopStateEvent) => {
      const view = getViewFromHash()
      setActiveViewInStore(view)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
     
  }, [])

  // Navigation function — updates Zustand AND URL hash
  const setActiveView = React.useCallback(
    (view: ViewKey) => {
      setActiveViewInStore(view)
      setViewInHash(view)
    },
    [setActiveViewInStore]
  )

  return { activeView, setActiveView }
}
