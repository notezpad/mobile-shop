import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tracking/purchase-info?subscriptionId=X
 *
 * تعطي المتصفح بيانات حدث Purchase الآمنة (بدون أسرار) بعد تأكيد
 * الدفع فعلياً من Paymob — ل firing بكسل المتصفح بنفس eventId
 * الذي أرسله السيرفر (Webhook) → Deduplication مثالي.
 *
 * شروط الإرجاع الصارمة:
 *   - المستخدم مالك الاشتراك (أو Super Admin)
 *   - حالة الاشتراك = active (دفع ناجح مؤكد)
 *   - لا تُعاد بيانات أي عملية فاشلة أو قيد المعالجة
 *
 * eventId ثابت = purchase-sub-<id> → نفسه في السيرفر.
 * Refresh / إعادة فتح صفحة النجاح → نفس eventId → المنصات تعمل dedupe.
 */
async function __GET(req: NextRequest) {
  let session
  try {
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const subscriptionId = Number(url.searchParams.get('subscriptionId'))
  if (!subscriptionId || Number.isNaN(subscriptionId)) {
    return NextResponse.json({ error: 'subscriptionId مطلوب' }, { status: 400 })
  }

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  })

  if (!sub) {
    return NextResponse.json({ error: 'الاشتراك غير موجود' }, { status: 404 })
  }

  // 🔒 ملكية صارمة
  if (session.role !== 'SUPER_ADMIN' && session.tenantId !== sub.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 🔒 الدفع الناجح المؤكد فقط — لا Purchase لأي حالة أخرى
  if (sub.status !== 'active') {
    return NextResponse.json({ error: 'الدفع غير مؤكد لهذه العملية' }, { status: 409 })
  }

  // استخراج معرف عملية Paymob الحقيقي من paymentNote (paymob-txn:ID)
  const txnMatch = sub.paymentNote?.match(/paymob-txn:(\d+)/)

  return NextResponse.json({
    ok: true,
    eventId: `purchase-sub-${sub.id}`,
    value: sub.amountPaid,
    currency: 'EGP',
    transactionId: txnMatch?.[1] ?? String(sub.id),
    planId: String(sub.planId),
    planName: sub.plan?.name ?? undefined,
    period: sub.period,
    subscriptionId: sub.id,
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
