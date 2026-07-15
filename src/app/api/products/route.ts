import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Ensure a category row exists for the given name (auto-create feature) — tenant scoped. */
export async function ensureCategory(
  name: string | null | undefined,
  tenantId: string
): Promise<string | null> {
  if (!name || !name.trim()) return null
  const clean = name.trim()
  const existing = await db.category.findFirst({
    where: { tenantId, name: clean },
  })
  if (!existing) {
    await db.category.create({ data: { tenantId, name: clean } })
  }
  return clean
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() || ''
  const category = searchParams.get('category')?.trim() || ''

  const where: any = { tenantId: session.tenantId, AND: [] as any[] }
  const branchIdParam = searchParams.get('branchId')
  if (session.branchId) {
    where.AND.push({ OR: [{ branchId: session.branchId }, { branchId: null }] })
  } else if (branchIdParam && branchIdParam !== 'all') {
    if (branchIdParam === 'none') where.branchId = null
    else where.branchId = parseInt(branchIdParam, 10)
  }
  if (search) {
    where.AND.push({ OR: [
      { name: { contains: search } },
      { barcode: { contains: search } },
    ]})
  }
  if (category && category !== 'all') {
    where.category = category
  }

  const products = await db.product.findMany({
    where,
    orderBy: { id: 'desc' },
  })
  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const name = String(body.name ?? '').trim()
  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  const price = Number(body.price)
  if (isNaN(price) || price < 0) {
    return NextResponse.json({ error: 'سعر البيع غير صالح' }, { status: 400 })
  }
  // auto-create category inline if it doesn't exist
  let category: string | null = null
  if (body.category && String(body.category).trim()) {
    category = await ensureCategory(String(body.category), session.tenantId)
  }
  const barcode = body.barcode ? String(body.barcode).trim() || null : null
  // ensure unique barcode (treat empty as null)
  if (barcode) {
    const exists = await db.product.findUnique({ where: { barcode } })
    if (exists) {
      return NextResponse.json(
        { error: 'الباركود مستخدم بالفعل' },
        { status: 400 }
      )
    }
  }
  const created = await db.product.create({
    data: {
      tenantId: session.tenantId,
      name,
      category,
      barcode,
      price,
      cost: Number(body.cost ?? 0) || 0,
      quantity: parseInt(body.quantity ?? 0, 10) || 0,
      minQuantity: parseInt(body.minQuantity ?? 1, 10) || 1,
      imagePath: body.imagePath ? String(body.imagePath) : null,
      branchId: session.branchId ?? (body.branchId ? parseInt(body.branchId, 10) : null),
    },
  })
  // stock in movement on initial quantity
  const initialQty = parseInt(body.quantity ?? 0, 10) || 0
  if (initialQty > 0) {
    await db.stockMovement.create({
      data: {
        tenantId: session.tenantId,
        branchId: created.branchId,
        productId: created.id,
        type: 'in',
        quantity: initialQty,
        refType: 'manual',
        note: 'رصيد افتتاحي',
        userId: session.userId,
      },
    })
  }
  return NextResponse.json(created, { status: 201 })
}
