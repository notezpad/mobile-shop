import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

async function loadOwned(tenantId: string, pid: number, vid: number) {
  const v = await db.productVariant.findUnique({ where: { id: vid } })
  if (!v || v.productId !== pid) return null
  const p = await db.product.findUnique({ where: { id: pid } })
  if (!p || p.tenantId !== tenantId) return null
  return v
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id, vid } = await params
  const pid = parseInt(id, 10)
  const vId = parseInt(vid, 10)
  const owned = await loadOwned(session.tenantId, pid, vId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (body.size !== undefined) data.size = body.size ? String(body.size).trim() : null
  if (body.color !== undefined) data.color = body.color ? String(body.color).trim() : null
  if (body.barcode !== undefined) data.barcode = body.barcode ? String(body.barcode).trim() : null
  if (body.quantity !== undefined) data.quantity = parseInt(body.quantity, 10) || 0

  try {
    const updated = await db.productVariant.update({ where: { id: vId }, data })
    return NextResponse.json(updated)
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'الباركود مستخدم' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id, vid } = await params
  const pid = parseInt(id, 10)
  const vId = parseInt(vid, 10)
  const owned = await loadOwned(session.tenantId, pid, vId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  await db.productVariant.delete({ where: { id: vId } })
  return NextResponse.json({ ok: true })
}
