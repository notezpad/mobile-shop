/**
 * ═══════════════════════════════════════════════════════════════════
 * Tracking Layer — Browser (Client-side)
 * ═══════════════════════════════════════════════════════════════════
 *
 * نقطة واحدة لكل الأحداث في المتصفح:
 *   import { trackEvent } from '@/lib/tracking/client'
 *   trackEvent('Purchase', { value: 299, currency: 'EGP', eventId })
 *
 * القواعد:
 *   - لا Secrets هنا إطلاقاً — الإعدادات العامة (PublicTrackingConfig)
 *     تُحقن من السيرفر بدون أي Access Tokens.
 *   - Scripts تُحمَّل Lazy وبعد التفاعل (afterInteractive) فقط
 *     للمنصات المفعّلة — لا تحميل مكرر أبداً (singletons).
 *   - PageView بدون تكرار (SPA / StrictMode / hydration safe).
 *   - نفس eventId يُستخدم من المتصفح والسيرفر لنفس العملية →
 *     المنصات تعمل Deduplication تلقائياً (event_id).
 *   - Consent Mode v2: عند تفعيل إدارة الموافقة، الإعلانات والتحليلات
 *     تبقى Denied حتى يوافق المستخدم عبر واجهة الموافقة.
 */

import {
  PublicTrackingConfig,
  TrackingEventParams,
  TRACKING_EVENTS,
} from './types'

// ─── Globals ─────────────────────────────────────────────────────────
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; push?: (...a: unknown[]) => void; loaded?: boolean; version?: string }
    ttq?: any
    TiktokAnalyticsObject?: string
    NezamTracking?: {
      config: PublicTrackingConfig
      track: typeof trackEvent
      setConsent: typeof setConsent
      getConsent: typeof getConsent
      version: string
    }
  }
}

const CONSENT_STORAGE_KEY = 'nezam_consent_v1'
const FIRST_TOUCH_KEY = 'nezam_first_touch'
const LAST_TOUCH_KEY = 'nezam_session_touch'
const CLIENT_SENT_KEY = 'nezam_events_sent' // sessionStorage dedupe للعمليات المهمة

let initialized = false
let config: PublicTrackingConfig | null = null
let lastPageViewPath: string | null = null
let lastPageViewAt = 0
const loadedScripts = new Set<string>()

// ─── Consent (Google Consent Mode v2 + طبقة موافقة قابلة للتوسع) ──────

export interface ConsentState {
  analytics: boolean
  marketing: boolean
  updatedAt: number
}

const DEFAULT_CONSENT: ConsentState = { analytics: false, marketing: false, updatedAt: 0 }

function readConsentStorage(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.analytics !== 'boolean' || typeof parsed?.marketing !== 'boolean') return null
    return parsed as ConsentState
  } catch {
    return null
  }
}

export function getConsent(): ConsentState {
  return readConsentStorage() ?? { ...DEFAULT_CONSENT }
}

/** هل اتخذ المستخدم قرار موافقة فعلياً من قبل؟ (لتحديد إظهار الـ Banner) */
export function hasStoredConsent(): boolean {
  return readConsentStorage() !== null
}

/**
 * واجهة الموافقة العامة — تُستدعى من ConsentBanner ولوحة التفضيلات:
 *   window.NezamTracking.setConsent({ analytics: true, marketing: true })
 * تُحدّث Google Consent Mode فوراً، تُخزن القرار، وتُحمّل بكسلات
 * الإعلانات المؤجلة (Meta / TikTok) عند منح موافقة التسويق.
 */
export function setConsent(state: { analytics: boolean; marketing: boolean }): void {
  const next: ConsentState = { ...state, updatedAt: Date.now() }
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next))
  } catch { /* private mode */ }

  // Google Consent Mode update
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: state.analytics ? 'granted' : 'denied',
      ad_storage: state.marketing ? 'granted' : 'denied',
      ad_user_data: state.marketing ? 'granted' : 'denied',
      ad_personalization: state.marketing ? 'granted' : 'denied',
    })
  }

  // تحميل بكسلات الإعلانات المؤجلة عند منح موافقة التسويق
  // (Meta / TikTok لا يدعمان Consent Mode — لا يُحمّلان إلا بعد الموافقة)
  if (state.marketing) loadDeferredPixels()

  // بث حدث مخصص للاستماع من ConsentBanner وأي واجهة أخرى
  window.dispatchEvent(new CustomEvent('nezam:consent', { detail: next }))
}

function consentDefaultsScript(cfg: PublicTrackingConfig): string {
  // يُحقن قبل تحميل أي منصة — يطبق Google Consent Mode v2 default
  // ويستعيد الموافقة المحفوظة سابقاً (إن وُجدت).
  return `
(function(){
  try {
    var saved = JSON.parse(localStorage.getItem('${CONSENT_STORAGE_KEY}') || 'null');
    var a = (saved && typeof saved.analytics === 'boolean') ? saved.analytics : false;
    var m = (saved && typeof saved.marketing === 'boolean') ? saved.marketing : false;
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = window.gtag || gtag;
    gtag('consent', 'default', {
      'analytics_storage': a ? 'granted' : 'denied',
      'ad_storage': m ? 'granted' : 'denied',
      'ad_user_data': m ? 'granted' : 'denied',
      'ad_personalization': m ? 'granted' : 'denied',
      'wait_for_update': 500
    });
  } catch(e){}
})();`
}

// ─── Script Loaders (Lazy + Singleton) ───────────────────────────────

function loadScriptOnce(id: string, src: string, inline?: string): void {
  if (loadedScripts.has(id)) return
  loadedScripts.add(id)
  if (inline) {
    const s = document.createElement('script')
    s.id = `nezam-track-${id}`
    s.textContent = inline
    document.head.appendChild(s)
  }
  if (src) {
    const s2 = document.createElement('script')
    s2.id = `nezam-track-${id}-src`
    s2.async = true
    s2.src = src
    document.head.appendChild(s2)
  }
}

function loadGa4(cfg: PublicTrackingConfig): void {
  if (!cfg.google.enabled || !cfg.google.ga4MeasurementId) return
  const id = cfg.google.ga4MeasurementId
  loadScriptOnce('ga4-lib', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`)
  loadScriptOnce('ga4-init', '', `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = window.gtag || gtag;
    gtag('js', new Date());
    gtag('config', '${id.replace(/'/g, '')}', { send_page_view: false });
  `)
}

function loadGtm(cfg: PublicTrackingConfig): void {
  if (!cfg.google.enabled || !cfg.google.useGtm || !cfg.google.gtmId) return
  const id = cfg.google.gtmId.replace(/[^A-Z0-9-]/gi, '')
  loadScriptOnce('gtm', '', `
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
    var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
    j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
    f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');
  `)
}

/** Meta Pixel — autoConfig OFF (نضبط PageView يدوياً لمنع التكرار) */
function loadMetaPixel(cfg: PublicTrackingConfig): void {
  if (!cfg.meta.enabled || !cfg.meta.pixelId) return
  const pid = cfg.meta.pixelId.replace(/[^0-9]/g, '')
  loadScriptOnce('meta-pixel', '', `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('set', 'autoConfig', false, '${pid}');
    fbq('init', '${pid}');
  `)
}

/** TikTok Pixel — page() يدوي فقط */
function loadTikTokPixel(cfg: PublicTrackingConfig): void {
  if (!cfg.tiktok.enabled || !cfg.tiktok.pixelId) return
  const pid = cfg.tiktok.pixelId.replace(/[^A-Z0-9]/gi, '')
  loadScriptOnce('tiktok-pixel', '', `
    !function (w, d, t) { w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
    ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
    ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
    for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
    ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
    ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
    ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");
    o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
    var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
    ttq.load('${pid}');
    // لا ttq.page() هنا — PageView تُضبط يدوياً من طبقة التتبع لمنع التكرار
    }(window, document, 'ttq');
  `)
}

// ─── UTM + Click IDs ─────────────────────────────────────────────────

export interface TouchData {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  at?: string
}

export interface CapturedAttribution {
  first: TouchData
  last: TouchData
  gclid?: string
  fbclid?: string
  ttclid?: string
  wbraid?: string
  gbraid?: string
  landingPage?: string
  referrer?: string
}

function readTouch(storage: Storage, key: string): TouchData {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * تُستدعى مرة عند الإقلاع — تلتقط utm_* و click ids من الـ URL
 * وتخزنها: first_touch (localStorage — دائم) + last_touch (session).
 * كما تضبط كوكي _fbc الرسمي لـ Meta عند وجود fbclid.
 */
export function captureAttribution(): CapturedAttribution | null {
  if (typeof window === 'undefined') return null
  const sp = new URLSearchParams(window.location.search)
  const keys = {
    source: 'utm_source', medium: 'utm_medium', campaign: 'utm_campaign',
    content: 'utm_content', term: 'utm_term',
  }
  const touch: TouchData = {}
  let hasUtm = false
  for (const [k, qk] of Object.entries(keys)) {
    const v = sp.get(qk)
    if (v) { (touch as any)[k] = v; hasUtm = true }
  }
  const clickIds = {
    gclid: sp.get('gclid') || undefined,
    fbclid: sp.get('fbclid') || undefined,
    ttclid: sp.get('ttclid') || undefined,
    wbraid: sp.get('wbraid') || undefined,
    gbraid: sp.get('gbraid') || undefined,
  }
  const hasClick = Object.values(clickIds).some(Boolean)
  if (!hasUtm && !hasClick) return null

  touch.at = new Date().toISOString()

  // Last touch (session) — آخر مصدر دائماً
  let last = readTouch(window.sessionStorage, LAST_TOUCH_KEY)
  if (hasUtm) last = { ...last, ...touch }
  else if (!last.source) last = { ...touch }
  try { window.sessionStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(last)) } catch {}

  // First touch (localStorage) — أول مصدر فقط
  let first = readTouch(window.localStorage, FIRST_TOUCH_KEY)
  if (!first.source && !first.at) {
    first = { ...touch }
    try { window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(first)) } catch {}
  }

  // كوكي _fbc الرسمي لـ Meta advanced matching
  if (clickIds.fbclid) {
    try {
      const fbc = `fb.1.${Date.now()}.${clickIds.fbclid}`
      document.cookie = `_fbc=${fbc}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`
    } catch {}
  }

  return {
    first,
    last,
    ...clickIds,
    landingPage: window.location.href.slice(0, 500),
    referrer: document.referrer || undefined,
  }
}

export function getAttributionForServer(): CapturedAttribution | null {
  if (typeof window === 'undefined') return null
  const first = readTouch(window.localStorage, FIRST_TOUCH_KEY)
  const last = readTouch(window.sessionStorage, LAST_TOUCH_KEY)
  const sp = new URLSearchParams(window.location.search)
  const captured: CapturedAttribution = {
    first, last,
    gclid: sp.get('gclid') || undefined,
    fbclid: sp.get('fbclid') || undefined,
    ttclid: sp.get('ttclid') || undefined,
    wbraid: sp.get('wbraid') || undefined,
    gbraid: sp.get('gbraid') || undefined,
    landingPage: undefined, referrer: undefined,
  }
  return first.source || last.source || captured.gclid || captured.fbclid || captured.ttclid ? captured : null
}

// ─── Dedupe client-side للعمليات المهمة ──────────────────────────────

function markClientSent(eventId: string): boolean {
  // يعيد true إذا كان جديداً (يُسمح بالإرسال)
  try {
    const raw = window.sessionStorage.getItem(CLIENT_SENT_KEY)
    const set: string[] = raw ? JSON.parse(raw) : []
    if (set.includes(eventId)) return false
    set.push(eventId)
    window.sessionStorage.setItem(CLIENT_SENT_KEY, JSON.stringify(set.slice(-100)))
    return true
  } catch {
    return true
  }
}

// ─── الإقلاع ─────────────────────────────────────────────────────────

/**
 * تحميل بكسلات الإعلانات المؤجلة (Meta / TikTok) بعد منح موافقة التسويق.
 * هذه المنصات لا تدعم Google Consent Mode — لا يمكن تحميلها قبل الموافقة
 * لأنها تكتب كوكيزها فور التحميل. GA4/GTM يُحمّلان فوراً لأن Consent Mode
 * يمنحهما وضعاً بلا كوكيز حتى يتخذ المستخدم قراره.
 * يُطلق PageView أولي للبكسلات بعد تحميلها (لم تُحسب بعد).
 */
let deferredPixelsLoaded = false
function loadDeferredPixels(firePageView = true): void {
  if (typeof window === 'undefined' || !config || deferredPixelsLoaded) return
  // 🛡️ المفتاح الرئيسي OFF → لا تحميل لأي بكسل إعلاني نهائياً — نفس
  // العقد الموثق في اللوحة: "عند الإيقاف يتوقف كل الإرسال لكل المنصات".
  if (!config.general.enabled) return
  if (!config.meta.enabled && !config.tiktok.enabled) return
  deferredPixelsLoaded = true

  const willLoadMeta = config.meta.enabled && !!config.meta.pixelId
  const willLoadTikTok = config.tiktok.enabled && !!config.tiktok.pixelId

  loadMetaPixel(config)
  loadTikTokPixel(config)

  if (config.general.debugMode) {
    console.log('[tracking] deferred ad pixels loaded (marketing consent granted)')
  }

  // PageView أولي — هذه البكسلات لم ترَ أي صفحة بعد.
  // عند الإقلاع (موافقة محفوظة) يتولى PageViewTracker الإرسال → نتجنب التكرار.
  if (!firePageView) return
  if (willLoadMeta && typeof window.fbq === 'function') {
    try { window.fbq('track', 'PageView', undefined) } catch { /* ignore */ }
  }
  if (willLoadTikTok && typeof window.ttq !== 'undefined') {
    try { window.ttq.page?.() } catch { /* ignore */ }
  }
}

export function initTracking(cfg: PublicTrackingConfig): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  config = cfg

  // 1) كوكي _fbc عند وجود fbclid في الرابط (advanced matching Meta)
  captureAttribution()

  if (!cfg.general.enabled) {
    // 🛡️ المفتاح الرئيسي OFF → لا سكريبتات تتبع تُحمّل نهائياً (نفس
    // عقد اللوحة). الواجهة العامة تفضل متاحة للفحص والتشخيص فقط.
    window.NezamTracking = {
      config: cfg,
      track: trackEvent,
      setConsent,
      getConsent,
      version: '1.1.0',
    }
    return
  }

  if (cfg.general.consentManagement) {
    // 2) Consent defaults قبل أي سكريبت تتبع (Google Consent Mode v2)
    loadScriptOnce('consent-defaults', '', consentDefaultsScript(cfg))

    // 3) GA4/GTM فوراً — Consent Mode يحكمنهما (بلا كوكيز حتى الموافقة)
    loadGa4(cfg)
    loadGtm(cfg)

    // 4) Meta/TikTok مؤجلة — فقط إذا سبق أن وافق المستخدم على التسويق
    if (getConsent().marketing) loadDeferredPixels(false)
  } else {
    // بدون إدارة موافقة — تحميل كل المنصات المفعّلة مباشرة (السلوك السابق)
    loadGa4(cfg)
    loadGtm(cfg)
    loadMetaPixel(cfg)
    loadTikTokPixel(cfg)
  }

  // 5) واجهة عامة للمطورين وواجهة الموافقة
  window.NezamTracking = {
    config: cfg,
    track: trackEvent,
    setConsent,
    getConsent,
    version: '1.1.0',
  }

  if (cfg.general.debugMode) {
    console.log('[tracking] initialized with config:', JSON.stringify(cfg))
  }
}

// ─── تحويلات الأسماء لكل منصة ────────────────────────────────────────

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

// ─── API المركزي للمتصفح ─────────────────────────────────────────────

export interface TrackOptions {
  /** تخطي فحص التكرار المحلي (لا تستخدمها مع العمليات المالية) */
  force?: boolean
}

export function trackEvent(
  eventName: string,
  params: TrackingEventParams = {},
  options: TrackOptions = {}
): void {
  if (typeof window === 'undefined' || !config || !config.general.enabled) return

  const eventId = params.eventId
  const debugLog = (...a: unknown[]) => {
    if (config!.general.debugMode) console.log('[tracking]', eventName, eventId ?? '', ...a)
  }

  // منع التكرار للعمليات المهمة (Refresh / إعادة فتح صفحة النجاح)
  if (eventId && !options.force) {
    const important = [TRACKING_EVENTS.CompleteRegistration, TRACKING_EVENTS.StartTrial, TRACKING_EVENTS.InitiateCheckout, TRACKING_EVENTS.Purchase]
    if (important.includes(eventName as any)) {
      if (!markClientSent(`${eventName}:${eventId}`)) {
        debugLog('skipped (already sent in this session)')
        return
      }
    }
  }

  // حالة الموافقة
  const consent = config.general.consentManagement ? getConsent() : { analytics: true, marketing: true }

  const ga4Data: Record<string, unknown> = {}
  if (params.value != null) ga4Data.value = params.value
  if (params.currency) ga4Data.currency = params.currency
  if (params.transactionId) ga4Data.transaction_id = params.transactionId
  if (params.contentId) ga4Data.item_id = params.contentId
  if (params.contentName) ga4Data.item_name = params.contentName
  if (params.contentType) ga4Data.item_category = params.contentType
  if (params.planId) ga4Data.plan_id = params.planId
  if (params.period) ga4Data.period = params.period

  // ── Google Analytics 4 ──
  if (config.google.enabled && config.google.ga4MeasurementId && consent.analytics) {
    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', ga4EventName(eventName), { ...ga4Data, ...(eventId ? { event_id: eventId } : {}) })
        debugLog('→ GA4')
      } catch (e) { console.warn('[tracking] ga4 error', e) }
    }
  }

  // ── Google Ads Conversions (+ Enhanced Conversions) ──
  // Sign Up / Trial / Purchase حسب التسميات المضبوطة في الإعدادات.
  const adsLabelFor: Record<string, string> = {
    [TRACKING_EVENTS.CompleteRegistration]: config.google.adsLabels.registration,
    [TRACKING_EVENTS.StartTrial]: config.google.adsLabels.trial,
    [TRACKING_EVENTS.Purchase]: config.google.adsLabels.purchase,
  }
  const adsLabel = adsLabelFor[eventName]
  if (
    config.google.enabled && config.google.adsConversionId && adsLabel &&
    consent.analytics // تحويلات Ads = قياس — نتبع موافقة analytics_storage وad_storage معاً
  ) {
    if (typeof window.gtag === 'function') {
      try {
        if (config.google.enhancedConversions && consent.marketing) {
          // بيانات first-party المطابقة تُضبط عبر user_data — gtag يطبّع
          // ويهشّم تلقائياً قبل الإرسال (الطريقة الرسمية الموثقة).
          // لا نرسل إلا المتاح فعلاً من userData المعطى مع الحدث.
          const ud = (params as any).userData
          if (ud && (ud.email || ud.phone)) {
            window.gtag('set', 'user_data', {
              ...(ud.email ? { email: ud.email } : {}),
              ...(ud.phone ? { phone_number: ud.phone } : {}),
            })
          }
        }
        window.gtag('event', 'conversion', {
          send_to: `${config.google.adsConversionId}/${adsLabel}`,
          ...(params.value != null ? { value: params.value } : {}),
          ...(params.currency ? { currency: params.currency } : {}),
          ...(params.transactionId ? { transaction_id: params.transactionId } : {}),
          ...(eventId ? { event_id: eventId } : {}),
        })
        debugLog('→ Google Ads conversion')
      } catch (e) { console.warn('[tracking] ads error', e) }
    }
  }

  // ── Meta Pixel ──
  if (config.meta.enabled && config.meta.pixelId && consent.marketing) {
    if (typeof window.fbq === 'function') {
      try {
        const fbData: Record<string, unknown> = {}
        if (params.value != null) fbData.value = params.value
        if (params.currency) fbData.currency = params.currency
        if (params.contentName) fbData.content_name = params.contentName
        if (params.contentType) fbData.content_type = params.contentType
        if (params.contentId) fbData.content_ids = [params.contentId]
        if (params.period) fbData.period = params.period
        if (eventName === TRACKING_EVENTS.Purchase && params.transactionId) {
          fbData.order_id = params.transactionId
        }
        if (eventId) {
          // Deduplication الرسمية: eventID = نفس معرف حدث السيرفر
          window.fbq('track', eventName, fbData, { eventID: eventId })
        } else {
          window.fbq('track', eventName, fbData)
        }
        debugLog('→ Meta Pixel')
      } catch (e) { console.warn('[tracking] meta error', e) }
    }
  }

  // ── TikTok Pixel ──
  if (config.tiktok.enabled && config.tiktok.pixelId && consent.marketing) {
    if (typeof window.ttq !== 'undefined' && typeof window.ttq.track === 'function') {
      try {
        const ttData: Record<string, unknown> = {}
        if (params.value != null) ttData.value = params.value
        if (params.currency) ttData.currency = params.currency
        if (params.contentName) ttData.content_name = params.contentName
        if (params.contentType) ttData.content_type = params.contentType
        if (params.contentId) ttData.content_id = params.contentId
        if (params.period) ttData.period = params.period
        if (eventName === TRACKING_EVENTS.Purchase && params.transactionId) {
          ttData.order_id = params.transactionId
        }
        if (eventId) {
          window.ttq.track(tikTokEventName(eventName), ttData, { event_id: eventId })
        } else {
          window.ttq.track(tikTokEventName(eventName), ttData)
        }
        debugLog('→ TikTok Pixel')
      } catch (e) { console.warn('[tracking] tiktok error', e) }
    }
  }
}

// ─── PageView (بدون تكرار SPA / StrictMode / hydration) ──────────────

export function trackPageView(path: string, pageLocation?: string): void {
  if (typeof window === 'undefined' || !config || !config.general.enabled) return
  // حماية صارمة من التكرار:
  //   1) نفس المسار بالضبط لا يُرسل مرتين متتاليتين (StrictMode / re-render)
  //   2) نفس pathname مع اختلاف query خلال 500ms يُتجاهل
  //      (hydration يضبط searchParams بعد أول effect)
  const now = Date.now()
  const pathnameOnly = path.split('?')[0]
  const lastPathnameOnly = lastPageViewPath?.split('?')[0]
  if (lastPageViewPath === path) return
  if (lastPathnameOnly === pathnameOnly && now - lastPageViewAt < 500) return
  lastPageViewPath = path
  lastPageViewAt = now

  const consent = config.general.consentManagement ? getConsent() : { analytics: true, marketing: true }

  // GA4 — send_page_view معطّل في config، نرسلها يدوياً هنا
  if (config.google.enabled && config.google.ga4MeasurementId && consent.analytics && typeof window.gtag === 'function') {
    try {
      window.gtag('event', 'page_view', {
        page_path: path,
        page_location: pageLocation ?? window.location.href,
      })
    } catch { /* ignore */ }
  }
  // GTM — بث page_view للـ container عند تفعيله
  if (config.google.enabled && config.google.useGtm && config.google.gtmId && consent.analytics) {
    try {
      window.dataLayer?.push({ event: 'nezam_page_view', page_path: path })
    } catch { /* ignore */ }
  }

  // Meta PageView (autoConfig معطّل — يدوي فقط)
  if (config.meta.enabled && config.meta.pixelId && consent.marketing && typeof window.fbq === 'function') {
    try {
      window.fbq('track', 'PageView', undefined)
    } catch { /* ignore */ }
  }

  // TikTok Pageview
  if (config.tiktok.enabled && config.tiktok.pixelId && consent.marketing && typeof window.ttq !== 'undefined') {
    try {
      window.ttq.page?.()
    } catch { /* ignore */ }
  }

  // 🧭 تسجيل جلسة الزيارة داخلياً (Visitors للقمع التحليلي) — إضافي،
  // لا يُرسل لأي منصة ويتبع موافقة التحليلات. fire-and-forget.
  logVisitorSession(path)

  if (config.general.debugMode) console.log('[tracking] PageView:', path)
}

// ─── تسجيل جلسة الزيارة (Visitors — القمع التحليلي) ──────────────────
// صف واحد لكل جلسة متصفح في TrackingEvent (provider='internal') —
// Idempotent على السيرفر (upsert) + flag محلي — لا يمس أي مزود.
const PV_SESSION_KEY = 'nezam_pv_session'
let pvLoggedThisSession = false

function pvSessionId(): string | null {
  try {
    let sid = window.sessionStorage.getItem(PV_SESSION_KEY)
    if (!sid) {
      const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      sid = `pv-${rand}`
      window.sessionStorage.setItem(PV_SESSION_KEY, sid)
    }
    return sid
  } catch { return null }
}

function logVisitorSession(path: string): void {
  if (pvLoggedThisSession || !config) return
  const consent = config.general.consentManagement ? getConsent() : { analytics: true, marketing: true }
  if (!consent.analytics) return // قياس تحليلي — يتبع موافقة analytics_storage
  const sid = pvSessionId()
  if (!sid) return
  pvLoggedThisSession = true
  try {
    void fetch('/api/tracking/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: sid,
        pageUrl: path.slice(0, 500),
        referrer: (document.referrer || '').slice(0, 500),
      }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* private mode */ }
}

// ─── Relay للسيرفر (ViewContent — matching أفضل على CAPI) ────────────

export async function relayEventToServer(
  eventName: string,
  eventId: string,
  params: TrackingEventParams
): Promise<void> {
  // whitelist فقط — الأحداث المهمة تُرسل من الـ Backend مباشرة
  const relayable: string[] = [TRACKING_EVENTS.ViewContent]
  if (!relayable.includes(eventName)) return
  try {
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, eventId, params, pageUrl: window.location.href }),
      keepalive: true,
    })
  } catch { /* non-blocking */ }
}
