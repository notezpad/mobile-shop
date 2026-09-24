import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/notifications/read
 * Mark notifications as read.
 * Body: { id?: number, all?: boolean }
 *   - id: mark single notification as read
 *   - all: mark ALL notifications as read for this tenant
 */
export async function PATCH(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })

  if (body.all === true) {
    await db.notification.updateMany({
      where: { tenantId: session.tenantId, isRead: false },
      data: { isRead: true },
    })
    return NextResponse.json({ ok: true, markedAll: true })
  }

  const id = Number(body.id)
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID مطلوب' }, { status: 400 })
  }

  await db.notification.updateMany({
    where: { id, tenantId: session.tenantId },
    data: { isRead: true },
  })

  return NextResponse.json({ ok: true })
}
