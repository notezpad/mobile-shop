import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse, getPlanContext, requireModule, requireModuleWritePermission } from '@/lib/features'

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

  // saleh-mowazaf: module 'products'
  try { requireModule(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })

  // 🛡️ 2026-09-27: مفيش تفعيل/تعطيل يدوي تاني (wholesaleEnabled) — الوحدات
  // بتظهر تلقائي لو، وبس لو، الباقة فيها capability = multi_unit (احترافية).
  const planCtx = await getPlanContext(session.tenantId)
  if (!planCtx.capabilities.includes('multi_unit')) {
    return NextResponse.json([])
  }

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

async function __POST(
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
  // saleh-kateb-mowazaf: module 'products'
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
