import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse, PLATFORM_TENANT_ID } from '@/lib/auth'
import { randomCode } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/codes
 *
 * Returns all activation codes (filtered by query params).
 *
 * Query params:
 *   status           — 'available' | 'redeemed' | '' (all)
 *   planId           — filter by plan
 *   assignedTenantId — filter by pre-assigned tenant
 *   batchLabel       — filter by batch label (exact match)
 *   search           — partial match on code or notes
 */
async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? ''
  const planIdStr = url.searchParams.get('planId') ?? ''
  const assignedTenantId = url.searchParams.get('assignedTenantId') ?? ''
  const batchLabel = url.searchParams.get('batchLabel') ?? ''
  const search = url.searchParams.get('search') ?? ''

  const where: any = {}
  if (planIdStr) where.planId = Number(planIdStr)
  if (status === 'available') where.redeemedAt = null
  if (status === 'redeemed') where.redeemedAt = { not: null }
  if (assignedTenantId) where.assignedTenantId = assignedTenantId
  if (batchLabel) where.batchLabel = batchLabel
  if (search) {
    where.OR = [
      { code: { contains: search.toUpperCase() } },
      { notes: { contains: search } },
      { batchLabel: { contains: search } },
    ]
  }

  const codes = await db.activationCode.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      plan: true,
      tenant: true,
    },
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
    // 🛡️ 2026-09-21: new fields
    durationDays: c.durationDays ?? null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    assignedTenantId: c.assignedTenantId ?? null,
    batchLabel: c.batchLabel ?? null,
  }))

  return NextResponse.json({ items: rows, total: rows.length })
}

/**
 * POST /api/admin/codes
 *
 * Generates `quantity` new activation codes.
 *
 * Body:
 *   planId           — required, which plan the code unlocks
 *   period           — 'monthly' | 'yearly' | 'trial' (default 'monthly')
 *   quantity         — how many codes to generate (1-100, default 1)
 *   notes            — optional internal note
 *   durationDays     — optional, custom duration in days (overrides period)
 *   expiresAt        — optional ISO date string, code-level expiry
 *   assignedTenantId — optional, pre-assign code to a specific tenant
 *   batchLabel       — optional, grouping label
 */
async function __POST(req: NextRequest) {
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

  // 🛡️ 2026-09-21: new optional fields
  const durationDaysRaw = body.durationDays
  const durationDays =
    durationDaysRaw !== undefined && durationDaysRaw !== null && durationDaysRaw !== ''
      ? Number(durationDaysRaw)
      : null
  const expiresAtRaw = body.expiresAt
  const expiresAt =
    expiresAtRaw && typeof expiresAtRaw === 'string' && expiresAtRaw.trim()
      ? new Date(expiresAtRaw)
      : null
  const assignedTenantId =
    body.assignedTenantId && String(body.assignedTenantId).trim()
      ? String(body.assignedTenantId).trim()
      : null
  const batchLabel =
    body.batchLabel && String(body.batchLabel).trim()
      ? String(body.batchLabel).trim()
      : null

  if (!planId || Number.isNaN(planId)) {
    return NextResponse.json({ error: 'الباقة مطلوبة' }, { status: 400 })
  }
  if (!['monthly', 'yearly', 'trial'].includes(period)) {
    return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 })
  }
  if (Number.isNaN(quantity) || quantity < 1) quantity = 1
  if (quantity > 100) quantity = 100

  // Validate durationDays if provided
  if (durationDays !== null) {
    if (Number.isNaN(durationDays) || durationDays < 1 || durationDays > 3650) {
      return NextResponse.json(
        { error: 'مدة الكود يجب أن تكون بين 1 و 3650 يوم' },
        { status: 400 },
      )
    }
  }

  // Validate expiresAt if provided
  if (expiresAt !== null && isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: 'تاريخ انتهاء صلاحية الكود غير صالح' }, { status: 400 })
  }

  const plan = await db.plan.findUnique({ where: { id: planId } })
  if (!plan) return NextResponse.json({ error: 'الباقة غير موجودة' }, { status: 404 })

  // Validate assignedTenantId if provided
  if (assignedTenantId) {
    const tenant = await db.tenant.findUnique({
      where: { id: assignedTenantId },
      select: { id: true, shopName: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'المحل المُحدد غير موجود' }, { status: 404 })
    }
  }

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
        durationDays,
        expiresAt,
        assignedTenantId,
        batchLabel,
      },
    })
    created.push(code)
  }

  return NextResponse.json({ ok: true, codes: created, count: created.length })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
