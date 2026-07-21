import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

async function loadTenantProduct(tenantId: string, productId: number) {
  const p = await db.product.findUnique({ where: { id: productId } })
  if (!p || p.tenantId !== tenantId) return null
  return p
}

export async function GET(
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

  const { searchParams } = new URL(_req.url)
  const status = searchParams.get('status') || 'active'
  const where: any = { productId: pid }
  if (status === 'active') where.active = true
  else if (status === 'inactive') where.active = false

  const units = await db.productUnit.findMany({
    where,
    orderBy: { id: 'asc' },
  })
  return NextResponse.json(units)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'multi_unit')
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
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: 'اسم الوحدة مطلوب' }, { status: 400 })
  }
  const name = String(body.name).trim()
  const price =
    body.price != null && body.price !== '' ? Number(body.price) : null
  if (price != null && (isNaN(price) || price < 0)) {
    return NextResponse.json({ error: 'سعر غير صالح' }, { status: 400 })
  }
  const barcode = body.barcode ? String(body.barcode).trim() || null : null
  const factor =
    body.factor != null && body.factor !== '' ? parseInt(body.factor, 10) : null

  if (!factor || factor <= 0) {
    return NextResponse.json(
      { error: 'الوحدة محتاجة عدد قطع صحيح (factor) أكبر من صفر' },
      { status: 400 },
    )
  }

  try {
    const created = await db.productUnit.create({
      data: {
        productId: pid,
        name,
        price: price ?? undefined,
        barcode,
        factor,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'اسم الوحدة مستخدم بالفعل لهذا المنتج' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل إنشاء الوحدة' }, { status: 500 })
  }
}
