import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get('branchId')
  const productId = searchParams.get('productId')
  const where: any = { tenantId: s.tenantId }
  if (s.branchId) where.branchId = s.branchId
  else if (branchId && branchId !== 'all') where.branchId = parseInt(branchId, 10)
  if (productId) where.productId = parseInt(productId, 10)
  const rows = await db.stockMovement.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 500,
    include: { product: { select: { name: true, barcode: true } }, branch: { select: { name: true } } },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const b = await req.json().catch(() => null)
  const productId = parseInt(b?.productId, 10)
  const qty = parseInt(b?.quantity, 10)
  const type = String(b?.type ?? 'adjust') // in | out | adjust
  if (!productId || !qty) return NextResponse.json({ error: 'المنتج والكمية مطلوبان' }, { status: 400 })
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product || product.tenantId !== s.tenantId) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
  if (s.branchId && product.branchId && product.branchId !== s.branchId) {
    return NextResponse.json({ error: 'لا صلاحية على منتجات فرع آخر' }, { status: 403 })
  }
  let delta = qty
  if (type === 'out') delta = -Math.abs(qty)
  else if (type === 'in') delta = Math.abs(qty)
  else if (type === 'adjust') delta = qty // signed

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { quantity: { increment: delta } } })
    await tx.stockMovement.create({
      data: {
        tenantId: s.tenantId,
        branchId: product.branchId ?? null,
        productId,
        type,
        quantity: delta,
        refType: 'manual',
        note: b?.note ? String(b.note) : null,
        userId: s.userId,
      },
    })
  })
  return NextResponse.json({ ok: true })
}
