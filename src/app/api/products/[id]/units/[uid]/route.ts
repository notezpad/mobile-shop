import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

async function loadOwned(tenantId: string, pid: number, uid: number) {
  const u = await db.productUnit.findUnique({ where: { id: uid } })
  if (!u || u.productId !== pid) return null
  const p = await db.product.findUnique({ where: { id: pid } })
  if (!p || p.tenantId !== tenantId) return null
  return u
}

async function __PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'multi_unit')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id, uid } = await params
  const pid = parseInt(id, 10)
  const uId = parseInt(uid, 10)
  const owned = await loadOwned(session.tenantId, pid, uId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const updated = await db.productUnit.update({
    where: { id: uId },
    data: { active: body.active },
  })
  return NextResponse.json(updated)
}

async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'multi_unit')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id, uid } = await params
  const pid = parseInt(id, 10)
  const uId = parseInt(uid, 10)
  const owned = await loadOwned(session.tenantId, pid, uId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  try {
    await db.productUnit.delete({ where: { id: uId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'تعذّر حذف الوحدة (مرتبطة بمبيعات سابقة) — يمكنك تعطيلها بدلاً من ذلك' },
      { status: 400 },
    )
  }
}

export async function PATCH(...args: Parameters<typeof __PATCH>) {
  return withDb(() => __PATCH(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
