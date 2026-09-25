import { withDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse, stopImpersonation } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __POST() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  await stopImpersonation()
  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
