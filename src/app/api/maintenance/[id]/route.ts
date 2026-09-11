import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['مستلم', 'قيد العمل', 'مكتمل', 'مُسلَّم']

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
    await requireModule(session, 'maintenance')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.maintenanceOrder.findUnique({ where: { id: oid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json(
      { error: 'أوردر الصيانة غير موجود' },
      { status: 404 }
    )
  }

  const nextStatus =
    body.status !== undefined ? String(body.status) : existing.status
  if (!VALID_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
  }

  // transition to delivered → set deliveredAt + create CashEntry once
  const becomingDelivered =
    nextStatus === 'مُسلَّم' && existing.status !== 'مُسلَّم'

  const updated = await db.$transaction(async (tx) => {
    const ord = await tx.maintenanceOrder.update({
      where: { id: oid },
      data: {
        customerName: body.customerName !== undefined ? String(body.customerName).trim() : undefined,
        phone: body.phone !== undefined ? (body.phone ? String(body.phone) : null) : undefined,
        device: body.device !== undefined ? String(body.device).trim() : undefined,
        issue: body.issue !== undefined ? String(body.issue) : undefined,
        cost: body.cost !== undefined ? Number(body.cost) || 0 : undefined,
        status: nextStatus,
        deliveredAt: becomingDelivered ? new Date() : existing.deliveredAt,
      },
    })
    if (becomingDelivered && ord.cost > 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'maintenance',
          refId: oid,
          amount: ord.cost,
          note: `صيانة - ${ord.customerName} (${ord.device})`,
          userId: session.userId,
        },
      })
    }
    return ord
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
    await requireModule(session, 'maintenance')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const existing = await db.maintenanceOrder.findUnique({ where: { id: oid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json(
      { error: 'أوردر الصيانة غير موجود' },
      { status: 404 }
    )
  }
  await db.maintenanceOrder.delete({ where: { id: oid } })
  return NextResponse.json({ ok: true })
}
