import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'

export const dynamic = 'force-dynamic'

async function loadTenantProduct(tenantId: string, productId: number) {
  const p = await db.product.findUnique({ where: { id: productId } })
  if (!p || p.tenantId !== tenantId) return null
  return p
}

async function __GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })

  const variants = await db.productVariant.findMany({
    where: { productId: pid },
    orderBy: { id: 'asc' },
  })
  return NextResponse.json(variants)
}

async function __POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const size = body?.size ? String(body.size).trim() || null : null
  const color = body?.color ? String(body.color).trim() || null : null
  const barcode = body?.barcode ? String(body.barcode).trim() || null : null
  const quantity = parseInt(body?.quantity ?? 0, 10) || 0
  if (!size && !color) {
    return NextResponse.json({ error: 'لازم مقاس أو لون على الأقل' }, { status: 400 })
  }
  try {
    const created = await db.productVariant.create({
      data: { productId: pid, size, color, barcode, quantity },
    })
    // Keep Product.quantity as the sum of all its variants from here on.
    await syncProductQuantityFromVariants(db, pid)
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'الباركود مستخدم بالفعل' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل إنشاء المتغير' }, { status: 500 })
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
