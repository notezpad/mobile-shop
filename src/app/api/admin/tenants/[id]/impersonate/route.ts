import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import {
  requireSuperAdmin,
  authErrorResponse,
  startImpersonation,
  PLATFORM_TENANT_ID,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  if (id === PLATFORM_TENANT_ID) {
    return NextResponse.json({ error: 'لا يمكن انتحال هوية المحل المنطقي' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({ where: { id } })
  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  await startImpersonation(id)
  return NextResponse.json({ ok: true, tenantId: id, shopName: tenant.shopName })
}
