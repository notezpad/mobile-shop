import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'suppliers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() || ''
  const where: any = { tenantId: session.tenantId }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
    ]
  }
  const [suppliers, purchasesAgg] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: { id: 'desc' },
      include: { _count: { select: { purchaseOrders: true } } },
    }),
    db.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { tenantId: session.tenantId, supplierId: { not: null } },
      _sum: { total: true },
      _max: { createdAt: true },
    }),
  ])
  const aggBySupplier = new Map<number, { totalPurchases: number; lastPurchaseAt: Date | null }>(
    purchasesAgg.map((a) => [
      a.supplierId as number,
      { totalPurchases: a._sum.total ?? 0, lastPurchaseAt: a._max.createdAt },
    ])
  )
  const result = suppliers.map((s) => ({
    ...s,
    totalPurchases: aggBySupplier.get(s.id)?.totalPurchases ?? 0,
    lastPurchaseAt: aggBySupplier.get(s.id)?.lastPurchaseAt ?? null,
  }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'suppliers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  const created = await db.supplier.create({
    data: {
      tenantId: session.tenantId,
      name: String(body.name).trim(),
      phone: body.phone ? String(body.phone).trim() : null,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
