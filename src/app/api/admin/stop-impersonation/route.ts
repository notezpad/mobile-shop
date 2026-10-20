import { withDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse, stopImpersonation, getImpersonatedTenantId } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function __POST() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const prev = await getImpersonatedTenantId()
  await stopImpersonation()
  await logAudit({ action: 'impersonate.stop', targetType: 'tenant', targetId: prev })
  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
