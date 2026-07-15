import { NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse, stopImpersonation } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  await stopImpersonation()
  return NextResponse.json({ ok: true })
}
