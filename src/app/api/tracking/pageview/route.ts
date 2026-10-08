import { withDb, db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getTrackingConfig } from '@/lib/tracking/config'
import { INTERNAL_PROVIDER } from '@/lib/tracking/analytics'

export const dynamic = 'force-dynamic'

/**
 * POST /api/tracking/pageview
 *
 * 🧭 تسجيل جلسة زيارة (Visitors) للقمع التحليلي فقط — إضافي بالكامل:
 *   - لا يُرسل أي شيء لـ Meta / TikTok / Google (لا يمس نظام التتبع الحالي).
 *   - صف واحد لكل جلسة (upsert على provider='internal' + eventId='pv-<sessionId>').
 *   - fire-and-forget من المتصفح — فشله لا يؤثر على أي شيء.
 *   - payload تقني فقط: pageUrl (بدون أي PII).
 */
async function __POST(req: NextRequest) {
  const cfg = await getTrackingConfig()
  if (!cfg.general.enabled) {
    return NextResponse.json({ ok: false, reason: 'disabled' })
  }

  const body = await req.json().catch(() => null)
  const eventId = String(body?.eventId ?? '')
  // eventId جلسة فقط: pv-<uuid/session>
  if (!/^pv-[a-zA-Z0-9_-]{6,64}$/.test(eventId)) {
    return NextResponse.json({ error: 'معرف جلسة غير صالح' }, { status: 400 })
  }

  const pageUrl = typeof body?.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : ''
  const referrer = typeof body?.referrer === 'string' ? body.referrer.slice(0, 500) : ''

  await db.trackingEvent.upsert({
    where: { provider_eventId: { provider: INTERNAL_PROVIDER, eventId } },
    update: {}, // جلسة واحدة = صف واحد — Idempotent عبر كل تنقلات SPA
    create: {
      eventId,
      eventName: 'PageView',
      provider: INTERNAL_PROVIDER,
      source: 'browser',
      status: 'sent',
      payload: JSON.stringify({ pageUrl, referrer }),
    },
  }).catch(() => null) // غياب الجداول أو أي خطأ — لا يُحدث أثراً

  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
