import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: Wrapped in `withDb` — on Cloudflare Workers reuses ONE
 * PrismaClient per request instead of creating a new TCP+TLS+auth connection
 * per query. GET makes 2 parallel queries; without `withDb` each was 200-500ms
 * of pure connection overhead.
 *
 * 🛡️ 2026-09-27: Same unbounded-scan shape as /api/customers — no `take`
 * limit at all. See the comment there for the full rationale: every current
 * caller (SuppliersView's table, purchase-order picker, offline prewarm)
 * keeps calling this with NO `page` param and gets the same bare array as
 * before, since SuppliersView's stats/export also need the full set in
 * memory — just now bounded by SAFETY_CAP instead of truly unbounded.
 * `page` + `limit` params opt into real pagination — { data, total, page,
 * limit, totalPages } — for whoever adopts it later. No current page does.
 */
const SAFETY_CAP = 3000

export async function GET(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try {
      await requireModule(session, 'suppliers')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
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

    const paginated = searchParams.has('page')
    const limit = paginated
      ? Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
      : SAFETY_CAP
    const page = paginated ? Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)) : 1
    const skip = paginated ? (page - 1) * limit : 0

    const [suppliers, total, purchasesAgg] = await Promise.all([
      db.supplier.findMany({
        where,
        orderBy: { id: 'desc' },
        include: { _count: { select: { purchaseOrders: true } } },
        skip,
        take: limit,
      }),
      paginated ? db.supplier.count({ where }) : Promise.resolve(null),
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

    if (!paginated) {
      return NextResponse.json(result)
    }
    return NextResponse.json({
      data: result,
      total: total ?? result.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((total ?? result.length) / limit)),
    })
  })
}

export async function POST(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try {
      await requireModule(session, 'suppliers')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
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
  })
}
