import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true,
      shopName: true,
      phone: true,
      address: true,
      logoPath: true,
      invoicePrefix: true,
      commissionVodafoneCash: true,
      commissionInstapay: true,
      commissionFawry: true,
    },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }
  return NextResponse.json(tenant)
}

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const data: any = {}
  if (body.shopName !== undefined) data.shopName = String(body.shopName)
  if (body.phone !== undefined)
    data.phone = body.phone ? String(body.phone) : null
  if (body.address !== undefined)
    data.address = body.address ? String(body.address) : null
  if (body.logoPath !== undefined)
    data.logoPath = body.logoPath ? String(body.logoPath) : null
  if (body.invoicePrefix !== undefined)
    data.invoicePrefix = String(body.invoicePrefix || 'INV')
  if (body.commissionVodafoneCash !== undefined)
    data.commissionVodafoneCash = Number(body.commissionVodafoneCash) || 0
  if (body.commissionInstapay !== undefined)
    data.commissionInstapay = Number(body.commissionInstapay) || 0
  if (body.commissionFawry !== undefined)
    data.commissionFawry = Number(body.commissionFawry) || 0

  const updated = await db.tenant.update({
    where: { id: session.tenantId },
    data,
    select: {
      id: true,
      shopName: true,
      phone: true,
      address: true,
      logoPath: true,
      invoicePrefix: true,
      commissionVodafoneCash: true,
      commissionInstapay: true,
      commissionFawry: true,
    },
  })
  return NextResponse.json(updated)
}
