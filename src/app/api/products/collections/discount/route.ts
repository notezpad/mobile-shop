import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * Fashion Pro capability: collections
 * Bulk-discount every product in a collection by a percentage.
 * POST /api/products/collections/discount
 * Body: { collection: string, percent: number }  // percent 0..90
 */
async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    await requireCapability(session, 'collections')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const body = await req.json().catch(() => null)
  const collection = String(body?.collection ?? '').trim()
  const percent = Number(body?.percent)
  if (!collection) return NextResponse.json({ error: 'الكوليكشن مطلوب' }, { status: 400 })
  if (!isFinite(percent) || percent <= 0 || percent >= 90) {
    return NextResponse.json({ error: 'نسبة الخصم لازم تكون بين 1 و 89' }, { status: 400 })
  }

  const factor = 1 - percent / 100
  const products = await db.product.findMany({
    where: { tenantId: session.tenantId, collection },
    select: { id: true, price: true },
  })
  if (products.length === 0) {
    return NextResponse.json({ error: 'مفيش منتجات في الكوليكشن ده' }, { status: 404 })
  }

  await db.$transaction(
    products.map((p) =>
      db.product.update({
        where: { id: p.id },
        data: { price: Math.round(p.price * factor * 100) / 100 },
      }),
    ),
  )

  return NextResponse.json({ ok: true, updated: products.length, collection, percent })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
