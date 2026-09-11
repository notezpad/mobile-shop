import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { ensureCategory } from '../route'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.product.findUnique({ where: { id: pid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
  }
  const name = String(body.name ?? existing.name).trim()
  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  const price = Number(body.price ?? existing.price)
  if (isNaN(price) || price < 0) {
    return NextResponse.json({ error: 'سعر البيع غير صالح' }, { status: 400 })
  }
  let category: string | null = null
  if (body.category !== undefined) {
    if (body.category && String(body.category).trim()) {
      category = await ensureCategory(String(body.category), session.tenantId)
    } else {
      category = null
    }
  } else {
    category = existing.category
  }
  let barcode: string | null = null
  if (body.barcode !== undefined) {
    barcode = body.barcode ? String(body.barcode).trim() || null : null
    if (barcode) {
      const dup = await db.product.findUnique({ where: { barcode } })
      if (dup && dup.id !== pid) {
        return NextResponse.json(
          { error: 'الباركود مستخدم بالفعل' },
          { status: 400 }
        )
      }
    }
  } else {
    barcode = existing.barcode
  }
  const updated = await db.product.update({
    where: { id: pid },
    data: {
      name,
      category,
      barcode,
      price,
      cost:
        body.cost !== undefined ? Number(body.cost) || 0 : existing.cost,
      quantity:
        body.quantity !== undefined
          ? parseInt(body.quantity, 10) || 0
          : existing.quantity,
      minQuantity:
        body.minQuantity !== undefined
          ? parseInt(body.minQuantity, 10) || 1
          : existing.minQuantity,
      imagePath:
        body.imagePath !== undefined
          ? body.imagePath
            ? String(body.imagePath)
            : null
          : existing.imagePath,
      branchId:
        body.branchId !== undefined
          ? body.branchId
            ? parseInt(body.branchId, 10) || null
            : null
          : existing.branchId,
      // collection — اسم الكوليكشن لميزة الخصم الجماعي (فاشون فقط)
      collection:
        body.collection !== undefined
          ? body.collection
            ? String(body.collection).trim() || null
            : null
          : existing.collection,
    },
  })
  // عند تغيير سعر البيع: إعادة حساب أسعار الوحدات تلقائياً (سعر × factor).
  // يمكن تعطيلها بإرسال recomputeUnitPrices=false.
  const shouldRecompute =
    price !== existing.price && body.recomputeUnitPrices !== false
  if (shouldRecompute) {
    const units = await db.productUnit.findMany({ where: { productId: pid } })
    await Promise.all(
      units.map((u) =>
        db.productUnit.update({
          where: { id: u.id },
          data: { price: Number((price * u.factor).toFixed(2)) },
        }),
      ),
    )
  }
  return NextResponse.json(updated)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.product.findUnique({ where: { id: pid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
  }
  const updated = await db.product.update({
    where: { id: pid },
    data: { active: body.active },
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
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const existing = await db.product.findUnique({ where: { id: pid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
  }
  try {
    await db.product.delete({ where: { id: pid } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'تعذّر حذف المنتج (قد يكون مرتبطاً بمبيعات)' },
      { status: 400 }
    )
  }
}
