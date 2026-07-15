import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const orders = await db.maintenanceOrder.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { id: 'desc' },
  })
  return NextResponse.json(orders)
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
  if (!body?.customerName || !String(body.customerName).trim()) {
    return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 })
  }
  if (!body?.device || !String(body.device).trim()) {
    return NextResponse.json({ error: 'الجهاز مطلوب' }, { status: 400 })
  }
  const created = await db.maintenanceOrder.create({
    data: {
      tenantId: session.tenantId,
      customerName: String(body.customerName).trim(),
      phone: body.phone ? String(body.phone).trim() : null,
      device: String(body.device).trim(),
      issue: body.issue ? String(body.issue) : '',
      cost: Number(body.cost ?? 0) || 0,
      status: 'مستلم',
    },
  })
  return NextResponse.json(created, { status: 201 })
}
