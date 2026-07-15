import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse, PLATFORM_TENANT_ID } from '@/lib/auth'
import { randomCode } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? ''
  const planIdStr = url.searchParams.get('planId') ?? ''

  const where: any = {}
  if (planIdStr) where.planId = Number(planIdStr)
  if (status === 'available') where.redeemedAt = null
  if (status === 'redeemed') where.redeemedAt = { not: null }

  const codes = await db.activationCode.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { plan: true, tenant: true },
    take: 1000,
  })

  const rows = codes.map((c) => ({
    id: c.id,
    code: c.code,
    planId: c.planId,
    planCode: c.plan.code,
    planName: c.plan.name,
    period: c.period,
    status: c.redeemedAt ? 'redeemed' : 'available',
    createdAt: c.createdAt.toISOString(),
    redeemedAt: c.redeemedAt ? c.redeemedAt.toISOString() : null,
    tenantId: c.tenantId,
    tenantName: c.tenant?.shopName ?? null,
    notes: c.notes,
  }))

  return NextResponse.json({ items: rows, total: rows.length })
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const planId = Number(body.planId)
  const period = String(body.period ?? 'monthly') as 'monthly' | 'yearly' | 'trial'
  let quantity = Number(body.quantity ?? 1)
  const notes = body.notes ? String(body.notes) : null

  if (!planId || Number.isNaN(planId)) {
    return NextResponse.json({ error: 'الباقة مطلوبة' }, { status: 400 })
  }
  if (!['monthly', 'yearly', 'trial'].includes(period)) {
    return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 })
  }
  if (Number.isNaN(quantity) || quantity < 1) quantity = 1
  if (quantity > 100) quantity = 100

  const plan = await db.plan.findUnique({ where: { id: planId } })
  if (!plan) return NextResponse.json({ error: 'الباقة غير موجودة' }, { status: 404 })

  // Touch PLATFORM_TENANT_ID for safety; not used directly here
  void PLATFORM_TENANT_ID

  const created: string[] = []
  for (let i = 0; i < quantity; i++) {
    let code = randomCode(12)
    // Ensure uniqueness
    let attempts = 0
    while (attempts < 10) {
      const exists = await db.activationCode.findUnique({ where: { code } })
      if (!exists) break
      code = randomCode(12)
      attempts++
    }
    await db.activationCode.create({
      data: {
        code,
        planId: plan.id,
        period,
        notes,
      },
    })
    created.push(code)
  }

  return NextResponse.json({ ok: true, codes: created, count: created.length })
}
