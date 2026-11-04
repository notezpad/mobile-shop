import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { paymobVerifyHmacAsync, toCents } from '@/lib/paymob'
import { readEnv } from '@/lib/env'
import { computeEndDate, computeAmount } from '@/lib/admin-utils'
import { runNonBlocking, trackServerEvent } from '@/lib/tracking/server'
import { TRACKING_EVENTS } from '@/lib/tracking/types'
// 🧩 2026-11-04 (التحديث 25): إبطال كاش سياق الباقة بعد تفعيل إضافة
import { invalidatePlanContextCache } from '@/lib/features'
import { ADDON_CATALOG } from '@/lib/addons'

export const dynamic = 'force-dynamic'

/**
 * POST /api/paymob/webhook
 *
 * Paymob server-to-server callback. Paymob sends transaction updates here
 * (success, failure, void, refund). We verify the HMAC signature using
 * PAYMOB_HMAC_SECRET and, on success, flip the matching PENDING subscription
 * to ACTIVE.
 *
 * Configuration:
 *   - In the Paymob dashboard, set the webhook URL to:
 *       https://your-domain.com/api/paymob/webhook
 *   - The "HMAC Secret" in Paymob dashboard must match PAYMOB_HMAC_SECRET.
 *
 * Body is form-urlencoded (Paymob default). We read it as URLSearchParams.
 */
async function __POST(req: NextRequest) {
  const hmacSecret = readEnv('PAYMOB_HMAC_SECRET')
  if (!hmacSecret) {
    console.error('[paymob/webhook] PAYMOB_HMAC_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Read form-urlencoded body
  const text = await req.text()
  const params = new URLSearchParams(text)

  // ── HMAC verification ────────────────────────────────────────────
  const valid = await paymobVerifyHmacAsync(params, hmacSecret)
  if (!valid) {
    console.warn('[paymob/webhook] HMAC verification failed — ignoring')
    return NextResponse.json({ error: 'HMAC verification failed' }, { status: 400 })
  }

  // ── Extract transaction data ────────────────────────────────────────
  // The webhook callback includes transaction fields either at the top level
  // or nested inside `obj`. We check both.
  const obj = (() => {
    const objStr = params.get('obj')
    if (objStr) {
      try { return JSON.parse(objStr) } catch { return null }
    }
    // Fallback — flatten params into an object
    const out: Record<string, string> = {}
    for (const [k, v] of params.entries()) out[k] = v
    return out
  })()

  if (!obj) {
    return NextResponse.json({ error: 'No transaction object' }, { status: 400 })
  }

  const success = String(obj.success ?? params.get('success')) === 'true'
  const txnId = String(obj.id ?? params.get('id') ?? '')
  const merchantOrderId = String(obj.order?.merchant_order_id ?? obj.merchant_order_id ?? params.get('merchant_order_id') ?? '')

  // `is_voided` / `is_refunded` indicate post-payment corrections
  const isVoided = String(obj.is_voided ?? params.get('is_voided')) === 'true'
  const isRefunded = String(obj.is_refunded ?? params.get('is_refunded')) === 'true'

  if (!merchantOrderId) {
    console.warn('[paymob/webhook] No merchant_order_id in payload')
    return NextResponse.json({ error: 'Missing merchant_order_id' }, { status: 400 })
  }

  // merchantOrderId = "sub-<subscriptionId>" (set in /api/paymob/checkout)
  // 🧩 أو "addon-<addOnRowId>" (set in /api/addons/checkout) — إضافة مدفوعة
  const orderIdMatch = merchantOrderId.match(/^(sub|addon)-(\d+)$/)
  if (!orderIdMatch) {
    console.warn(`[paymob/webhook] Unrecognized merchant_order_id: ${merchantOrderId}`)
    return NextResponse.json({ ok: true }) // 200 so Paymob doesn't retry
  }
  const orderKind = orderIdMatch[1] as 'sub' | 'addon'
  const orderRowId = Number(orderIdMatch[2])

  // 🧩 مسار الإضافات المدفوعة — نفس بروتوكول التحقق (HMAC + مبلغ + intention)
  // بس على TenantAddOn بدل Subscription. بيتنفذ مستقل وبيرجع — عشان منطق
  // الاشتراكات يفضل زي ما هو من غير ما نلمسه.
  if (orderKind === 'addon') {
    return handleAddOnWebhook({
      addOnId: orderRowId,
      txnId,
      success: success && !isVoided && !isRefunded,
      isVoided: isVoided || isRefunded,
      obj,
    })
  }

  const subscriptionId = orderRowId

  // ── Process the update ────────────────────────────────────────────
  try {
    const sub = await db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, tenant: true },
    })

    if (!sub) {
      console.warn(`[paymob/webhook] Subscription ${subscriptionId} not found`)
      return NextResponse.json({ ok: true })
    }

    // 🛡️ Idempotency: never re-activate / re-extend an already-active row.
    if (success && !isVoided && !isRefunded && sub.status === 'active') {
      console.log(`[paymob/webhook] Subscription ${subscriptionId} already active — ignoring duplicate callback`)
      return NextResponse.json({ ok: true })
    }

    if (success && !isVoided && !isRefunded) {
      // ── Payment succeeded — activate subscription ──
      // 🛡️ خ-10 (2026-11-02): أربع حماية قبل التفعيل:
      //  (أ) تحقق المبلغ من Paymob مقابل سعر الباقة المخزّن للفترة
      //      (سماحية قرش واحد للتقريب) — عدم التطابق: سجل للمراجعة اليدوية
      //      وارفض التفعيل. قبل كده المبلغ كان بيتخزن زي ما جاي بدون مقارنة.
      const amountCents = Number(obj.amount_cents ?? 0)
      const expectedCents = toCents(Number(sub.period === 'yearly' ? sub.plan.priceYearly : sub.plan.priceMonthly))
      if (expectedCents > 0 && Math.abs(amountCents - expectedCents) > 1) {
        console.warn(`[paymob/webhook] Sub ${subscriptionId} amount mismatch: got ${amountCents}, expected ${expectedCents} — manual review`)
        if (sub.status === 'pending' && !(sub.paymentNote ?? '').includes(`paymob-txn:${txnId}`)) {
          await db.subscription.update({
            where: { id: subscriptionId },
            data: { paymentNote: `paymob-txn:${txnId}|amount-mismatch:got-${amountCents}-expected-${expectedCents}` },
          })
        }
        return NextResponse.json({ ok: true }) // 200 عشان Paymob مايعيدش — الحالة للمراجعة اليدوية
      }

      //  (أ-2) ربط جلسة الدفع: لو الـ payload فيه مرجع intention والمخزّن في
      //      paymentNote مختلف → رفض. (merchant_order_id=sub-<id> هو الرابط
      //      الأساسي أصلًا — ده طبقة تحقق إضافية لو الحقل موجود)
      const storedIntention = (sub.paymentNote ?? '').match(/paymob-intention:([^|]+)/)?.[1]
      const payloadIntention = String(obj.intention_id ?? obj.order?.intention_id ?? '')
      if (storedIntention && payloadIntention && payloadIntention !== storedIntention) {
        console.warn(`[paymob/webhook] Sub ${subscriptionId} intention mismatch: payload=${payloadIntention}, stored=${storedIntention}`)
        if (sub.status === 'pending' && !(sub.paymentNote ?? '').includes(`paymob-txn:${txnId}`)) {
          await db.subscription.update({
            where: { id: subscriptionId },
            data: { paymentNote: `paymob-txn:${txnId}|intention-mismatch:got-${payloadIntention}-expected-${storedIntention}` },
          })
        }
        return NextResponse.json({ ok: true })
      }

      // Use our helper to compute the proper end date. If the user already has
      // an active subscription that hasn't expired, EXTEND the end date
      // instead of starting a new one — this is the standard SaaS behaviour.
      // 🛡️ 2026-09-27: base the extension on the tenant's real ACTIVE
      // subscription (if any), never on the pending row's own endDate.
      const now = new Date()
      const currentActive = await db.subscription.findFirst({
        where: { tenantId: sub.tenantId, status: 'active', endDate: { gt: now } },
        orderBy: { endDate: 'desc' },
      })
      const baseDate = currentActive && currentActive.endDate > now ? currentActive.endDate : now
      const newEndDate = computeEndDate(baseDate, sub.period as 'monthly' | 'yearly', sub.plan.trialDays)
      const amount = amountCents / 100

      //  (ب+ج) التفعيل بـ UPDATE شرطي واحد — بيقفل السباق (webhookان متزامنان
      //      بيقرأوا pending ويفعّلا مرتين) والـ replay (webhook قديم معاد إرساله
      //      بعد ما الاشتراك بقى expired/cancelled هيعيد تفعيله) وإحياء الملغي
      //      مرة واحدة: الحالة لازم تفضل 'pending' لحظة التحديث، count≠1 = رفض.
      const activated = await db.subscription.updateMany({
        where: { id: subscriptionId, status: 'pending' },
        data: {
          status: 'active',
          startDate: now,
          endDate: newEndDate,
          amountPaid: computeAmount(sub.plan, sub.period as 'monthly' | 'yearly', amount),
          paymentMethod: 'paymob',
          paymentNote: `paymob-txn:${txnId}|order:${obj.order?.id ?? ''}`,
        },
      })
      if (activated.count !== 1) {
        console.log(`[paymob/webhook] Subscription ${subscriptionId} not pending (status=${sub.status}) — ignoring duplicate/replayed callback`)
        return NextResponse.json({ ok: true })
      }

      //  (د) رفع حالة المحل: فقط لو كانت 'expired' (تجديد ذاتي مشروع).
      //      المحل الموقوف إداريًا (suspended/cancelled) مابيرفعش إيقافه بالدفع —
      //      الاشتراك بيتفعّل (سجل الدفع حقيقي) ورفع الإيقاف قرار أدمن.
      if (sub.tenant.status === 'expired') {
        await db.tenant.update({
          where: { id: sub.tenantId },
          data: { status: 'active' },
        })
      }

      console.log(`[paymob/webhook] Subscription ${subscriptionId} activated — end ${newEndDate.toISOString()} (tenant was ${sub.tenant.status})`)

      // ═══ 📊 Tracking: Purchase — تأكيد الدفع الحقيقي ═══
      // الشرط الوحيد لإطلاق Purchase: HMAC موثق + success=true
      // + تحديث الاشتراك إلى active فعلياً في قاعدة البيانات.
      //
      // IDEMPOTENCY: eventId ثابت = purchase-sub-<id> — إن أُعيد
      // إرسال الـ Webhook (Retry من Paymob) أو وصل نفس العملية من
      // مسار آخر، فحص alreadySent داخل trackServerEvent + الفهرس
      // الفريد (provider + eventId) يمنع العد المزدوج نهائياً.
      // فشل التتبع لا يؤثر على نجاح الدفع إطلاقاً (Non-blocking).
      const paidAmount = computeAmount(sub.plan, sub.period as 'monthly' | 'yearly', amount)
      runNonBlocking(() => trackServerEvent({
        eventName: TRACKING_EVENTS.Purchase,
        eventId: `purchase-sub-${subscriptionId}`,
        params: {
          value: paidAmount,
          currency: 'EGP',
          transactionId: String(txnId || obj.order?.id || subscriptionId),
          contentName: sub.plan.name, contentType: 'subscription_plan',
          contentId: String(sub.plan.id), planId: String(sub.plan.id),
          planName: sub.plan.name, period: sub.period,
        },
        context: {
          email: sub.tenant?.ownerEmail || undefined,
          externalId: sub.tenantId,
        },
        subscriptionId: subscriptionId,
      }))
    } else if (isVoided || isRefunded) {
      // ── Transaction voided / refunded — revert subscription ──
      // If the subscription is still pending, mark failed.
      // If it was already active, we leave it active but log the refund —
      // admin can decide to revoke manually.
      if (sub.status === 'pending') {
        await db.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'failed',
            paymentNote: `paymob-txn:${txnId}|voided/refunded`,
          },
        })
      } else {
        await db.subscription.update({
          where: { id: subscriptionId },
          data: {
            paymentNote: `paymob-txn:${txnId}|voided/refunded-on-active-sub`,
          },
        })
      }
      console.log(`[paymob/webhook] Subscription ${subscriptionId} void/refund recorded`)
    } else {
      // ── Payment failed (success=false) — mark subscription failed ──
      if (sub.status === 'pending') {
        await db.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'failed',
            paymentNote: `paymob-txn:${txnId}|payment-failed`,
          },
        })
      }
      console.log(`[paymob/webhook] Subscription ${subscriptionId} payment failed`)
    }
  } catch (e: any) {
    console.error('[paymob/webhook] Error processing webhook:', e?.message ?? e)
    // Return 500 so Paymob retries
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET is here only for testing — Paymob always uses POST for the webhook.
async function __GET() {
  return NextResponse.json({
    ok: true,
    message: 'Paymob webhook endpoint. Configure this URL in your Paymob dashboard.',
  })
}

/**
 * 🧩 2026-11-04 (التحديث 25): تفعيل الإضافات المدفوعة من webhook Paymob.
 *
 * نفس طبقات حماية الاشتراكات بالظبط:
 *   (أ) التحقق من المبلغ: الدفع من Paymob مقابل amountExpected المخزّن وقت
 *       الـ checkout (سماحية قرش واحد للتقريب) — عدم التطابق: تسجيل للمراجعة
 *       ورفض التفعيل.
 *   (أ-2) ربط جلسة الدفع: لو الـ payload فيه intention ومخزّن مختلف → رفض.
 *   (ب+ج) تفعيل بـ UPDATE شرطي واحد (status لازم يفضل 'pending') — بيقفل
 *       السباق والـ replay وإحياء الملغي مرة واحدة.
 *   (د) حساب endDate: تمديد على آخر إضافة نشطة لنفس النوع (لو لسه شغالة)،
 *       وإلا من الآن + المدة — نفس منطق تجديد الاشتراكات (التمديد من
 *       تاريخ الانتهاء مش من تاريخ الدفع).
 *
 * بعد التفعيل: إبطال كاش سياق الباقة — الموديول/الحد الجديد يظهر فوراً.
 */
async function handleAddOnWebhook(input: {
  addOnId: number
  txnId: string
  success: boolean
  isVoided: boolean
  // any زي الـ __POST الأصلي — الـ payload بتيجي من JSON.parse/URLSearchParams
  obj: any
}): Promise<NextResponse> {
  const { addOnId, txnId, success, isVoided, obj } = input
  try {
    const row = await db.tenantAddOn.findUnique({
      where: { id: addOnId },
      include: { tenant: true },
    })

    if (!row) {
      console.warn(`[paymob/webhook] Add-on ${addOnId} not found`)
      return NextResponse.json({ ok: true })
    }

    // 🛡️ Idempotency — نفس مبدأ الاشتراكات
    if (success && !isVoided && row.status === 'active') {
      console.log(`[paymob/webhook] Add-on ${addOnId} already active — ignoring duplicate callback`)
      return NextResponse.json({ ok: true })
    }

    if (success && !isVoided) {
      // (أ) تحقق المبلغ مقابل المبلغ المتوقع المخزّن وقت الـ checkout
      const amountCents = Number(obj.amount_cents ?? 0)
      const expectedCents = toCents(Number(row.amountExpected))
      if (expectedCents > 0 && Math.abs(amountCents - expectedCents) > 1) {
        console.warn(`[paymob/webhook] Add-on ${addOnId} amount mismatch: got ${amountCents}, expected ${expectedCents} — manual review`)
        if (row.status === 'pending' && !(row.paymentNote ?? '').includes(`paymob-txn:${txnId}`)) {
          await db.tenantAddOn.update({
            where: { id: addOnId },
            data: { paymentNote: `paymob-txn:${txnId}|amount-mismatch:got-${amountCents}-expected-${expectedCents}` },
          })
        }
        return NextResponse.json({ ok: true }) // 200 عشان Paymob مايعيدش — المراجعة يدوية
      }

      // (أ-2) ربط جلسة الدفع (intention) — لو الحقلين موجودين ومختلفين → رفض
      const storedIntention = (row.paymentNote ?? '').match(/paymob-intention:([^|]+)/)?.[1]
      const payloadIntention = String(obj.intention_id ?? obj.order?.intention_id ?? '')
      if (storedIntention && payloadIntention && payloadIntention !== storedIntention) {
        console.warn(`[paymob/webhook] Add-on ${addOnId} intention mismatch`)
        if (row.status === 'pending' && !(row.paymentNote ?? '').includes(`paymob-txn:${txnId}`)) {
          await db.tenantAddOn.update({
            where: { id: addOnId },
            data: { paymentNote: `paymob-txn:${txnId}|intention-mismatch:got-${payloadIntention}-expected-${storedIntention}` },
          })
        }
        return NextResponse.json({ ok: true })
      }

      // (د) حساب endDate — تمديد على آخر إضافة نشطة لنفس النوع، وإلا من الآن
      const now = new Date()
      const sibling = await db.tenantAddOn.findFirst({
        where: {
          tenantId: row.tenantId,
          addOnKey: row.addOnKey,
          status: 'active',
          endDate: { gt: now },
          id: { not: addOnId },
        },
        orderBy: { endDate: 'desc' },
      })
      const baseDate = sibling && sibling.endDate > now ? sibling.endDate : now
      const newEndDate = new Date(baseDate)
      newEndDate.setDate(newEndDate.getDate() + (row.period === 'yearly' ? 365 : 30))

      // (ب+ج) تفعيل بـ UPDATE شرطي واحد — نفس الحماية ضد السباق/replay
      const activated = await db.tenantAddOn.updateMany({
        where: { id: addOnId, status: 'pending' },
        data: {
          status: 'active',
          startDate: now,
          endDate: newEndDate,
          amountPaid: Number(row.amountExpected),
          paymentMethod: 'paymob',
          paymentNote: `paymob-txn:${txnId}|order:${obj.order?.id ?? ''}`,
        },
      })
      if (activated.count !== 1) {
        console.log(`[paymob/webhook] Add-on ${addOnId} not pending (status=${row.status}) — ignoring duplicate/replayed callback`)
        return NextResponse.json({ ok: true })
      }

      // 🧩 الإضافة اتفعّلت — الكاش القديم يحتوي وصف باقتها بدونها: أبطله فوراً
      invalidatePlanContextCache(row.tenantId)

      console.log(`[paymob/webhook] Add-on ${addOnId} (${row.addOnKey}) activated — end ${newEndDate.toISOString()}`)

      // ═══ 📊 Tracking: Purchase — تأكيد الدفع الحقيقي (نفس eventId الثابت) ═══
      const def = ADDON_CATALOG[row.addOnKey as keyof typeof ADDON_CATALOG]
      const paidAmount = Number(row.amountExpected)
      runNonBlocking(() => trackServerEvent({
        eventName: TRACKING_EVENTS.Purchase,
        eventId: `purchase-addon-${addOnId}`,
        params: {
          value: paidAmount,
          currency: 'EGP',
          transactionId: String(txnId || obj.order?.id || addOnId),
          contentName: def?.name ?? row.addOnKey, contentType: 'subscription_addon',
          contentId: row.addOnKey, planId: row.addOnKey,
          planName: def?.name ?? row.addOnKey, period: row.period,
        },
        context: {
          email: row.tenant?.ownerEmail || undefined,
          externalId: row.tenantId,
        },
      }))
    } else if (isVoided) {
      // ── Transaction voided / refunded — نفس سلوك الاشتراكات ──
      if (row.status === 'pending') {
        await db.tenantAddOn.update({
          where: { id: addOnId },
          data: { status: 'failed', paymentNote: `paymob-txn:${txnId}|voided/refunded` },
        })
      } else {
        await db.tenantAddOn.update({
          where: { id: addOnId },
          data: { paymentNote: `paymob-txn:${txnId}|voided/refunded-on-active-addon` },
        })
      }
      console.log(`[paymob/webhook] Add-on ${addOnId} void/refund recorded`)
    } else {
      // ── Payment failed — mark failed ──
      if (row.status === 'pending') {
        await db.tenantAddOn.update({
          where: { id: addOnId },
          data: { status: 'failed', paymentNote: `paymob-txn:${txnId}|payment-failed` },
        })
      }
      console.log(`[paymob/webhook] Add-on ${addOnId} payment failed`)
    }
  } catch (e: any) {
    console.error('[paymob/webhook] Error processing add-on webhook:', e?.message ?? e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
