import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/tenants/[id]/assign-plan
 *
 * 🛡️ 2026-09-15 (v4): Assign a new plan to a tenant's active subscription.
 *
 * Body: { planId: number, period?: 'monthly' | 'yearly' | 'trial' }
 *
 * Use case: when a tenant is on the legacy `trial` plan (with empty
 * enabledModules) and needs to be migrated to a canonical plan
 * (e.g. 'fashion-basic'). The admin (super-admin) can use this endpoint
 * to move them in one click from the /admin → tenants UI.
 *
 * The endpoint:
 *   1. Verifies the target plan exists.
 *   2. Finds the tenant's most-recent active subscription.
 *   3. Updates its planId (and optionally period).
 *   4. Returns the updated subscription + new plan details.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      await requireSuperAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { id: tenantId } = await params

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const planId = Number(body.planId)
    if (!planId || Number.isNaN(planId)) {
      return NextResponse.json({ error: 'planId مطلوب (رقم)' }, { status: 400 })
    }

    // Validate period if provided
    let period: string | undefined
    if (body.period) {
      const p = String(body.period)
      if (!['monthly', 'yearly', 'trial'].includes(p)) {
        return NextResponse.json(
          { error: 'period يجب أن يكون: monthly | yearly | trial' },
          { status: 400 }
        )
      }
      period = p
    }

    // ─── 1. Verify target plan exists ───
    const targetPlan = await db.plan.findUnique({ where: { id: planId } })
    if (!targetPlan) {
      return NextResponse.json({ error: 'الباقة المحددة غير موجودة' }, { status: 404 })
    }

    // ─── 2. Verify tenant exists ───
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, shopName: true, status: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
    }

    // ─── 3. Find the tenant's most-recent active subscription ───
    const activeSub = await db.subscription.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { endDate: 'desc' },
    })

    if (!activeSub) {
      // No active subscription — create one
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + (targetPlan.trialDays || 14))

      const newSub = await db.subscription.create({
        data: {
          tenantId,
          planId,
          status: 'active',
          startDate: new Date(),
          endDate,
          period: period || 'trial',
          amountPaid: 0,
          paymentMethod: 'manual',
          paymentNote: 'assigned-by-super-admin',
        },
        include: { plan: true },
      })

      return NextResponse.json({
        ok: true,
        created: true,
        subscription: {
          id: newSub.id,
          planId: newSub.planId,
          planCode: newSub.plan.code,
          planName: newSub.plan.name,
          businessType: newSub.plan.businessType,
          status: newSub.status,
          period: newSub.period,
          endDate: newSub.endDate.toISOString(),
        },
      })
    }

    // ─── 4. Update the active subscription's planId ───
    const updateData: any = {
      planId,
      paymentNote: (activeSub.paymentNote ?? '') + ` | reassigned-to-${targetPlan.code}-by-super-admin`,
    }
    if (period) updateData.period = period

    const updated = await db.subscription.update({
      where: { id: activeSub.id },
      data: updateData,
      include: { plan: true },
    })

    return NextResponse.json({
      ok: true,
      updated: true,
      subscription: {
        id: updated.id,
        planId: updated.planId,
        planCode: updated.plan.code,
        planName: updated.plan.name,
        businessType: updated.plan.businessType,
        status: updated.status,
        period: updated.period,
        endDate: updated.endDate.toISOString(),
      },
    })
  })
}
