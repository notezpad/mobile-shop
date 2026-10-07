'use client'

import * as React from 'react'
import { useShopStore } from '@/lib/store'
import { clearAuthSnapshot } from '@/lib/auth-client'

/**
 * 🛡️ FIX (stuck-logout / "unauthorized" toast storm / data goes blank):
 *
 * Every data-fetching view (dashboard, products, sales, ...) independently
 * catches its own failed request and shows a toast — that's fine for most
 * errors, but for a 401 ("غير مصرح — يرجى تسجيل الدخول") it meant the app
 * just sat there with the authed shell still mounted while each widget
 * silently emptied out and complained on its own. Nothing actually moved
 * the user back to the login screen, so clicking "logout" again did
 * nothing new and the page looked stuck.
 *
 * `src/lib/offline/api-offline.ts` now fires a `shop:session-expired`
 * event the first time any API call gets a real 401. This component just
 * listens for that, once, near the app root, and clears the local `user`.
 * The existing boot logic in `src/app/(shop)/layout.tsx` and
 * `src/app/page.tsx` already watches `user` becoming null and redirects to
 * the login page on its own — so this is the only piece that was missing
 * to make that redirect actually happen for a real expired/cleared session,
 * not just for the explicit logout button.
 */
export function SessionGuard() {
  const setUser = useShopStore((s) => s.setUser)

  React.useEffect(() => {
    const onSessionExpired = () => {
      setUser(null)
      // 🛡️ PWA (2026-10-07): سيشن منتهية حقيقية (401 من السيرفر) = نمسح
      // كمان النسخة المحفوظة أوفلاين — وإلا المستخدم كان ممكن يعيد فتح
      // النظام أوفلاين بحساب سيسحنه انتهت فعلياً على السيرفر.
      void clearAuthSnapshot()
    }
    window.addEventListener('shop:session-expired', onSessionExpired)
    return () => window.removeEventListener('shop:session-expired', onSessionExpired)
  }, [setUser])

  return null
}
