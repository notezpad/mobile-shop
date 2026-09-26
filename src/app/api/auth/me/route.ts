import { withDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getSession, getImpersonatedTenantId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __GET() {
  const s = await getSession()
  if (!s) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  let tenantId = s.tenantId
  let impersonating = false
  if (s.role === 'SUPER_ADMIN') {
    const imp = await getImpersonatedTenantId()
    if (imp) {
      tenantId = imp
      impersonating = true
    }
  }
  const res = NextResponse.json({
    ok: true,
    user: {
      userId: s.userId,
      name: s.name,
      email: s.email,
      role: s.role,
      tenantId,
      branchId: s.branchId ?? null,
      impersonating,
    },
  })
  // 🛡️ FIX (stuck-logout / "unauthorized" toast storm / data goes blank):
  // this used to be `private, max-age=60, stale-while-revalidate=120` as a
  // perf tweak. That let the BROWSER'S OWN HTTP cache keep answering
  // "yes, you're logged in" from this exact GET URL for up to 60s (and up
  // to 3 minutes total with stale-while-revalidate) — completely
  // independent of the `shop_session` cookie. So right after logout:
  //   - the session cookie is gone on the server (logout worked),
  //   - but the client's next `getMe()` call could still be served the
  //     STALE cached "logged in" response by the browser, so the app kept
  //     rendering the authed dashboard,
  //   - while every OTHER data request (products, sales, dashboard...)
  //     is genuinely unauthenticated and gets a real 401 → each of those
  //     views shows a "غير مصرح — يرجى تسجيل الدخول" toast and empties
  //     its data,
  //   - and pressing "logout" again does nothing new, because the stale
  //     cache entry isn't invalidated by hitting /api/auth/logout — the
  //     user has to wait out the cache window (or hard-refresh) before
  //     `/api/auth/me` finally answers for real.
  // This endpoint is a cheap JWT check (no DB query), so there's no real
  // perf cost to never caching it — and never caching it means the app's
  // idea of "who is logged in" is always correct within one request.
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
