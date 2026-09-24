import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { computeEndDate } from '@/lib/admin-utils'
import { getSession } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/redeem
 *
 * 🛡️ 2026-09-21 (v3) — Subscription Codes Enhancement:
 *
 * Tenant self-service endpoint for redeeming an activation code.
 * A user with an EXPIRED subscription can still call this endpoint
 * (we use `getSession()` instead of `requireAuth()` so the 402
 * subscription-expired check doesn't block them).
 *
 * Accepts:  { code: string }
 * Returns:  { ok: true, subscription: { id, endDate, planId, planName, period } }
 *
 * Validation (all atomic inside a $transaction):
 *   1. Code exists (case-insensitive, normalized to uppercase)
 *   2. Code is not yet redeemed  (atomic conditional update → P2025 if already used)
 *   3. Code has not expired      (expiresAt > now, if set)
 *   4. Code is assigned to caller  (assignedTenantId == session.tenantId, if set)
 *
 * Duration logic:
 *   - If `durationDays` is set on the code → subscription lasts that many days
 *   - Otherwise → fall back to monthly/yearly/trial via computeEndDate()
 *
 * Side effects:
 *   - Cancels any existing active subscriptions for this tenant
 *   - Creates a new active subscription
 *   - Activates the tenant (status='active')
 *   - Creates an in-app notification confirming the renewal
 */
export async function POST(req: NextRequest) {
  // NOTE: we intentionally use getSession() here instead of requireAuth().
  // requireAuth() enforces an active subscription, which would make it
  // impossible for a tenant with an EXPIRED subscription to ever redeem a
  // new code — exactly the situation this endpoint exists to resolve.
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'غير مسموح — يرجى تسجيل الدخول' }, { status: 401 })
  }
  // Super admins have no tenant of their own and should manage tenant
  // subscriptions from the admin panel, not this self-service endpoint.
  if (session.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'استخدم لوحة الأدمن لإدارة اشتراكات المحلات' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const code = String(body.code ?? '').trim().toUpperCase()
  // SECURITY: tenantId always comes from the authenticated session, never
  // from the request body. Previously it was read from `body.tenantId`,
  // which let anyone with a valid activation code redeem it against an
  // arbitrary tenant of their choosing.
  const tenantId = session.tenantId

  if (!code || !tenantId) {
    return NextResponse.json({ error: 'الكود مطلوب' }, { status: 400 })
  }

  // ─── Pre-flight validation (before the transaction) ───────────────
  // These checks give us friendlier error messages than the raw P2025.
  const existingCode = await db.activationCode.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      planId: true,
      period: true,
      redeemedAt: true,
      expiresAt: true,
      assignedTenantId: true,
      durationDays: true,
      plan: { select: { trialDays: true, name: true } },
    },
  })

  if (!existingCode) {
    return NextResponse.json({ error: 'كود غير صحيح' }, { status: 404 })
  }
  if (existingCode.redeemedAt) {
    return NextResponse.json({ error: 'هذا الكود مستخدم بالفعل' }, { status: 400 })
  }
  // 🛡️ 2026-09-21: code-level expiry check
  if (existingCode.expiresAt && existingCode.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'انتهت صلاحية هذا الكود — تواصل مع الإدارة للحصول على كود جديد' },
      { status: 400 },
    )
  }
  // 🛡️ 2026-09-21: pre-assignment check — only the assigned tenant can redeem
  if (
    existingCode.assignedTenantId &&
    existingCode.assignedTenantId !== tenantId
  ) {
    return NextResponse.json(
      { error: 'هذا الكود غير مخصص لحسابك — تواصل مع الإدارة' },
      { status: 403 },
    )
  }

  // 🛡️ Wrap the entire redeem flow in a $transaction.
  // Previously: findUnique → check → create → update → update
  // Race condition: two parallel requests for the same code could both
  // pass the `redeemedAt === null` check, then both create subscriptions.
  //
  // Fix: use atomic conditional UPDATE on the activation code.
  // If the code is already redeemed, Prisma throws P2025 (record not found)
  // because the `where: { code, redeemedAt: null }` won't match.

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Atomic conditional update: only succeeds if redeemedAt is null
      const ac = await tx.activationCode.update({
        where: { code, redeemedAt: null },
        data: { redeemedAt: new Date(), tenantId },
        include: { plan: true },
      })

      // 2. Cancel any existing active subscriptions for this tenant
      // (only one active subscription per tenant at a time)
      await tx.subscription.updateMany({
        where: { tenantId, status: 'active' },
        data: { status: 'cancelled' },
      })

      // 3. Create new subscription
      // 🛡️ 2026-09-21: Use durationDays if set, otherwise fall back to period
      const startDate = new Date()
      let endDate: Date
      let effectivePeriod: string

      if (ac.durationDays && ac.durationDays > 0) {
        endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + ac.durationDays)
        effectivePeriod = `custom_${ac.durationDays}d`
      } else {
        endDate = computeEndDate(
          startDate,
          ac.period as 'monthly' | 'yearly' | 'trial',
          ac.plan.trialDays,
        )
        effectivePeriod = ac.period
      }

      const sub = await tx.subscription.create({
        data: {
          tenantId,
          planId: ac.planId,
          status: 'active',
          startDate,
          endDate,
          period: effectivePeriod,
          amountPaid: 0,
          paymentMethod: 'code',
          paymentNote: `تفعيل بكود: ${code}${ac.durationDays ? ` (${ac.durationDays} يوم)` : ''}`,
        },
        include: { plan: true },
      })

      // 4. Activate tenant
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'active' },
      })

      return { sub, ac, endDate }
    })

    // 5. Create an in-app notification confirming the renewal
    // (outside the transaction — non-critical, don't fail the redeem if it errors)
    try {
      const daysGranted = result.ac.durationDays
        ? result.ac.durationDays
        : result.ac.period === 'yearly'
          ? 365
          : result.ac.period === 'monthly'
            ? 30
            : result.ac.plan.trialDays || 14

      await createNotification(db, tenantId, {
        type: 'subscription_redeemed',
        title: 'تم تفعيل الاشتراك بنجاح',
        message:
          `تم تفعيل باقة "${result.ac.plan.name}" لمدة ${daysGranted} يوم ` +
          `(حتى ${result.endDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}). ` +
          `شكراً لاستخدامك نظامنا! 🎉`,
        link: '/settings',
      })
    } catch (notifErr) {
      console.warn('[redeem] failed to create confirmation notification:', notifErr)
      // Don't fail the redeem — the subscription is already active
    }

    return NextResponse.json({
      ok: true,
      subscription: {
        id: result.sub.id,
        endDate: result.sub.endDate.toISOString(),
        planId: result.ac.planId,
        planName: result.ac.plan.name,
        period: result.sub.period,
      },
    })
  } catch (e: any) {
    // P2025 = record not found → code already redeemed (race condition)
    if (e?.code === 'P2025') {
      // Check if the code exists at all (could be a race with delete)
      const stillExists = await db.activationCode.findUnique({ where: { code } })
      if (!stillExists) {
        return NextResponse.json({ error: 'كود غير صحيح' }, { status: 404 })
      }
      if (stillExists.redeemedAt) {
        return NextResponse.json({ error: 'هذا الكود مستخدم بالفعل' }, { status: 400 })
      }
      // Otherwise the race resolved in a weird way — generic error
      return NextResponse.json(
        { error: 'تعذّر تفعيل الكود — حاول مرة أخرى' },
        { status: 500 },
      )
    }
    console.error('[redeem] unexpected error:', e)
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع — حاول مرة أخرى' },
      { status: 500 },
    )
  }
}
