import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import {
  getTrackingConfig,
  saveTrackingConfig,
  maskSecret,
  getProviderStatuses,
} from '@/lib/tracking/config'
import { sanitizeId } from '@/lib/tracking/sanitize'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tracking
 *
 * إعدادات التتبع + حالة المنصات + آخر 50 حدثاً (شاشة Marketing & Tracking).
 * 🔒 الأسرار لا تُعاد أبداً — فقط "مضبوط/غير مضبوط" + Masked tail.
 */
async function __GET() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const cfg = await getTrackingConfig()
  const statuses = getProviderStatuses(cfg)

  // آخر الأحداث + الإحصائيات — 🛡️ محمية بالكامل:
  // إذا لم تُنشأ جداول التتبع بعد (قبل تشغيل الترحيل) نُرجع قيماً فارغة
  // مع tablesReady=false بدلاً من 500 — والإعدادات تعمل بشكل طبيعي.
  let events: Array<Record<string, unknown>> = []
  let sentCount = 0
  let failedCount = 0
  let lastEvent: Record<string, unknown> | null = null
  let tablesReady = true
  try {
    // آخر الأحداث — بدون أي بيانات حساسة (payload تقني فقط)
    const select = {
      id: true,
      eventId: true,
      eventName: true,
      provider: true,
      source: true,
      status: true,
      error: true,
      subscriptionId: true,
      createdAt: true,
    } as const

    // أحداث المنصات (Meta/TikTok/Google) منفصلة عن زيارات PageView الداخلية
    // حتى لا تدفن الزيارات أحداث الإعلانات خارج آخر 50 صف.
    const [platformEvents, visitEvents] = await Promise.all([
      db.trackingEvent.findMany({
        where: { provider: { not: 'internal' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select,
      }),
      db.trackingEvent.findMany({
        where: { provider: 'internal' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select,
      }),
    ])

    events = [...platformEvents, ...visitEvents].sort(
      (a, b) => +new Date(b.createdAt as any) - +new Date(a.createdAt as any)
    )

    // إحصائيات سريعة
    const [sent, failed] = await Promise.all([
      db.trackingEvent.count({ where: { status: 'sent' } }),
      db.trackingEvent.count({ where: { status: 'failed' } }),
    ])
    sentCount = sent
    failedCount = failed

    lastEvent = await db.trackingEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { eventName: true, status: true, error: true, createdAt: true, provider: true },
    })
  } catch {
    tablesReady = false
  }

  return NextResponse.json({
    config: {
      general: cfg.general,
      google: {
        ...cfg.google,
        // الأسرار لا تُعاد — فقط حالة الضبط + شكل Masked للعرض
        ga4ApiSecret: '',
        ga4ApiSecretSet: !!cfg.google.ga4ApiSecret,
        ga4ApiSecretMasked: maskSecret(cfg.google.ga4ApiSecret),
      },
      meta: {
        ...cfg.meta,
        capiToken: '',
        capiTokenSet: !!cfg.meta.capiToken,
        capiTokenMasked: maskSecret(cfg.meta.capiToken),
      },
      tiktok: {
        ...cfg.tiktok,
        eventsApiToken: '',
        eventsApiTokenSet: !!cfg.tiktok.eventsApiToken,
        eventsApiTokenMasked: maskSecret(cfg.tiktok.eventsApiToken),
      },
    },
    statuses,
    events,
    stats: { sentCount, failedCount, lastEvent },
    tablesReady,
  })
}

/**
 * PUT /api/admin/tracking
 *
 * حفظ الإعدادات. القواعد:
 *   - حقول الأسرار: قيمة فارغة = بدون تغيير، '__CLEAR__' = إزالة.
 *   - لا يُعاد أي سر في الاستجابة.
 */
async function __PUT(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  // 🧼 تنظيف معرفات المنصات قبل التحقق والحفظ — محارف خفية تتسرب عند
  // النسخ من صفحات Google/Meta داخل بيئة RTL (RLM/LRM/ZWNJ…) أو شرطات
  // شبيهة (– — −) كانت تُفسد التحقق وتُحفظ فتكسر التتبع بصمت.
  const sanitizePatch = (obj: Record<string, unknown> | undefined, keys: string[]) => {
    if (!obj || typeof obj !== 'object') return
    for (const k of keys) {
      if (typeof obj[k] === 'string') obj[k] = sanitizeId(obj[k] as string)
    }
  }
  sanitizePatch(body.google, ['ga4MeasurementId', 'adsConversionId', 'gtmId', 'registration', 'trial', 'purchase'])
  sanitizePatch(body.meta, ['pixelId', 'datasetId', 'testEventCode'])
  sanitizePatch(body.tiktok, ['pixelId', 'testEventCode'])

  // تحقق صيغة أساسية قبل الحفظ (تحذيرات غير معيقة) — يعمل على قيم نظيفة
  const warnings: string[] = []
  const g = body.google ?? {}
  if (typeof g.ga4MeasurementId === 'string' && g.ga4MeasurementId) {
    if (g.ga4MeasurementId.includes('@')) {
      warnings.push('يبدو أنك وضعت بريداً إلكترونياً في خانة GA4 Measurement ID — ضع المعرف الذي يبدأ بـ G- من Analytics ← Data Streams (مثال: G-XXXXXXXXXX)')
    } else if (!/^G-[A-Z0-9]+$/i.test(g.ga4MeasurementId.trim())) {
      warnings.push('GA4 Measurement ID يجب أن يبدأ بـ G- (مثال: G-XXXXXXXXXX)')
    }
  }
  if (typeof g.adsConversionId === 'string' && g.adsConversionId && !/^AW-\d+$/i.test(g.adsConversionId.trim())) {
    warnings.push('Google Ads Conversion ID يجب أن يبدأ بـ AW- (مثال: AW-123456789)')
  }
  if (typeof g.gtmId === 'string' && g.gtmId && !/^(GTM|G)-[A-Z0-9]+$/i.test(g.gtmId.trim())) {
    warnings.push('Google Tag ID يجب أن يبدأ بـ GTM- أو G-')
  }
  const m = body.meta ?? {}
  if (typeof m.pixelId === 'string' && m.pixelId && !/^\d{6,20}$/.test(m.pixelId.trim())) {
    warnings.push('Meta Pixel ID يجب أن يكون رقماً (مثال: 123456789012345)')
  }

  const saved = await saveTrackingConfig(body)
  await logAudit({ action: 'settings.tracking_update', targetType: 'settings', targetId: 'tracking_config', details: { sections: Object.keys(body) } }, req)
  return NextResponse.json({ ok: true, warnings, statuses: getProviderStatuses(saved) })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
