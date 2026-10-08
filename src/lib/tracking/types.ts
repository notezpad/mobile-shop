/**
 * ═══════════════════════════════════════════════════════════════════
 * Tracking Layer — Types (Provider-based, extensible)
 * ═══════════════════════════════════════════════════════════════════
 *
 * البنية:
 *   Application Event  →  trackEvent() / trackServerEvent()
 *                      →  Tracking Layer (هذا المجلد)
 *                      →  Google (GA4 + Ads) / Meta / TikTok
 *
 * التطبيق لا يرتبط مباشرة بأي منصة — كل الأحداث تمر من الطبقة المركزية
 * وتُوزَّع فقط على المنصات المفعّلة من إعدادات لوحة الأدمن.
 *
 * لإضافة منصة مستقبلاً (Snapchat / LinkedIn / Pinterest …):
 *   1. أضف config section في TrackingConfig (types.ts)
 *   2. أضف provider function في client.ts (browser) و/أو server.ts (server)
 *   3. أضف مفتاح تفعيل في شاشة الإعدادات — بدون لمس Business Logic.
 */

// ─── أسماء الأحداث الموحدة (Standard Events أولاً) ───────────────────
export const TRACKING_EVENTS = {
  PageView: 'PageView',
  ViewContent: 'ViewContent',
  CompleteRegistration: 'CompleteRegistration',
  StartTrial: 'StartTrial',
  InitiateCheckout: 'InitiateCheckout',
  Purchase: 'Purchase',
} as const

export type TrackableEventName =
  (typeof TRACKING_EVENTS)[keyof typeof TRACKING_EVENTS]

export type TrackingSource = 'server' | 'browser'

export type TrackingProviderName = 'meta' | 'tiktok' | 'ga4' | 'google_ads'

// ─── معاملات الحدث الموحدة (كلها اختيارية — لا نختلق بيانات) ─────────
export interface TrackingEventParams {
  /** قيمة العملية بالعملة الفعلية (مثال: 299) */
  value?: number
  /** ISO currency (مشروع Nezam: EGP) */
  currency?: string
  /** معرف العملية الحقيقي (subscription id / paymob txn) */
  transactionId?: string
  /** معرف الباقة الحقيقي */
  contentId?: string
  /** اسم الباقة/المنتج */
  contentName?: string
  /** نوع المحتوى: subscription_plan */
  contentType?: string
  planId?: string
  planName?: string
  period?: string
  /** معرف الحدث الثابت — يُمرر يدوياً من نقاط Business Truth */
  eventId?: string
  /** بيانات إضافية آمنة (بدون PII حساس) */
  [key: string]: unknown
}

// ─── إعدادات التتبع (تُخزن JSON في PlatformSetting key=tracking_config) ──
export interface TrackingGoogleConfig {
  enabled: boolean
  /** GA4 Measurement ID — G-XXXXXXXXXX */
  ga4MeasurementId: string
  /** GA4 Measurement Protocol API Secret — للإرسال Server-side (اختياري) */
  ga4ApiSecret: string
  /** Google Ads Conversion ID — AW-XXXXXXXXX */
  adsConversionId: string
  /** تسميات التحويل لكل حدث */
  adsLabels: {
    registration: string
    trial: string
    purchase: string
  }
  /** Google Tag / GTM ID — G-XXXX أو GTM-XXXX (اختياري) */
  gtmId: string
  useGtm: boolean
  /** Enhanced Conversions — email/phone بعد التطبيع والـhashing */
  enhancedConversions: boolean
  /** Google Consent Mode v2 */
  consentMode: boolean
}

export interface TrackingMetaConfig {
  enabled: boolean
  pixelId: string
  /** Meta Dataset ID (نفس الـ Pixel ID عادة في الإعدادات الحديثة) */
  datasetId: string
  /** Conversions API Access Token — SECRET (Backend فقط، يُعرض Masked) */
  capiToken: string
}

export interface TrackingTikTokConfig {
  enabled: boolean
  pixelId: string
  /** Events API Access Token — SECRET (Backend فقط، يُعرض Masked) */
  eventsApiToken: string
  /** Test Event Code من Events Manager → Test Events — يعمل فقط عند تفعيل Test Mode */
  testEventCode: string
}

export interface TrackingGeneralConfig {
  /** المفتاح الرئيسي — OFF يعيق كل الإرسال فوراً */
  enabled: boolean
  debugMode: boolean
  testMode: boolean
  /** Consent Management — عند التفعيل تُحترم موافقات المستخدم قبل أي إرسال */
  consentManagement: boolean
}

export interface TrackingConfig {
  general: TrackingGeneralConfig
  google: TrackingGoogleConfig
  meta: TrackingMetaConfig
  tiktok: TrackingTikTokConfig
  /** إصدار البنية — لإضافات منصات مستقبلية بدون كسر القديم */
  version: number
}

export const TRACKING_CONFIG_VERSION = 1

// ─── الإعدادات الافتراضية ────────────────────────────────────────────
export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  general: {
    enabled: false,
    debugMode: false,
    testMode: false,
    consentManagement: false,
  },
  google: {
    enabled: false,
    ga4MeasurementId: '',
    ga4ApiSecret: '',
    adsConversionId: '',
    adsLabels: { registration: '', trial: '', purchase: '' },
    gtmId: '',
    useGtm: false,
    enhancedConversions: true,
    consentMode: true,
  },
  meta: {
    enabled: false,
    pixelId: '',
    datasetId: '',
    capiToken: '',
  },
  tiktok: {
    enabled: false,
    pixelId: '',
    eventsApiToken: '',
    testEventCode: '',
  },
  version: TRACKING_CONFIG_VERSION,
}

// ─── الإعدادات العامة الآمنة للمتصفح (بدون أي Secrets) ───────────────
export interface PublicTrackingConfig {
  general: TrackingGeneralConfig
  google: {
    enabled: boolean
    ga4MeasurementId: string
    adsConversionId: string
    adsLabels: TrackingGoogleConfig['adsLabels']
    gtmId: string
    useGtm: boolean
    enhancedConversions: boolean
    consentMode: boolean
  }
  meta: { enabled: boolean; pixelId: string }
  tiktok: { enabled: boolean; pixelId: string }
}

/** إزالة كل الأسرار من الإعدادات قبل إرسالها للمتصفح */
export function toPublicConfig(cfg: TrackingConfig): PublicTrackingConfig {
  return {
    general: { ...cfg.general },
    google: {
      enabled: cfg.google.enabled,
      ga4MeasurementId: cfg.google.ga4MeasurementId,
      adsConversionId: cfg.google.adsConversionId,
      adsLabels: { ...cfg.google.adsLabels },
      gtmId: cfg.google.gtmId,
      useGtm: cfg.google.useGtm,
      enhancedConversions: cfg.google.enhancedConversions,
      consentMode: cfg.google.consentMode,
    },
    meta: { enabled: cfg.meta.enabled, pixelId: cfg.meta.pixelId },
    tiktok: { enabled: cfg.tiktok.enabled, pixelId: cfg.tiktok.pixelId },
  }
}

// ─── نتيجة حدث على منصة واحدة ────────────────────────────────────────
export interface ProviderResult {
  provider: TrackingProviderName
  eventId: string
  status: 'sent' | 'failed' | 'skipped'
  error?: string
  /** سبب التخطي (منصة غير مفعّلة / موافقة مرفوضة / OFF عام) */
  reason?: string
}

/** الاستجابة الموحدة من trackServerEvent */
export interface ServerTrackResult {
  eventId: string
  results: ProviderResult[]
}
