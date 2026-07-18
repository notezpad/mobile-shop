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
  const type = searchParams.get('type')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const q = searchParams.get('q')?.trim() || ''

  const where: any = { tenantId: s.tenantId, AND: [] as any[] }
  if (s.branchId) where.AND.push({ branchId: s.branchId })
  else if (branchId && branchId !== 'all') {
    if (branchId === 'none') where.AND.push({ branchId: null })
    else where.AND.push({ branchId: parseInt(branchId, 10) })
  }
  if (productId) where.AND.push({ productId: parseInt(productId, 10) })
  if (type && type !== 'all') where.AND.push({ type })
  if (from) {
    const d = new Date(from); d.setHours(0,0,0,0)
    where.AND.push({ createdAt: { gte: d } })
  }
  if (to) {
    const d = new Date(to); d.setHours(23,59,59,999)
    where.AND.push({ createdAt: { lte: d } })
  }
  if (q) {
    where.AND.push({
      OR: [
        { product: { name: { contains: q } } },
        { product: { barcode: { contains: q } } },
        { note: { contains: q } },
      ],
    })
  }

  const rows = await db.stockMovement.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 1000,
    include: {
      product: { select: { name: true, barcode: true } },
      branch: { select: { name: true } },
    },
  })
  // `userId` on StockMovement is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const result = rows.map((r) => ({
    ...r,
    userName: r.userId ? (userNameById.get(r.userId) ?? null) : null,
  }))
  return NextResponse.json(result)
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

  // For 'out', validate stock availability
  if (type === 'out' && product.quantity < Math.abs(qty)) {
    return NextResponse.json({ error: `الكمية غير متوفرة (المتاح: ${product.quantity})` }, { status: 400 })
  }

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { quantity: { increment: delta } } })
    await tx.stockMovement.create({
      data: {
        tenantId: s.tenantId,
        branchId: product.branchId ?? (s.branchId ?? null),
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
