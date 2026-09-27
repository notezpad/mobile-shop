import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

async function __GET(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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
  // 🕐 "from"/"to" هي تواريخ تقويمية بتوقيت المحل (زي 2026-09-27)، فلازم
  // تتحول لحدود UTC بتوقيت المحل نفسه — مش بتوقيت السيرفر (كان
  // `new Date(from)` بيديها منتصف ليل UTC، يعني بتزحلق يوم كامل لأي محل
  // مش على توقيت UTC بالظبط).
  if (from || to) {
    const tz = await getTenantTimezone(s.tenantId)
    if (from) where.AND.push({ createdAt: { gte: localDateStrToUtcBounds(from, 'start', tz) } })
    if (to) where.AND.push({ createdAt: { lte: localDateStrToUtcBounds(to, 'end', tz) } })
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

async function __POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
