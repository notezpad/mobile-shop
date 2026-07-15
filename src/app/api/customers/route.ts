import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
  const customers = await db.customer.findMany({
    where,
    orderBy: { id: 'desc' },
    include: { _count: { select: { sales: true } } },
  })
  return NextResponse.json(customers)
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
