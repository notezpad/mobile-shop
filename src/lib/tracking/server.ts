/**
 * ═══════════════════════════════════════════════════════════════════
 * Tracking Layer — Server-side (Meta CAPI + TikTok Events API + GA4 MP)
 * ═══════════════════════════════════════════════════════════════════
 *
 * القواعد الصارمة:
 *   1) NON-BLOCKING: فشل أي منصة لا يوقف التسجيل أو الدفع أبداً
 *      (كل استدعاء داخل try/catch + waitUntil عند توفره).
 *   2) IDEMPOTENT: كل حدث له eventId ثابت — الفهرس الفريد
 *      (provider + eventId) في جدول TrackingEvent يمنع تكرار الإرسال
 *      مهما تكرر Webhook أو أُعيد فتح صفحة النجاح.
 *   3) NO SECRETS هنا: التوكنات تُقرأ من الإعدادات (سيرفر) فقط.
 *   4) NO SENSITIVE DATA: كلمات المرور/أرقام البطاقات لا تُرسل أبداً.
 *      بيانات matching تُطبَّع وتُهشَّم SHA-256 قبل الإرسال.
 *
 * TikTok Events API 2.0 (المواصفة الحالية المحدثة):
 *   POST https://business-api.tiktok.com/open_api/v1.3/event/track/
 *   - حقل الاسم الرسمي هو `event` (استبدل event_name/event_type القديمين)
 *   - event_source_id = Pixel ID (مطلوب لمصادر web)
 *   - event_time = Unix seconds
 *   - Deduplication: نفس event_id + نفس اسم الحدث بين البكسل والـ API
 *     يحسبان حدثاً واحداً — نمرر نفس eventId المستخدم في المتصفح كما هو.
 *
 * GA4 Measurement Protocol:
 *   measurement_id + api_secret + client_id/session_id حقيقيان يُقرآن
 *   من كوكيز GA4 في الطلب (GA1.x.<client_id> / GS1.1.<session_id>...)
 *   حتى ينضم حدث السيرفر لنفس المستخدم والجلسة في التقارير.
 *   Google Ads Conversions تبقى من المتصفح عبر gtag — انظر client.ts.
 */

import { db } from '@/lib/db'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  TrackingConfig,
  TrackingEventParams,
  TrackingProviderName,
  ServerTrackResult,
  ProviderResult,
  TRACKING_EVENTS,
} from './types'
import { getTrackingConfig } from './config'

// ─── Utilities ───────────────────────────────────────────────────────

/** تشغيل Non-blocking على Cloudflare (waitUntil) أو Node (fire-and-forget) */
export function runNonBlocking(fn: () => Promise<unknown>): void {
  try {
    const ctx = getCloudflareContext() as unknown as {
      ctx?: { waitUntil?: (p: Promise<unknown>) => void }
    }
    if (ctx?.ctx?.waitUntil) {
      ctx.ctx.waitUntil(fn().catch(() => {}))
      return
    }
  } catch {
    /* خارج نطاق Cloudflare — Node العادي */
  }
  void fn().catch(() => {})
}

/** تطبيع + تهشئ SHA-256 وفق مواصفات Meta/Google (lowercase/trim/digits) */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
export function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-()+.]/g, '')
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('0') && p.length === 11) p = `20${p}` // مصر: 01xx → 201xx
  return p
}
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface ServerEventContext {
  /** IP العميل — للـ matching فقط (لا يُخزن خام في السجل) */
  clientIp?: string
  userAgent?: string
  pageUrl?: string
  /** بيانات مستخدم مطبَّعة (قبل التهشئ) — من جلسة موثوقة على السيرفر */
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  /** external id — userId ثابت للربط بين الأحداث */
  externalId?: string
  /** fbclid المتاح إن وُجد (يُمرر من الواجهة عند التسجيل) */
  fbp?: string
  fbc?: string
  ttclid?: string
  /** قيمة كوكي _ttp — معرف TikTok في المتصفح (matching أقوى على Events API) */
  ttp?: string
  /** GA4 client_id الحقيقي من كوكي ‎_ga (GA1.x.<client_id>) */
  gaClientId?: string
  /** GA4 session_id الحقيقي من كوكي ‎_ga_<MID>‎ (GS1.1.<session_id>...) */
  gaSessionId?: string
}

// ─── Idempotency ─────────────────────────────────────────────────────

/**
 * يتحقق: هل أُرسل هذا الحدث لهذه المنصة سابقاً بنجاح؟
 * يستخدم الفهرس الفريد (provider + eventId) في TrackingEvent.
 */
async function alreadySent(provider: TrackingProviderName, eventId: string): Promise<boolean> {
  try {
    const row = await db.trackingEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
      select: { status: true },
    })
    return row?.status === 'sent'
  } catch {
    return false // فشل الفحص لا يوقف الإرسال — المنصات نفسها dedupe بـ event_id
  }
}

async function recordEvent(
  provider: TrackingProviderName,
  eventId: string,
  eventName: string,
  status: 'sent' | 'failed' | 'skipped',
  payload: unknown,
  error?: string,
  subscriptionId?: number
): Promise<void> {
  try {
    const safePayload = sanitizePayload(payload)
    await db.trackingEvent.upsert({
      where: { provider_eventId: { provider, eventId } },
      update: { status, error: error ?? null, payload: safePayload },
      create: {
        provider,
        eventId,
        eventName,
        source: 'server',
        status,
        error: error ?? null,
        payload: safePayload,
        subscriptionId: subscriptionId ?? null,
      },
    })
  } catch (e: any) {
    // تسجيل السجل لا يوقف العمل أبداً
    console.warn(`[tracking] recordEvent failed: ${e?.message ?? e}`)
  }
}

/** لا PII خام في السجل — فقط القيم التقنية */
function sanitizePayload(payload: unknown): string {
  try {
    const json = JSON.stringify(payload ?? {})
    return json.length > 4000 ? json.slice(0, 4000) : json
  } catch {
    return '{}'
  }
}

// ─── نقطة الدخول الموحدة للسيرفر ─────────────────────────────────────

export interface ServerTrackInput {
  eventName: TrackableName
  eventId: string
  params?: TrackingEventParams
  context?: ServerEventContext
  subscriptionId?: number
}

type TrackableName = (typeof TRACKING_EVENTS)[keyof typeof TRACKING_EVENTS]

/**
 * يرسل الحدث لكل المنصات المفعّلة (Server-side).
 * يعيد النتائج — لكن يُستدعى عادة عبر runNonBlocking من المسارات.
 */
export async function trackServerEvent(input: ServerTrackInput): Promise<ServerTrackResult> {
  const cfg: TrackingConfig = await getTrackingConfig()
  const { eventName, eventId, params = {}, context = {} } = input

  // المفتاح العام OFF → لا شيء يُرسل (لكن نُسجل skipped للمرجعية في Test Mode)
  const gate = cfg.general.enabled
  const debugLog = (...a: unknown[]) => {
    if (cfg.general.debugMode) console.log('[tracking:server]', ...a)
  }

  // تجهيز بيانات المستخدم المهشمة (للمنصات التي تدعم matching)
  const hashed: {
    em?: string[]
    ph?: string[]
    fn?: string[]
    ln?: string[]
    externalId?: string[]
    /** TikTok يشترط E.164 مع «+» قبل التهشئة (Meta بدون +) */
    ttPh?: string[]
  } = {}
  if (context.email) hashed.em = [await sha256Hex(normalizeEmail(context.email))]
  if (context.phone) {
    hashed.ph = [await sha256Hex(normalizePhone(context.phone))]
    hashed.ttPh = [await sha256Hex(`+${normalizePhone(context.phone)}`)]
  }
  if (context.firstName) hashed.fn = [await sha256Hex(context.firstName.trim().toLowerCase())]
  if (context.lastName) hashed.ln = [await sha256Hex(context.lastName.trim().toLowerCase())]
  if (context.externalId) hashed.externalId = [context.externalId]
  // TikTok يتطلب external_id مهشماً SHA-256 (يختلف عن Meta الذي يقبل الخام)
  const hashedExternalId = context.externalId ? await sha256Hex(context.externalId) : undefined

  const results: ProviderResult[] = []

  // 🔍 الأحداث المهمة بس هيتم تسجيل سبب التخطي في السجل — عشان لوحة
  // الأدمن تورّي *ليه* منصة مفعّلة ما بترسلش (توكن ناقص مثلاً) بدل
  // الصمت التام اللي كان يخلي صاحب المنصة في حيرة "ليه مفيش أحداث؟".
  // PageView/ViewContent متسجلش ليها skipped عشان ما تزحمش السجل.
  const isImportantEvent =
    eventName === TRACKING_EVENTS.CompleteRegistration ||
    eventName === TRACKING_EVENTS.StartTrial ||
    eventName === TRACKING_EVENTS.InitiateCheckout ||
    eventName === TRACKING_EVENTS.Purchase

  // ── Meta Conversions API ─────────────────────────────────────────
  if (cfg.meta.enabled && cfg.meta.pixelId) {
    if (!cfg.meta.capiToken) {
      // بكسل المتصفح يشتغل بدون توكن، لكن كل أحداث السيرفر محتاجة
      // Conversions API Token — من غيره ميتا ما تستقبلش حاجة من ريليه السيرفر.
      results.push({ provider: 'meta', eventId, status: 'skipped', reason: 'CAPI token missing — browser pixel only' })
      if (isImportantEvent) {
        await recordEvent('meta', eventId, eventName, 'skipped', {}, 'Conversions API Token ناقص — أدخله من تبويب الإعدادات (Events Manager ← إعدادات البكسل ← Conversions API ← Generate access token)', input.subscriptionId)
      }
    } else if (await alreadySent('meta', eventId)) {
      results.push({ provider: 'meta', eventId, status: 'skipped', reason: 'duplicate' })
    } else if (!gate) {
      results.push({ provider: 'meta', eventId, status: 'skipped', reason: 'tracking disabled' })
      await recordEvent('meta', eventId, eventName, 'skipped', metaPayload(eventName, params, {}), 'tracking disabled', input.subscriptionId)
    } else {
      const res = await sendMetaCapi(cfg, eventName, eventId, params, context, hashed, debugLog)
      results.push(res)
      await recordEvent('meta', eventId, eventName, res.status, metaPayload(eventName, params, hashed), res.error, input.subscriptionId)
    }
  }

  // ── TikTok Events API ────────────────────────────────────────────
  if (cfg.tiktok.enabled && cfg.tiktok.pixelId) {
    if (!cfg.tiktok.eventsApiToken) {
      results.push({ provider: 'tiktok', eventId, status: 'skipped', reason: 'Events API token missing — browser pixel only' })
      if (isImportantEvent) {
        await recordEvent('tiktok', eventId, eventName, 'skipped', {}, 'Events API Token ناقص — أدخله من تبويب الإعدادات (TikTok Events Manager ← إعدادات البكسل ← Events API Tokens)', input.subscriptionId)
      }
    } else if (await alreadySent('tiktok', eventId)) {
      results.push({ provider: 'tiktok', eventId, status: 'skipped', reason: 'duplicate' })
    } else if (!gate) {
      results.push({ provider: 'tiktok', eventId, status: 'skipped', reason: 'tracking disabled' })
      await recordEvent('tiktok', eventId, eventName, 'skipped', {}, 'tracking disabled', input.subscriptionId)
    } else {
      const res = await sendTikTokEventsApi(cfg, eventName, eventId, params, context, hashed, hashedExternalId, debugLog)
      results.push(res)
      await recordEvent('tiktok', eventId, eventName, res.status, {}, res.error, input.subscriptionId)
    }
  }

  // ── GA4 Measurement Protocol (Server) ────────────────────────────
  if (cfg.google.enabled && cfg.google.ga4MeasurementId) {
    if (!cfg.google.ga4ApiSecret) {
      results.push({ provider: 'ga4', eventId, status: 'skipped', reason: 'GA4 API secret missing — browser gtag only' })
      if (isImportantEvent) {
        await recordEvent('ga4', eventId, eventName, 'skipped', {}, 'GA4 API Secret ناقص — أدخله من تبويب الإعدادات (Analytics ← Admin ← Data Streams ← Measurement Protocol API secrets)', input.subscriptionId)
      }
    } else if (
      // GA4 لا يعمل Dedupe بين gtag (المتصفح) و Measurement Protocol إلا لـ purchase
      // عبر transaction_id — وكل أحداثنا تُرسل من المتصفح أيضاً، فإرسالها من
      // السيرفر يضاعف التقارير. نكتفي بـ Purchase وبهوية متصفح حقيقية (client_id).
      !(eventName === TRACKING_EVENTS.Purchase && context.gaClientId)
    ) {
      results.push({ provider: 'ga4', eventId, status: 'skipped', reason: 'counted by browser gtag (GA4 has no MP/gtag dedupe)' })
    } else if (await alreadySent('ga4', eventId)) {
      results.push({ provider: 'ga4', eventId, status: 'skipped', reason: 'duplicate' })
    } else if (!gate) {
      results.push({ provider: 'ga4', eventId, status: 'skipped', reason: 'tracking disabled' })
      await recordEvent('ga4', eventId, eventName, 'skipped', {}, 'tracking disabled', input.subscriptionId)
    } else {
      const res = await sendGa4MeasurementProtocol(cfg, eventName, eventId, params, context, debugLog)
      results.push(res)
      await recordEvent('ga4', eventId, eventName, res.status, { ga4Event: ga4EventName(eventName) }, res.error, input.subscriptionId)
    }
  }

  // ملاحظة: Google Ads conversions تُرسل من المتصفح (gtag) — الطريقة
  // الموثقة للويب، مع Enhanced Conversions من client.ts.

  return { eventId, results }
}

// ─── Meta Conversions API ────────────────────────────────────────────

function metaEventName(name: string): string {
  // نفس أسماء الأحداث الموحدة هي معيار Meta مباشرة
  return name
}

function metaPayload(eventName: string, params: TrackingEventParams, hashed: unknown) {
  return {
    event: metaEventName(eventName),
    value: params.value,
    currency: params.currency,
    content_name: params.contentName,
    content_type: params.contentType,
    content_id: params.contentId,
    hashed: hashed ? 'attached' : 'none',
  }
}

async function sendMetaCapi(
  cfg: TrackingConfig,
  eventName: string,
  eventId: string,
  params: TrackingEventParams,
  context: ServerEventContext,
  hashed: Record<string, string[] | undefined>,
  debugLog: (...a: unknown[]) => void
): Promise<ProviderResult> {
  try {
    const datasetId = cfg.meta.datasetId || cfg.meta.pixelId
    const payload = {
      data: [
        {
          event_name: metaEventName(eventName),
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          // Meta تشترط client_user_agent لأحداث website. أحداث الـ Webhook
          // (الدفع) لا تملك سياق متصفح → تُرسل system_generated بدل أن تُرفض.
          action_source: context.userAgent ? 'website' : 'system_generated',
          ...(context.userAgent && context.pageUrl ? { event_source_url: context.pageUrl } : {}),
          user_data: {
            ...(hashed.em ? { em: hashed.em } : {}),
            ...(hashed.ph ? { ph: hashed.ph } : {}),
            ...(hashed.fn ? { fn: hashed.fn } : {}),
            ...(hashed.ln ? { ln: hashed.ln } : {}),
            ...(hashed.externalId ? { external_id: hashed.externalId } : {}),
            ...(context.clientIp ? { client_ip_address: context.clientIp } : {}),
            ...(context.userAgent ? { client_user_agent: context.userAgent } : {}),
            ...(context.fbp ? { fbp: context.fbp } : {}),
            ...(context.fbc ? { fbc: context.fbc } : {}),
          },
          custom_data: {
            ...(params.value != null ? { value: params.value } : {}),
            ...(params.currency ? { currency: params.currency } : {}),
            ...(params.contentName ? { content_name: params.contentName } : {}),
            ...(params.contentType ? { content_type: params.contentType } : {}),
            ...(params.contentId ? { content_id: params.contentId } : {}),
            ...(params.planId ? { plan_id: params.planId } : {}),
            ...(params.planName ? { plan_name: params.planName } : {}),
            ...(params.period ? { period: params.period } : {}),
            ...(params.transactionId ? { order_id: params.transactionId } : {}),
          },
        },
      ],
      // كود الاختبار من Meta Events Manager → Test Events (وضع الاختبار فقط).
      // بدون كود صالح في وضع الاختبار تُرسل الأحداث لبيانات الإنتاج —
      // لذا نمرره فقط عند تفعيل Test Mode وتوفر الكود (نفس نمط TikTok).
      ...(cfg.general.testMode && cfg.meta.testEventCode
        ? { test_event_code: cfg.meta.testEventCode }
        : {}),
    }
    debugLog('meta capi →', eventName, eventId)
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/v21.0/${datasetId}/events?access_token=${encodeURIComponent(cfg.meta.capiToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      8000
    )
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok || body?.error) {
      return { provider: 'meta', eventId, status: 'failed', error: body?.error?.message ?? `HTTP ${res.status}` }
    }
    return { provider: 'meta', eventId, status: 'sent' }
  } catch (e: any) {
    return { provider: 'meta', eventId, status: 'failed', error: e?.message ?? 'meta capi error' }
  }
}

// ─── TikTok Events API 2.0 ──────────────────────────────────────────
// المواصفة الحالية (الرابط الرسمي v1.3 كما هو):
//   POST https://business-api.tiktok.com/open_api/v1.3/event/track/
//   body: { event_source: 'web', event_source_id: <Pixel ID>,
//           data: [{ event, event_time (Unix seconds), event_id, user,
//                    properties }], test_event_code? }
//   الاستجابة الناجحة: code === 0
// أهم تغييرات 2.0 مقارنة بـ 1.x: حقل الاسم أصبح `event`، وإضافة
// event_source_id الإلزامية، وcontents كمصفوفة قياسية، وevent_source_url
// داخل properties. توكن 1.x يعمل كما هو — لا حاجة لتجديده.
// ⚠️ Deduplication محفوظ كما هو: نفس eventId بين البكسل
//   (ttq.track(..., { event_id })) والسيرفر = حدث واحد لكل منصة.

function tikTokEventName(name: string): string {
  switch (name) {
    case TRACKING_EVENTS.PageView: return 'Pageview'
    case TRACKING_EVENTS.ViewContent: return 'ViewContent'
    case TRACKING_EVENTS.CompleteRegistration: return 'CompleteRegistration'
    case TRACKING_EVENTS.StartTrial: return 'StartTrial'
    case TRACKING_EVENTS.InitiateCheckout: return 'InitiateCheckout'
    case TRACKING_EVENTS.Purchase: return 'CompletePayment'
    default: return name
  }
}

/** يبني عنصر الحدث وفق مواصفة Events API 2.0 — دالة نقية لقابلية الاختبار */
export function buildTikTokEvent(
  eventName: string,
  eventId: string,
  params: TrackingEventParams,
  context: ServerEventContext,
  hashed: Record<string, string[] | undefined>,
  hashedExternalId?: string
): Record<string, unknown> {
  const contentId = params.contentId ?? params.planId
  const contentName = params.contentName ?? params.planName
  const contentType = params.contentType ?? (contentId || contentName ? 'subscription_plan' : undefined)
  const hasContent = !!(contentId || contentName)

  return {
    // مواصفة 2.0: حقل الاسم هو `event` (وليس event_name/event_type)
    event: tikTokEventName(eventName),
    // event_time بالثواني (Unix seconds) وفق المواصفة الحالية
    event_time: Math.floor(Date.now() / 1000),
    // نفس eventId المستخدم في بكسل المتصفح — أساس الـ Deduplication
    event_id: eventId,
    user: {
      ...(hashed.em ? { email: hashed.em[0] } : {}),
      ...((hashed.ttPh ?? hashed.ph) ? { phone: (hashed.ttPh ?? hashed.ph)![0] } : {}),
      // external_id في TikTok يجب أن يكون SHA-256
      ...(hashedExternalId ? { external_id: hashedExternalId } : {}),
      ...(context.clientIp ? { ip: context.clientIp } : {}),
      ...(context.userAgent ? { user_agent: context.userAgent } : {}),
      ...(context.ttclid ? { ttclid: context.ttclid } : {}),
      // قيمة كوكي ‎_ttp من المتصفح — أقوى مفاتيح المطابقة بعد ttclid
      ...(context.ttp ? { ttp: context.ttp } : {}),
    },
    properties: {
      ...(params.value != null ? { value: params.value } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(contentType ? { content_type: contentType } : {}),
      ...(hasContent
        ? {
            contents: [
              {
                ...(contentId ? { content_id: String(contentId) } : {}),
                ...(contentName ? { content_name: String(contentName) } : {}),
                ...(contentType ? { content_type: contentType } : {}),
                quantity: 1,
                ...(params.value != null ? { price: params.value } : {}),
              },
            ],
          }
        : {}),
      ...(params.transactionId ? { order_id: params.transactionId } : {}),
      ...(context.pageUrl ? { event_source_url: context.pageUrl } : {}),
    },
    ...(context.pageUrl ? { page: { url: context.pageUrl } } : {}),
    limited_data_use: false,
  }
}

async function sendTikTokEventsApi(
  cfg: TrackingConfig,
  eventName: string,
  eventId: string,
  params: TrackingEventParams,
  context: ServerEventContext,
  hashed: Record<string, string[] | undefined>,
  hashedExternalId: string | undefined,
  debugLog: (...a: unknown[]) => void
): Promise<ProviderResult> {
  try {
    const event = buildTikTokEvent(eventName, eventId, params, context, hashed, hashedExternalId)
    const payload = {
      event_source: 'web',
      // مطلوب في مواصفة 2.0 لمصادر web — وهو نفسه Pixel ID
      event_source_id: cfg.tiktok.pixelId,
      data: [event],
      // كود الاختبار من TikTok Events Manager → Test Events (وضع الاختبار فقط)
      ...(cfg.general.testMode && cfg.tiktok.testEventCode
        ? { test_event_code: cfg.tiktok.testEventCode }
        : {}),
    }
    debugLog('tiktok events api 2.0 →', eventName, eventId)
    const res = await fetchWithTimeout('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': cfg.tiktok.eventsApiToken,
      },
      body: JSON.stringify(payload),
    }, 8000)
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok || body?.code !== 0) {
      return { provider: 'tiktok', eventId, status: 'failed', error: body?.message ?? `HTTP ${res.status}` }
    }
    return { provider: 'tiktok', eventId, status: 'sent' }
  } catch (e: any) {
    return { provider: 'tiktok', eventId, status: 'failed', error: e?.message ?? 'tiktok events api error' }
  }
}


// ─── GA4 Measurement Protocol ────────────────────────────────────────

function ga4EventName(name: string): string {
  switch (name) {
    case TRACKING_EVENTS.PageView: return 'page_view'
    case TRACKING_EVENTS.ViewContent: return 'view_item'
    case TRACKING_EVENTS.CompleteRegistration: return 'sign_up'
    case TRACKING_EVENTS.StartTrial: return 'trial_started'
    case TRACKING_EVENTS.InitiateCheckout: return 'begin_checkout'
    case TRACKING_EVENTS.Purchase: return 'purchase'
    default: return name.toLowerCase()
  }
}

async function sendGa4MeasurementProtocol(
  cfg: TrackingConfig,
  eventName: string,
  eventId: string,
  params: TrackingEventParams,
  context: ServerEventContext,
  debugLog: (...a: unknown[]) => void
): Promise<ProviderResult> {
  try {
    // ── client_id الصحيح (أهم قاعدة في MP للويب) ──
    // 1) client_id الحقيقي من كوكي ‎_ga في طلب المتصفح — به ينضم حدث
    //    السيرفر لنفس المستخدم والجلسة في GA4.
    //    (الكوكي لا يُكتب أصلاً إذا رفض المستخدم analytics_storage،
    //     فوجوده دليل كافٍ على الموافقة).
    // 2) أحداث Backend فقط بدون سياق متصفح (Webhook): معرف ثابت مشتق
    //    من externalId حتى يبقى لنفس المستخدم نفس client_id.
    // 3) لا شيء متاح: UUID عشوائي (توصية Google للأحداث بدون متصفح).
    let clientId = context.gaClientId
    if (!clientId && context.externalId) {
      const h = await sha256Hex(context.externalId)
      clientId = `server.${h.slice(0, 32)}`
    }
    if (!clientId) {
      clientId = typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `server.${eventId}`
    }

    const mpParams: Record<string, unknown> = {
      ...(params.value != null ? { value: params.value } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(params.transactionId ? { transaction_id: params.transactionId } : {}),
      ...(params.planName ? { plan_name: params.planName } : {}),
      ...(params.period ? { period: params.period } : {}),
      // session_id باراميتر إلزامي على مستوى الحدث لربط الحدث بالجلسة
      // الحقيقية — لا نختلق قيمة من eventId إطلاقاً.
      ...(context.gaSessionId ? { session_id: context.gaSessionId } : {}),
      engagement_time_msec: '100',
    }

    // عناصر التجارة الإلكترونية القياسية (view_item / begin_checkout / purchase)
    const commerceEvents = ['view_item', 'begin_checkout', 'purchase']
    const itemId = params.contentId ?? params.planId
    const itemName = params.contentName ?? params.planName
    if (commerceEvents.includes(ga4EventName(eventName)) && (itemId || itemName)) {
      mpParams.items = [
        {
          ...(itemId ? { item_id: String(itemId) } : {}),
          ...(itemName ? { item_name: String(itemName) } : {}),
          ...(params.contentType ? { item_category: params.contentType } : {}),
          ...(params.value != null ? { price: params.value } : {}),
          quantity: 1,
        },
      ]
    }

    const mpEvent: Record<string, unknown> = {
      name: ga4EventName(eventName),
      params: mpParams,
    }
    const payload = {
      client_id: clientId,
      ...(context.externalId ? { user_id: context.externalId } : {}),
      // timestamp_micros يوثق وقت الحدث الفعلي (موصى به للأحداث من السيرفر)
      timestamp_micros: Date.now() * 1000,
      events: [mpEvent],
    }
    debugLog('ga4 mp →', eventName, eventId, 'client:', clientId)
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(cfg.google.ga4MeasurementId)}&api_secret=${encodeURIComponent(cfg.google.ga4ApiSecret)}`
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 8000)
    if (!res.ok) {
      return { provider: 'ga4', eventId, status: 'failed', error: `HTTP ${res.status}` }
    }
    return { provider: 'ga4', eventId, status: 'sent' }
  } catch (e: any) {
    return { provider: 'ga4', eventId, status: 'failed', error: e?.message ?? 'ga4 mp error' }
  }
}

// ─── fetch مع timeout حتى لا يعلق أي طلب ────────────────────────────
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─── سياق الطلب (IP / UA / كوكيز GA4 وTikTok) ────────────────────────

function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    let v = part.slice(idx + 1).trim()
    try { v = decodeURIComponent(v) } catch { /* قيمة خام */ }
    if (k) out[k] = v
  }
  return out
}

/**
 * client_id من كوكي ‎_ga: الصيغة GA1.1.<client_id> (أو GA1.2.)
 * session_id من كوكي ‎_ga_<MID>: الصيغة GS1.1.<session_id>.<n>.<t>...
 *   — يُفضّل الكوكي المطابق لـ Measurement ID الحالي إن عُرف.
 * ttp من كوكي ‎_ttp (معرف TikTok في المتصفح).
 * ملاحظة: كوكيز GA4 لا تُكتب أصلاً إذا رُفضت موافقة analytics_storage —
 * فوجودها يعني أن المستخدم موافق، ونستخدمها بأمان.
 */
function extractGaCookies(cookies: Record<string, string>, gaMeasurementId?: string): {
  gaClientId?: string
  gaSessionId?: string
} {
  let gaClientId: string | undefined
  let gaSessionId: string | undefined

  const rawGa = cookies['_ga']
  if (rawGa) {
    const m = /^GA1\.[12]\.(.+)$/i.exec(rawGa)
    if (m) gaClientId = m[1]
  }

  const preferredSuffix = gaMeasurementId?.replace(/^G-/i, '').toUpperCase()
  let fallbackSession: string | undefined
  for (const [name, value] of Object.entries(cookies)) {
    if (!name.startsWith('_ga_') || name === '_ga') continue
    const m = /^GS1\.[12]\.(\d+)\./.exec(value)
    if (!m) continue
    if (preferredSuffix && name.toUpperCase() === `_GA_${preferredSuffix}`) {
      gaSessionId = m[1]
      break
    }
    fallbackSession ??= m[1]
  }
  if (!gaSessionId) gaSessionId = fallbackSession

  return { gaClientId, gaSessionId }
}

export function extractRequestContext(
  req: Headers,
  gaMeasurementId?: string
): {
  clientIp?: string
  userAgent?: string
  gaClientId?: string
  gaSessionId?: string
  ttp?: string
  fbp?: string
  fbc?: string
} {
  const ip =
    req.get('cf-connecting-ip') ||
    req.get('x-real-ip') ||
    req.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  const userAgent = req.get('user-agent') || undefined
  const cookies = parseCookies(req.get('cookie'))
  const ga = extractGaCookies(cookies, gaMeasurementId)
  const ttp = cookies['_ttp'] || undefined
  // كوكيز Meta: _fbp (معرف المتصفح) و _fbc (من fbclid) — أهم مفاتيح مطابقة CAPI
  const fbp = cookies['_fbp'] || undefined
  const fbc = cookies['_fbc'] || undefined
  return { clientIp: ip, userAgent, ...ga, ttp, fbp, fbc }
}

