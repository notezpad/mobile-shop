import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const planId = Number(id)
  if (Number.isNaN(planId)) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const existing = await db.plan.findUnique({ where: { id: planId } })
  if (!existing) {
    return NextResponse.json({ error: 'الباقة غير موجودة' }, { status: 404 })
  }

  const data: any = {}
  if (body.code !== undefined) {
    const code = String(body.code).trim().toLowerCase()
    if (code !== existing.code) {
      const dup = await db.plan.findUnique({ where: { code } })
      if (dup) {
        return NextResponse.json({ error: 'كود الباقة موجود بالفعل' }, { status: 400 })
      }
      data.code = code
    }
  }
  if (body.name !== undefined) data.name = String(body.name)
  if (body.description !== undefined)
    data.description = body.description ? String(body.description) : null
  if (body.priceMonthly !== undefined)
    data.priceMonthly = Number(body.priceMonthly) || 0
  if (body.priceYearly !== undefined)
    data.priceYearly = Number(body.priceYearly) || 0
  if (body.maxUsers !== undefined) data.maxUsers = Number(body.maxUsers) || 1
  if (body.maxProducts !== undefined)
    data.maxProducts = Number(body.maxProducts) || 50
  if (body.maxBranches !== undefined)
    data.maxBranches = Number(body.maxBranches) || 1
  if (body.trialDays !== undefined) data.trialDays = Number(body.trialDays) || 0
  if (body.isActive !== undefined) data.isActive = !!body.isActive
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0
  if (body.businessType !== undefined) data.businessType = String(body.businessType)
  if (body.capabilities !== undefined) {
    data.capabilities =
      typeof body.capabilities === 'string'
        ? body.capabilities
        : Array.isArray(body.capabilities)
          ? JSON.stringify(body.capabilities)
          : null
  }
  if (body.features !== undefined) {
    data.features =
      typeof body.features === 'string'
        ? JSON.stringify(
            String(body.features)
              .split('\n')
              .map((s: string) => s.trim())
              .filter(Boolean)
          )
        : Array.isArray(body.features)
          ? JSON.stringify(body.features)
          : null
  }

  const updated = await db.plan.update({ where: { id: planId }, data })
  return NextResponse.json({ ok: true, plan: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const planId = Number(id)
  if (Number.isNaN(planId)) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  const existing = await db.plan.findUnique({ where: { id: planId } })
  if (!existing) {
    return NextResponse.json({ error: 'الباقة غير موجودة' }, { status: 404 })
  }

  // Soft delete: deactivate instead of removing
  await db.plan.update({
    where: { id: planId },
    data: { isActive: false },
  })
  return NextResponse.json({ ok: true })
}
