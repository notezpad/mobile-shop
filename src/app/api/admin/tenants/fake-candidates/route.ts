import { NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { findInactiveTrials } from '@/lib/admin-fake-tenants'

export const dynamic = 'force-dynamic'

async function __GET() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const rows = await findInactiveTrials()
  // المشكوك فيهم الأول
  rows.sort((a, b) => Number(b.suspicious) - Number(a.suspicious))
  return NextResponse.json({
    candidates: rows.map(({ userIds: _u, ...r }) => r),
  })
}

export async function GET() {
  return withDb(() => __GET())
}
