import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { getSql } from '@/lib/sql'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import { createPaymobIntention, toCents } from '@/lib/paymob'
import { runNonBlocking, trackServerEvent, extractRequestContext } from '@/lib/tracking/server'
import { TRACKING_EVENTS } from '@/lib/tracking/types'
import { getPlanContext } from '@/lib/features'
import { ADDON_CATALOG, addOnAvailableForPlan, isAddOnKey, planIncludesHr, type AddOnKey } from '@/lib/addons'
import { readAddOnPrices } from '@/lib/addon-settings'
import { countableSubWhere } from '@/lib/subscription-status'

export const dynamic = 'force-dynamic'

/**
 * POST /api/addons/checkout
 *
 * 🧩 2026-11-04 (التحديث 25): جلسة دفع Paymob لإضافة مدفوعة —
 * نفس نمط /api/paymob/checkout بالظبط، بس على جدول TenantAddOn بدل Subscription:
 *
 *   1. صف TenantAddOn بحالة 'pending' — بدون أي مدة (endDate = startDate)
 *      عشان محاولة دفع مفتوحة ومااتدفعش ما تمنحش شيئاً.
 *   2. merchantOrderId = "addon-<rowId>" — الـ webhook بيميّز الإضافات عن
 *      الاشتراكات بالبادئة دي وبيفعّل الصف بعد التحقق من المبلغ والـ intention.
 *   3. المبلغ المتوقع (amountExpected) بيتخزن في الصف وقت الـ checkout —
 *      الـ webhook بيقارن بيه بدل سعر باقة.
 *
 * شروط الشراء (حماية من «دفعت فلوس وحاجة مش هتتنفع»):
 *   - اشتراك مدفوع شغّال (مش تجربة) — الإضافة بتتباع بعد ما الباقة تتفعل.
 *     ملاحظة: اشتراكك ممكن يكون على وشك الانتهاء — العمر بيتحسب من تاريخ
 *     التفعيل، والتجديد بيتم من الإعدادات → «إضافات الباقة».
 *   - HR مش متاح لباقة الغذائية، ومينفعش يتشرى لو الباقة الاحترافية (مشمولة).
 */

// ── 1. Auth ────────────────────────────────────────────────────────
async function __POST(req: NextRequest) {
  let session
  try {
    // زي paymob/checkout: المستخدم المنتهي هو أصلاً اللي لازم يدفع —
    // لكن الشراء هنا محتاج اشتراك مدفوع شغّال (فحص تحت).
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  if (!session || session.role === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'حساب المنصة لا يحتاج شراء إضافات' },
      { status: 400 }
    )
  }

  // ── 2. Validate body ────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const addOnKey = String(body.addOnKey ?? '').trim() as AddOnKey
  const period = body.period === 'yearly' ? 'yearly' : 'monthly'
  const successUrl = String(body.successUrl ?? '/checkout/callback?status=success')
  const cancelUrl = String(body.cancelUrl ?? '/checkout/callback?status=failed&reason=user_cancelled')

  if (!isAddOnKey(addOnKey)) {
    return NextResponse.json({ error: 'الإضافة غير معروفة' }, { status: 400 })
  }
  const def = ADDON_CATALOG[addOnKey]

  const quantity = def.quantifiable
    ? Math.min(def.maxQuantity, Math.max(1, Math.floor(Number(body.quantity) || 1)))
    : 1

  const customer = body.customer && typeof body.customer === 'object'
    ? {
        name: String(body.customer.name ?? ''),
        phone: String(body.customer.phone ?? ''),
        email: String(body.customer.email ?? ''),
      }
    : null

  // ── 3. Tenant + الباقة الحالية ──────────────────────────────────────
  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, shopName: true, status: true },
  })
  if (!tenant) return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  // 🛡️ خ-10 (2026-11-02): نفس قاعدة باقات — المحل الموقوف إداريًا مابدفعش من قناة الدفع الذاتي
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    return NextResponse.json(
      { error: 'هذا المحل موقوف إداريًا — تواصل مع الدعم' },
      { status: 403 }
    )
  }

  const ctx = await getPlanContext(session.tenantId)
  const latestSub = await db.subscription.findFirst({
    where: { tenantId: session.tenantId, ...countableSubWhere },
    orderBy: { endDate: 'desc' },
    select: { status: true, period: true, endDate: true, plan: { select: { code: true } } },
  })
  // 🧩 توفر الإضافة على نشاط المحل (HR ممنوع على الغذائية — بقية الإضافات للكل)
  if (!addOnAvailableForPlan(addOnKey, latestSub?.plan?.code ?? null, ctx.businessType)) {
    return NextResponse.json({ error: 'الإضافة دي غير متاحة لنشاط محلك' }, { status: 400 })
  }
  // HR على الاحترافية = مشمولة أصلاً — منع شراء بلا معنى
  if (addOnKey === 'hr' && planIncludesHr(latestSub?.plan?.code)) {
    return NextResponse.json(
      { error: 'الموارد البشرية مشمولة بالفعل في الباقة الاحترافية — مش محتاج تشتريها' },
      { status: 400 }
    )
  }

  // 🛡️ الإضافات بتتباع للاشتراك المدفوع الشغّال فقط — التجربة متشملهاش
  // (لو سمحنا فيها، عميل التجربة يدفع إضافة شهر وبتخلص مع تجربته).
  const now = new Date()
  const hasPaidSub =
    !!latestSub &&
    latestSub.status === 'active' &&
    latestSub.endDate > now &&
    latestSub.period !== 'trial'
  if (!hasPaidSub) {
    return NextResponse.json(
      {
        error: 'الإضافات بتتفعل مع الاشتراك المدفوع الشغّال — اشترك أو جدّد باقتك الأول من صفحة الأسعار',
        code: 'NO_PAID_SUBSCRIPTION',
      },
      { status: 402 }
    )
  }

  // ── 4. السعر الفعلي (PlatformSetting أو الافتراضي) × الكمية ─────────
  const prices = await readAddOnPrices(getSql())
  const unitPrice = period === 'yearly' ? prices[addOnKey].yearly : prices[addOnKey].monthly
  const amount = Math.round(unitPrice * quantity * 100) / 100
  if (amount <= 0) {
    return NextResponse.json(
      { error: 'الإضافة دي مش متاحة للشراء حالياً' },
      { status: 400 }
    )
  }

  // ── 5. صف pending بدون مدة ──────────────────────────────────────────
  // 🛡️ نفس جذر إصلاح 2026-09-27 في الباقات: endDate = startDate (صفر مدة).
  // التاريخ الحقيقي بيتحسب في الـ webhook بعد تأكيد Paymob فقط.
  const startDate = new Date()

  // إغلاق محاولات الدفع المتروكة (أقدم من 30 دقيقة) — نفس سلوك الباقات
  await db.tenantAddOn.updateMany({
    where: {
      tenantId: session.tenantId,
      status: 'pending',
      createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    data: { status: 'failed', paymentNote: 'paymob-abandoned-checkout' },
  }).catch(() => {})

  const pendingAddOn = await db.tenantAddOn.create({
    data: {
      tenantId: session.tenantId,
      addOnKey,
      quantity,
      status: 'pending',
      startDate,
      endDate: startDate,
      period,
      amountExpected: amount,
      amountPaid: 0,
      paymentMethod: 'paymob',
      paymentNote: `paymob-checkout-initiated-by:${session.email}`,
    },
  })

  // ── 6. جلسة Paymob ──────────────────────────────────────────────────
  try {
    const merchantOrderId = `addon-${pendingAddOn.id}`
    const fullName = customer?.name?.trim() || session.name || tenant.shopName || 'Customer'
    const email = customer?.email?.trim() || session.email || `${session.userId}@local`
    const phone = customer?.phone?.trim() || '01000000000'
    const qtyLabel = quantity > 1 ? ` ×${quantity}` : ''
    const planLabel = `${def.name}${qtyLabel} - ${period === 'yearly' ? 'سنوي' : 'شهري'}`

    const { checkoutUrl, intentionId } = await createPaymobIntention({
      merchantOrderId,
      amountCents: toCents(amount),
      planLabel,
      customer: { name: fullName, phone, email },
    })

    await db.tenantAddOn.update({
      where: { id: pendingAddOn.id },
      data: {
        paymentNote: `paymob-intention:${intentionId}|by:${session.email}|success:${successUrl}|cancel:${cancelUrl}`,
      },
    })

    // ═══ 📊 Tracking: InitiateCheckout (نفس حدث الباقات — contentType مختلف) ═══
    const checkoutEventId = `checkout-addon-${pendingAddOn.id}`
    const reqCtx = extractRequestContext(req.headers)
    runNonBlocking(() => trackServerEvent({
      eventName: TRACKING_EVENTS.InitiateCheckout,
      eventId: checkoutEventId,
      params: {
        value: amount,
        currency: 'EGP',
        contentName: def.name, contentType: 'subscription_addon',
        contentId: addOnKey, planId: addOnKey,
        planName: def.name, period,
      },
      context: {
        ...reqCtx,
        email,
        phone: phone || undefined,
        externalId: session.userId,
      },
    }))

    return NextResponse.json({
      ok: true,
      checkoutUrl,
      merchantOrderId,
      addOnId: pendingAddOn.id,
      amount,
      period,
      quantity,
      addOnName: def.name,
      tracking: { checkoutEventId, value: amount, currency: 'EGP', planId: addOnKey, planName: def.name, period },
    })
  } catch (e: any) {
    await db.tenantAddOn.update({
      where: { id: pendingAddOn.id },
      data: {
        status: 'failed',
        paymentNote: `paymob-init-error:${e?.message ?? 'unknown'}`,
      },
    })
    return NextResponse.json(
      { error: e?.message || 'فشل إنشاء جلسة الدفع' },
      { status: 500 }
    )
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
