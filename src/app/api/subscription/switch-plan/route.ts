import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { CANONICAL_PLAN_CODES } from '@/lib/plan-constants'
import { countableSubWhere } from '@/lib/subscription-status'

export const dynamic = 'force-dynamic'

/**
 * POST /api/subscription/switch-plan
 *
 * 🛡️ 2026-09-15 (v4): Self-service plan switcher.
 *
 * Body: { planCode: string }  (one of the 4 canonical codes)
 *
 * Allows a tenant admin (ADMIN role) to switch their OWN subscription to
 * a different canonical plan. This is the fix for the user's situation
 * where they're on the legacy `trial` plan with empty enabledModules —
 * they can switch themselves to `fashion-basic` without needing the
 * super-admin's help.
 *
 * Rules:
 *   - Only ADMIN role can call this (the tenant owner).
 *   - Target planCode must be one of the 4 canonical codes.
 *   - The target plan must be active (isActive = true) in DB.
 *   - The change keeps the existing endDate (no extension).
 *   - If the user has NEVER had any subscription, one is created with a
 *     14-day trial of the target plan (legacy edge case).
 *
 * 🛡️ 2026-10-12 — closed two free-upgrade / free-trial holes:
 *   1. A tenant with a PAID live subscription could call this endpoint and
 *      move to a more expensive plan for free (same endDate, no payment).
 *      Now: switching is allowed ONLY while the live subscription is a
 *      trial. Paid tenants must upgrade through checkout.
 *   2. A tenant whose subscription had expired got a brand-new free 14-day
 *      trial here, bypassing the one-trial-per-tenant rule in start-trial.
 *      Now: anyone who ever had a subscription must pay to come back.
 */
export async function POST(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // Only ADMIN role can switch their own plan
    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'فقط مدير المحل يقدر يبدل الباقة' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const planCode = String(body.planCode ?? '').trim().toLowerCase()
    if (!planCode) {
      return NextResponse.json({ error: 'planCode مطلوب' }, { status: 400 })
    }

    // Validate target plan code is canonical
    if (!CANONICAL_PLAN_CODES.includes(planCode as any)) {
      return NextResponse.json(
        {
          error: `planCode لازم يكون واحد من: ${CANONICAL_PLAN_CODES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Find the target plan
    const targetPlan = await db.plan.findUnique({ where: { code: planCode } })
    if (!targetPlan) {
      return NextResponse.json(
        { error: `الباقة ${planCode} مش موجودة في الـ DB — شغّل bunx tsx prisma/seed-plans.ts` },
        { status: 404 }
      )
    }
    if (!targetPlan.isActive) {
      return NextResponse.json(
        { error: `الباقة ${planCode} مش مفعّلة — اختار باقة تانية` },
        { status: 400 }
      )
    }

    // Live (active + not yet expired) subscriptions, newest first.
    const now = new Date()
    const liveSubs = await db.subscription.findMany({
      where: { tenantId: session.tenantId, status: 'active', endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    })

    // 🛡️ Paid subscription → no free self-service switching.
    if (liveSubs.some((s) => s.period !== 'trial')) {
      return NextResponse.json(
        {
          error: 'اشتراكك مدفوع — تغيير الباقة أو الترقية بيتم من صفحة الأسعار والدفع',
          code: 'PAID_SUB_SWITCH_BLOCKED',
        },
        { status: 403 }
      )
    }

    const activeSub = liveSubs[0]

    // No live subscription.
    if (!activeSub) {
      // 🛡️ Ever had a subscription (expired trial / expired paid)? Must pay.
      const everHad = await db.subscription.findFirst({
        where: { tenantId: session.tenantId, ...countableSubWhere },
        select: { id: true },
      })
      if (everHad) {
        return NextResponse.json(
          {
            error: 'اشتراكك منتهي — اشترك من صفحة الأسعار والدفع للمتابعة',
            code: 'SUBSCRIPTION_EXPIRED',
          },
          { status: 402 }
        )
      }

      // Brand-new tenant with no subscription row at all → 14-day trial.
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + (targetPlan.trialDays || 14))

      const newSub = await db.subscription.create({
        data: {
          tenantId: session.tenantId,
          planId: targetPlan.id,
          status: 'active',
          startDate: new Date(),
          endDate,
          period: 'trial',
          amountPaid: 0,
          paymentMethod: 'manual',
          paymentNote: `self-switched-to-${planCode}-by-admin`,
        },
        include: { plan: true },
      })

      return NextResponse.json({
        ok: true,
        created: true,
        subscription: {
          id: newSub.id,
          planCode: newSub.plan.code,
          planName: newSub.plan.name,
          businessType: newSub.plan.businessType,
          period: newSub.period,
          endDate: newSub.endDate.toISOString(),
        },
      })
    }

    // Update the existing subscription's planId (keep endDate unchanged)
    const updated = await db.subscription.update({
      where: { id: activeSub.id },
      data: {
        planId: targetPlan.id,
        paymentNote: (activeSub.paymentNote ?? '') + ` | self-switched-to-${planCode}-by-admin`,
      },
      include: { plan: true },
    })

    return NextResponse.json({
      ok: true,
      updated: true,
      subscription: {
        id: updated.id,
        planCode: updated.plan.code,
        planName: updated.plan.name,
        businessType: updated.plan.businessType,
        period: updated.period,
        endDate: updated.endDate.toISOString(),
      },
    })
  })
}
