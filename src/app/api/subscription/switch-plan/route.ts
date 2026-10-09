import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { computeProration, logPlanChange } from '@/lib/plan-billing'

export const dynamic = 'force-dynamic'

/**
 * POST /api/subscription/switch-plan
 *
 * 🛡️ 2026-09-15 (v4): Self-service plan switcher.
 * 🛡️ 2026-10-10 (v5 — Plan Control): ترقية نسبية (Proration) + سجل تدقيق.
 *
 * Body: { planCode: string }
 *
 * Changes in v5:
 *   - ❌ كان: التبديل مجاني تماماً لكل الباقات الـ 4 الأساسية — المحل على
 *     «أساسية 299» يحوّل نفسه لـ«احترافية 599» بدون دفع أي فرق.
 *   - ✅ بقى: أي باقة مفعّلة ومدفوعة في الداتابيز (شاملة الباقات المخصصة
 *     اللي بيعملها الأدمن) قابلة للتبديل، مع حساب عادل للفرق:
 *
 *       ترقية → المحل يكمل لنهاية مدته والمستحق = (فرق القيمة اليومية ×
 *                الأيام المتبقية). يُسجل في PlanChangeLog كمستحق غير محصّل
 *                يظهر لصاحب المنصة في «سجل الاشتراكات» لتحصيله.
 *       هبوط  → الفرق يتحول لأيام مجانية إضافية (تعويض قيمي بدون استرداد).
 *       تجربة → تبديل مجاني (لسه مفيش فلوس مدفوعة).
 *
 * Rules:
 *   - Only ADMIN role can call this (the tenant owner).
 *   - Target plan must exist, be active (isActive = true) AND paid
 *     (priceMonthly > 0 OR priceYearly > 0) — نفس فلتر /api/plans/public،
 *     فمش ممكن حد يتحوّل لباقة صفرية مخصصة تعطيه وصولاً مجانياً.
 *   - If the user has no active subscription at all → 14-day (or
 *     plan.trialDays) trial of the target plan.
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

    // ─── Find the target plan ───
    const targetPlan = await db.plan.findUnique({ where: { code: planCode } })
    if (!targetPlan) {
      return NextResponse.json(
        { error: `الباقة ${planCode} مش موجودة` },
        { status: 404 }
      )
    }
    // 🛡️ v5: نفس شروط العرض العام — مفعّلة + مدفوعة. منع التحوّل لباقة
    // معطّلة أو صفرية (trial/free مخصصة) عشان ما تبقاش باب وصول مجاني.
    if (!targetPlan.isActive) {
      return NextResponse.json(
        { error: `الباقة «${targetPlan.name}» مش مفعّلة حالياً — اختار باقة تانية` },
        { status: 400 }
      )
    }
    if (targetPlan.priceMonthly <= 0 && targetPlan.priceYearly <= 0) {
      return NextResponse.json(
        { error: `الباقة «${targetPlan.name}» مش متاحة للتبديل الذاتي — تواصل مع الدعم` },
        { status: 400 }
      )
    }

    // ─── Find the tenant's most-recent active subscription ───
    const activeSub = await db.subscription.findFirst({
      where: { tenantId: session.tenantId, status: 'active' },
      orderBy: { endDate: 'desc' },
      include: { plan: true },
    })

    // ─── No active subscription → create one with a trial ───
    if (!activeSub) {
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

      await logPlanChange(db, {
        tenantId: session.tenantId,
        subscriptionId: newSub.id,
        toPlanId: targetPlan.id,
        toPlanCode: targetPlan.code,
        changeType: 'trial',
        period: 'trial',
        amountPaid: 0,
        note: 'self-switch (no active sub) → trial created',
        actor: 'self',
      })

      return NextResponse.json({
        ok: true,
        created: true,
        message: `تم بدء تجربة ${targetPlan.trialDays || 14} يوم لباقة «${targetPlan.name}»`,
        subscription: {
          id: newSub.id,
          planCode: newSub.plan.code,
          planName: newSub.plan.name,
          businessType: newSub.plan.businessType,
          period: newSub.period,
          endDate: newSub.endDate.toISOString(),
        },
        proration: null,
      })
    }

    const now = new Date()

    // ─── Same plan → nothing to do ───
    if (activeSub.planId === targetPlan.id) {
      return NextResponse.json({
        ok: true,
        updated: false,
        message: 'أنت بالفعل مشترك في هذه الباقة',
        subscription: {
          id: activeSub.id,
          planCode: activeSub.plan.code,
          planName: activeSub.plan.name,
          businessType: activeSub.plan.businessType,
          period: activeSub.period,
          endDate: activeSub.endDate.toISOString(),
        },
        proration: null,
      })
    }

    // ─── Compute proration (fair difference between the two plans) ───
    const proration = computeProration(
      {
        startDate: activeSub.startDate,
        endDate: activeSub.endDate,
        period: activeSub.period,
        amountPaid: activeSub.amountPaid,
      },
      { priceMonthly: activeSub.plan.priceMonthly, priceYearly: activeSub.plan.priceYearly },
      { priceMonthly: targetPlan.priceMonthly, priceYearly: targetPlan.priceYearly },
      now,
    )

    // ─── Trial subscription → free switch (no money involved yet) ───
    if (proration.isTrial) {
      const updated = await db.subscription.update({
        where: { id: activeSub.id },
        data: {
          planId: targetPlan.id,
          paymentNote: (activeSub.paymentNote ?? '') + ` | self-switched-to-${planCode}-by-admin`,
        },
        include: { plan: true },
      })

      await logPlanChange(db, {
        tenantId: session.tenantId,
        subscriptionId: activeSub.id,
        fromPlanId: activeSub.planId,
        fromPlanCode: activeSub.plan.code,
        toPlanId: targetPlan.id,
        toPlanCode: targetPlan.code,
        changeType: 'switch',
        period: activeSub.period,
        remainingDays: proration.remainingDays,
        note: 'free switch during trial',
        actor: 'self',
      })

      return NextResponse.json({
        ok: true,
        updated: true,
        message: `تم التبديل إلى «${targetPlan.name}» — مجاناً أثناء فترة التجربة`,
        subscription: {
          id: updated.id,
          planCode: updated.plan.code,
          planName: updated.plan.name,
          businessType: updated.plan.businessType,
          period: updated.period,
          endDate: updated.endDate.toISOString(),
        },
        proration: { ...proration, upgradeCost: 0, creditValue: 0, creditDays: 0 },
      })
    }

    // ─── Downgrade (or equal value) → switch + credit free days ───
    if (proration.upgradeCost <= 0) {
      const newEnd = new Date(activeSub.endDate)
      if (proration.creditDays > 0) {
        newEnd.setDate(newEnd.getDate() + proration.creditDays)
      }

      const updated = await db.subscription.update({
        where: { id: activeSub.id },
        data: {
          planId: targetPlan.id,
          endDate: newEnd,
          paymentNote:
            (activeSub.paymentNote ?? '') +
            ` | self-switched-to-${planCode}-by-admin` +
            (proration.creditDays > 0 ? ` (+${proration.creditDays}d credit)` : ''),
        },
        include: { plan: true },
      })

      await logPlanChange(db, {
        tenantId: session.tenantId,
        subscriptionId: activeSub.id,
        fromPlanId: activeSub.planId,
        fromPlanCode: activeSub.plan.code,
        toPlanId: targetPlan.id,
        toPlanCode: targetPlan.code,
        changeType: 'switch',
        period: activeSub.period,
        creditValue: proration.creditValue,
        creditDays: proration.creditDays,
        remainingDays: proration.remainingDays,
        note:
          proration.creditDays > 0
            ? `downgrade — ${proration.creditDays} free days granted (value ${proration.creditValue} EGP)`
            : 'equal-value switch',
        actor: 'self',
      })

      return NextResponse.json({
        ok: true,
        updated: true,
        message:
          proration.creditDays > 0
            ? `تم التبديل إلى «${targetPlan.name}» — وتمت إضافة ${proration.creditDays} يوم مجاناً تعويضاً عن فرق القيمة`
            : `تم التبديل إلى «${targetPlan.name}»`,
        subscription: {
          id: updated.id,
          planCode: updated.plan.code,
          planName: updated.plan.name,
          businessType: updated.plan.businessType,
          period: updated.period,
          endDate: updated.endDate.toISOString(),
        },
        proration,
      })
    }

    // ─── Upgrade → switch now, record the prorated amount as DUE ───
    const updated = await db.subscription.update({
      where: { id: activeSub.id },
      data: {
        planId: targetPlan.id,
        paymentNote:
          (activeSub.paymentNote ?? '') +
          ` | self-upgraded-to-${planCode}-by-admin (due ${proration.upgradeCost} EGP)`,
      },
      include: { plan: true },
    })

    await logPlanChange(db, {
      tenantId: session.tenantId,
      subscriptionId: activeSub.id,
      fromPlanId: activeSub.planId,
      fromPlanCode: activeSub.plan.code,
      toPlanId: targetPlan.id,
      toPlanCode: targetPlan.code,
      changeType: 'switch',
      period: activeSub.period,
      amountDue: proration.upgradeCost,
      dueSettled: false,
      remainingDays: proration.remainingDays,
      note: `upgrade proration — ${(proration.dailyNew - proration.dailyOld).toFixed(2)} EGP/day × ${proration.remainingDays}d`,
      actor: 'self',
    })

    return NextResponse.json({
      ok: true,
      updated: true,
      message: `تمت الترقية إلى «${targetPlan.name}» — مستحق دفع ${proration.upgradeCost.toLocaleString('en-US')} جنيه فرق الترقية حتى نهاية مدتك الحالية`,
      subscription: {
        id: updated.id,
        planCode: updated.plan.code,
        planName: updated.plan.name,
        businessType: updated.plan.businessType,
        period: updated.period,
        endDate: updated.endDate.toISOString(),
      },
      proration,
      due: {
        amount: proration.upgradeCost,
        settled: false,
        hint: 'سيتم التواصل معك لتحصيل فرق الترقية',
      },
    })
  })
}
