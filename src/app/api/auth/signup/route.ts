import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hashPassword, createSession } from '@/lib/auth'
import { runNonBlocking, trackServerEvent, extractRequestContext } from '@/lib/tracking/server'
import { TRACKING_EVENTS } from '@/lib/tracking/types'

export const dynamic = 'force-dynamic'

const TRIAL_DAYS = 14

/**
 * Signup — creates a new tenant + admin user + 14-day trial subscription.
 *
 * 🛡️ 2026-09-13 new flow:
 *   - We NO LONGER create a fake `trial` plan with all features unlocked.
 *   - Instead, we look up the canonical `electronics-basic` plan and grant
 *     a 14-day trial of that plan (period='trial', amountPaid=0).
 *   - The user gets the same full access during trial because `getPlanContext`
 *     includes CRITICAL_MODULES on every plan.
 *   - If the user wants a different plan (Pro or Fashion), they go to
 *     /pricing after login and start a new trial there (or pay via Paymob
 *     if they've already used a trial).
 */
async function __POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }
    const shopName = String(body.shopName ?? '').trim()
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const phone = String(body.phone ?? '').trim()
    const password = String(body.password ?? '')
    const agree = body.agree === true || body.agree === 'true'
    // 🆕 Optional: user can pre-select a plan code from the pricing page.
    // Defaults to 'electronics-basic' if not provided.
    const requestedPlanCode = String(body.planCode ?? 'electronics-basic').trim()

    // 📊 Attribution (اختياري — يُرسله المتصفح من طبقة التتبع):
    // first/last touch + click ids — تُحفظ في جدول مستقل بدون تعديل User
    const attribution = (body.attribution && typeof body.attribution === 'object')
      ? (body.attribution as Record<string, any>)
      : null

    if (!shopName) {
      return NextResponse.json({ error: 'اسم المحل مطلوب' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
        { status: 400 }
      )
    }
    if (!agree) {
      return NextResponse.json(
        { error: 'يجب الموافقة على الشروط والأحكام' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'هذا البريد الإلكتروني مسجّل بالفعل' },
        { status: 400 }
      )
    }

    const hash = await hashPassword(password)

    // 🛡️ 2026-09-13: Find the requested paid plan (default: electronics-basic).
    // We NO LONGER create a fake `trial` plan — we use a real paid plan and
    // grant a 14-day trial of it (period='trial', amountPaid=0).
    let trialPlan = await db.plan.findUnique({ where: { code: requestedPlanCode } })

    // If the requested plan doesn't exist OR is a zero-price plan (trial/free/etc.),
    // fall back to electronics-basic. This is a safety net — the pricing page
    // only shows paid plans, but a manual API call could send anything.
    if (!trialPlan || (trialPlan.priceMonthly === 0 && trialPlan.priceYearly === 0)) {
      trialPlan = await db.plan.findUnique({ where: { code: 'electronics-basic' } })
    }
    // Last-resort fallback: if even electronics-basic is missing from DB,
    // create it on the fly with the canonical config from seed-plans.ts.
    if (!trialPlan) {
      trialPlan = await db.plan.create({
        data: {
          code: 'electronics-basic',
          name: 'أساسية - موبايل وكمبيوتر',
          description: 'إدارة كاملة لمحل الموبايل والكمبيوتر — POS، مخزون، صيانة، معاملات مالية',
          priceMonthly: 299,
          priceYearly: 2990,
          maxUsers: 3,
          maxProducts: 500,
          maxBranches: 1,
          trialDays: TRIAL_DAYS,
          businessType: 'electronics',
          enabledModules: JSON.stringify([
            'dashboard','pos','products','sales','maintenance','customers','suppliers',
            'purchases','inventory','finance','expenses','cash','reports','settings',
            'users','branches',
          ]),
          capabilities: JSON.stringify([]),
          isActive: true,
          sortOrder: 10,
        },
      })
      console.log(`[signup] created fallback electronics-basic plan (id=${trialPlan.id})`)
    }

    // 🛡️ Backfill: if plan exists but is missing enabledModules (legacy plans),
    // populate it from CRITICAL_MODULES + ALL_MODULES so the user sees all pages.
    if (trialPlan && !trialPlan.enabledModules) {
      trialPlan = await db.plan.update({
        where: { id: trialPlan.id },
        data: {
          enabledModules: JSON.stringify([
            'dashboard','pos','products','sales','maintenance','customers','suppliers',
            'purchases','finance','expenses','cash','reports','settings','users',
            'inventory','branches',
          ]),
          capabilities: JSON.stringify(['collections','multi_unit','variants','returns_exchange','loyalty']),
        },
      })
    }

    const endDate = new Date()
    endDate.setDate(endDate.getDate() + (trialPlan.trialDays || TRIAL_DAYS))

    // Create tenant + admin user + trial subscription in one transaction
    const tenant = await db.tenant.create({
      data: {
        shopName,
        phone: phone || null,
        ownerEmail: email,
        ownerPhone: phone || null,
        status: 'active',
        users: {
          create: {
            name,
            email,
            password: hash,
            role: 'ADMIN',
          },
        },
        subscriptions: {
          create: {
            planId: trialPlan.id,
            status: 'active',
            startDate: new Date(),
            endDate,
            period: 'trial',
            amountPaid: 0,
            paymentMethod: 'manual',
            paymentNote: 'تجربة تلقائية عند التسجيل',
          },
        },
      },
      include: { users: true, subscriptions: true },
    })

    const user = tenant.users[0]
    await createSession({
      id: user.id,
      tenantId: tenant.id,
      role: user.role,
      name: user.name,
      email: user.email,
      branchId: null,
    })

    // ═══ 📊 Marketing & Tracking — بعد نجاح التسجيل فعلياً ═══
    // الحدثان يُرسلان Server-side (Meta CAPI / TikTok Events API / GA4 MP)
    // بمعرفات ثابتة، ونُعيدها للمتصفح ليُطلق نفس الأحداث Browser-side
    // بنفس event_id → Deduplication مثالي في كل المنصات.
    // فشل التتبع لا يؤثر على نجاح التسجيل إطلاقاً (Non-blocking).
    const trialSub = tenant.subscriptions[0]
    const regEventId = `signup-${user.id}`
    const trialEventId = `trial-sub-${trialSub?.id ?? 'unknown'}`
    // يشمل gaClientId/gaSessionId/ttp من كوكيز المتصفح
    const reqCtx = extractRequestContext(req.headers)
    const trackingCtx = {
      ...reqCtx,
      email: user.email,
      phone: phone || undefined,
      firstName: name.split(' ')[0] || undefined,
      lastName: name.split(' ').slice(1).join(' ') || undefined,
      externalId: user.id,
    }

    // 🧭 حفظ مصدر الاكتساب (first/last touch + click ids)
    if (attribution) {
      const t = attribution as Record<string, any>
      const first = (t.first && typeof t.first === 'object') ? t.first : {}
      const last = (t.last && typeof t.last === 'object') ? t.last : {}
      const s = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : null)
      await db.userAttribution.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          firstTouchSource: s(first.source), firstTouchMedium: s(first.medium),
          firstTouchCampaign: s(first.campaign), firstTouchContent: s(first.content),
          firstTouchTerm: s(first.term),
          firstTouchAt: first.at ? new Date(String(first.at)) : null,
          lastTouchSource: s(last.source), lastTouchMedium: s(last.medium),
          lastTouchCampaign: s(last.campaign), lastTouchContent: s(last.content),
          lastTouchTerm: s(last.term),
          lastTouchAt: last.at ? new Date(String(last.at)) : new Date(),
          gclid: s(t.gclid, 200), fbclid: s(t.fbclid, 200), ttclid: s(t.ttclid, 200),
          wbraid: s(t.wbraid, 200), gbraid: s(t.gbraid, 200),
          landingPage: s(t.landingPage, 500), referrer: s(t.referrer, 500),
        },
      }).catch(() => {}) // فشل الإسناد لا يوقف التسجيل
    }

    runNonBlocking(() => trackServerEvent({
      eventName: TRACKING_EVENTS.CompleteRegistration,
      eventId: regEventId,
      params: { contentName: trialPlan.name, contentType: 'subscription_plan', contentId: String(trialPlan.id) },
      context: trackingCtx,
      subscriptionId: trialSub?.id,
    }))
    // بدء التجربة فعلياً (14 يوم) حدث منفصل عن التسجيل
    runNonBlocking(() => trackServerEvent({
      eventName: TRACKING_EVENTS.StartTrial,
      eventId: trialEventId,
      params: {
        contentName: trialPlan.name, contentType: 'subscription_plan',
        contentId: String(trialPlan.id), planId: String(trialPlan.id),
        planName: trialPlan.name, period: 'trial', currency: 'EGP',
      },
      context: trackingCtx,
      subscriptionId: trialSub?.id,
    }))

    return NextResponse.json({
      ok: true,
      user: {
        userId: user.id,
        name: user.name,
        role: user.role,
        tenantId: tenant.id,
        email: user.email,
        branchId: null,
      },
      // 📊 معرفات الأحداث — المتصفح يُطلق نفس الأحداث بنفس event_id
      tracking: {
        registrationEventId: regEventId,
        trialEventId,
        planName: trialPlan.name,
      },
    })
  } catch (e: any) {
    console.error('[signup] Unexpected error:', e)
    return NextResponse.json(
      { error: e?.message || 'خطأ داخلي في الخادم' },
      { status: 500 }
    )
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
