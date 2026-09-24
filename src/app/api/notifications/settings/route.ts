import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/settings
 * Returns the tenant's notification preferences.
 */
export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      notifyLowStock: true,
      notifyExpiringSubscription: true,
      notifyNewSales: true,
    },
  })

  if (!tenant) return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })

  return NextResponse.json(tenant)
}

/**
 * PUT /api/notifications/settings
 * Update the tenant's notification preferences.
 * Body: { notifyLowStock?, notifyExpiringSubscription?, notifyNewSales? }
 */
export async function PUT(req: Request) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })

  const data: any = {}
  if (typeof body.notifyLowStock === 'boolean') data.notifyLowStock = body.notifyLowStock
  if (typeof body.notifyExpiringSubscription === 'boolean') data.notifyExpiringSubscription = body.notifyExpiringSubscription
  if (typeof body.notifyNewSales === 'boolean') data.notifyNewSales = body.notifyNewSales

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'لا توجد بيانات للتحديث' }, { status: 400 })
  }

  const updated = await db.tenant.update({
    where: { id: session.tenantId },
    data,
    select: {
      notifyLowStock: true,
      notifyExpiringSubscription: true,
      notifyNewSales: true,
    },
  })

  return NextResponse.json(updated)
}
