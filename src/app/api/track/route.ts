import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getTrackingConfig } from '@/lib/tracking/config'
import { trackServerEvent, extractRequestContext } from '@/lib/tracking/server'
import { TRACKING_EVENTS, TrackingEventParams } from '@/lib/tracking/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/track
 *
 * Relay محدود: يسمح للمتصفح بإرسال أحداث مختارة لمعالجة Server-side
 * (Meta CAPI / TikTok Events API) بنفس event_id للـ Deduplication.
 *
 * 🔒 Whitelist صارمة — الأحداث المهمة (Signup / Trial / Checkout /
 * Purchase) تُرسل من الـ Backend مباشرة عند نجاح العملية الحقيقية،
 * ولا يُقبل نسخ منها من المتصفح. لا يُقبل أي eventId لنمط عمليات
 * محجوز (purchase-x / trial-x / signup-x / checkout-x).
 */
const ALLOWED = [TRACKING_EVENTS.ViewContent]

/** أنماط eventIds المحجوزة للعمليات الصادرة من الـ Backend */
const RESERVED_EVENT_ID = /^(purchase|trial|checkout|signup|reg)-/i

async function __POST(req: NextRequest) {
  const cfg = await getTrackingConfig()
  if (!cfg.general.enabled) {
    return NextResponse.json({ ok: false, reason: 'disabled' })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const eventName = String(body.eventName ?? '')
  const eventId = String(body.eventId ?? '')
  const params: TrackingEventParams = typeof body.params === 'object' && body.params ? body.params : {}

  if (!ALLOWED.includes(eventName as any)) {
    return NextResponse.json({ error: 'الحدث غير مسموح من المتصفح' }, { status: 400 })
  }
  if (!eventId || RESERVED_EVENT_ID.test(eventId)) {
    return NextResponse.json({ error: 'معرف الحدث غير صالح' }, { status: 400 })
  }
  // حماية: تجريد أي userData من المتصفح — السيرفر يبني بيانات matching بنفسه
  delete (params as any).userData

  // يمرر أيضاً gaClientId/gaSessionId من كوكيز GA4 + ttp من كوكي TikTok
  const reqCtx = extractRequestContext(req.headers, cfg.google.ga4MeasurementId)

  void trackServerEvent({
    eventName: eventName as any,
    eventId: `relay-${eventId}`,
    params,
    context: {
      ...reqCtx,
      pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : undefined,
    },
  })

  // Non-blocking — لا ننتظر المنصات
  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
