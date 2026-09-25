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
  // ⚡ Cache for 60 seconds — user session data rarely changes
  res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
  return res
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
