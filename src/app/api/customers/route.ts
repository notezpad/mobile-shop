import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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
  const where: any = { tenantId: session.tenantId }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
    ]
  }
  const [customers, salesAgg] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { id: 'desc' },
      include: { _count: { select: { sales: true } } },
    }),
    db.sale.groupBy({
      by: ['customerId'],
      where: { tenantId: session.tenantId, customerId: { not: null } },
      _sum: { total: true },
      _max: { createdAt: true },
    }),
  ])
  const aggByCustomer = new Map<number, { totalPurchases: number; lastSaleAt: Date | null }>(
    salesAgg.map((a) => [
      a.customerId as number,
      { totalPurchases: a._sum.total ?? 0, lastSaleAt: a._max.createdAt },
    ])
  )
  const result = customers.map((c) => ({
    ...c,
    totalPurchases: aggByCustomer.get(c.id)?.totalPurchases ?? 0,
    lastSaleAt: aggByCustomer.get(c.id)?.lastSaleAt ?? null,
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

  const body = await req.json().catch(() => null)
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  const created = await db.customer.create({
    data: {
      tenantId: session.tenantId,
      name: String(body.name).trim(),
      phone: body.phone ? String(body.phone).trim() : null,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
