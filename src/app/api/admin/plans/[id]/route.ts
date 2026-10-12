import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __PUT(
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
  // 🥬 2026-10-12: تحديث ظهور الباقة (public | hidden)
  if (body.visibility === 'hidden' || body.visibility === 'public') {
    data.visibility = body.visibility
  }
  if (body.capabilities !== undefined) {
    data.capabilities =
      typeof body.capabilities === 'string'
        ? body.capabilities
        : Array.isArray(body.capabilities)
          ? JSON.stringify(body.capabilities)
          : null
  }
  // 🛡️ 2026-09-15 (v2): handle enabledModules — previously PUT silently
  // ignored this field, so the admin's module-toggling in the UI never
  // reached the DB. The admin would enable maintenance on fashion-basic
  // but on reload it would still be off.
  if (body.enabledModules !== undefined) {
    data.enabledModules =
      typeof body.enabledModules === 'string'
        ? body.enabledModules
        : Array.isArray(body.enabledModules)
          ? JSON.stringify(body.enabledModules)
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

async function __DELETE(
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

  // 🛡️ 2026-09-17 (v3): Canonical plans can only be soft-deleted
  // (deactivated). Custom plans can be hard-deleted IF no subscriptions
  // reference them.
  const CANONICAL_CODES = ['electronics-basic', 'electronics-pro', 'fashion-basic', 'fashion-pro', 'food-basic']
  const isCanonical = CANONICAL_CODES.includes(existing.code)

  if (isCanonical) {
    // Canonical plan → soft-delete only (deactivate)
    await db.plan.update({
      where: { id: planId },
      data: { isActive: false },
    })
    return NextResponse.json({ ok: true, action: 'deactivated', message: 'تم تعطيل الباقة (canonical — لا يمكن حذفها نهائياً)' })
  }

  // Custom plan → check if any subscriptions reference it
  const subsCount = await db.subscription.count({ where: { planId } })
  if (subsCount > 0) {
    // Has subscriptions → soft-delete only
    await db.plan.update({
      where: { id: planId },
      data: { isActive: false },
    })
    return NextResponse.json({ ok: true, action: 'deactivated', message: `تم تعطيل الباقة (${subsCount} اشتراك مرتبط بها — لا يمكن حذفها نهائياً)` })
  }

  // Custom plan with no subscriptions → hard delete
  await db.plan.delete({ where: { id: planId } })
  return NextResponse.json({ ok: true, action: 'deleted', message: 'تم حذف الباقة نهائياً' })
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
