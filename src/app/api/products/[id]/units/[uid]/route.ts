import { findBarcodeConflict, barcodeConflictMessage } from '@/lib/barcode-conflict'
import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse, requireModuleWritePermission } from '@/lib/features'
import { normalizeBarcode } from '@/lib/barcode'

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
  // saleh-kateb-mowazaf: module 'products'
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id, uid } = await params
  const pid = parseInt(id, 10)
  const uId = parseInt(uid, 10)
  const owned = await loadOwned(session.tenantId, pid, uId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  // يقبل active و/أو barcode (تعيين/تغيير/مسح باركود الوحدة)
  const data: { active?: boolean; barcode?: string | null } = {}
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    data.active = body.active
  }
  if (body.barcode !== undefined) {
    const bc = normalizeBarcode(body.barcode)
    if (bc && bc.length > 64) return NextResponse.json({ error: 'الباركود أطول من الطبيعي (64 حرف)' }, { status: 400 })
    data.barcode = bc
    if (bc) {
      const prod = await db.product.findUnique({ where: { id: pid }, select: { branchId: true } })
      const owner = await findBarcodeConflict(session.tenantId, prod?.branchId ?? null, bc, { unitId: uId })
      if (owner) return NextResponse.json({ error: barcodeConflictMessage(owner) }, { status: 400 })
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  try {
    const updated = await db.productUnit.update({ where: { id: uId }, data })
    return NextResponse.json(updated)
  } catch (e: any) {
    // الـ unique index / trigger هما الحاجز الأخير لو حصل تسابق
    if (e?.code === 'P2002' || String(e?.message ?? '').includes('نفس الفرع')) {
      return NextResponse.json({ error: 'الباركود مستخدم بالفعل' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل تحديث الوحدة' }, { status: 500 })
  }
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
