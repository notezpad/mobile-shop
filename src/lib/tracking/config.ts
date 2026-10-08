/**
 * ═══════════════════════════════════════════════════════════════════
 * Tracking Layer — Server Config (Backend ONLY)
 * ═══════════════════════════════════════════════════════════════════
 * الإعدادات تُخزَّن في جدول PlatformSetting (key = 'tracking_config')
 * بنفس أسلوب المشروع الحالي. الأسرار (Access Tokens / API Secrets)
 * تُقرأ هنا فقط على السيرفر — ولا تعود أبداً في أي استجابة API
 * إلا بصيغة Masked لعرضها في اللوحة.
 *
 * دعم Secrets عبر Environment Variables (اختياري):
 *   TRACKING_META_CAPI_TOKEN / TRACKING_TIKTOK_EVENTS_TOKEN /
 *   TRACKING_GA4_API_SECRET — متغير البيئة يتقدم على قاعدة البيانات
 *   إن وُجد (أكثر أماناً لبيئات الإنتاج).
 */

import { db } from '@/lib/db'
import { readEnv } from '@/lib/env'
import {
  DEFAULT_TRACKING_CONFIG,
  TRACKING_CONFIG_VERSION,
  TrackingConfig,
} from './types'

const SETTING_KEY = 'tracking_config'

// ─── كاش قصير (10 ثوان) حتى لا نضرب DB في كل حدث ─────────────────────
let cached: { cfg: TrackingConfig; at: number } | null = null
const CACHE_MS = 10_000

export function invalidateTrackingConfigCache() {
  cached = null
}

/** دمج آمن: القيم المخزنة + الافتراضيات + env overrides للأسرار */
function mergeConfig(raw: unknown): TrackingConfig {
  const base = structuredClone(DEFAULT_TRACKING_CONFIG) as TrackingConfig
  if (!raw || typeof raw !== 'object') return withEnvSecrets(base)

  const r = raw as Record<string, any>
  if (r.general && typeof r.general === 'object') {
    Object.assign(base.general, pickBooleans(r.general, ['enabled', 'debugMode', 'testMode', 'consentManagement']))
  }
  if (r.google && typeof r.google === 'object') {
    const g = r.google as Record<string, any>
    base.google.enabled = bool(g.enabled, base.google.enabled)
    base.google.ga4MeasurementId = str(g.ga4MeasurementId)
    base.google.ga4ApiSecret = str(g.ga4ApiSecret)
    base.google.adsConversionId = str(g.adsConversionId)
    if (g.adsLabels && typeof g.adsLabels === 'object') {
      base.google.adsLabels.registration = str(g.adsLabels.registration)
      base.google.adsLabels.trial = str(g.adsLabels.trial)
      base.google.adsLabels.purchase = str(g.adsLabels.purchase)
    }
    base.google.gtmId = str(g.gtmId)
    base.google.useGtm = bool(g.useGtm, base.google.useGtm)
    base.google.enhancedConversions = bool(g.enhancedConversions, base.google.enhancedConversions)
    base.google.consentMode = bool(g.consentMode, base.google.consentMode)
  }
  if (r.meta && typeof r.meta === 'object') {
    const m = r.meta as Record<string, any>
    base.meta.enabled = bool(m.enabled, base.meta.enabled)
    base.meta.pixelId = str(m.pixelId)
    base.meta.datasetId = str(m.datasetId)
    base.meta.capiToken = str(m.capiToken)
  }
  if (r.tiktok && typeof r.tiktok === 'object') {
    const t = r.tiktok as Record<string, any>
    base.tiktok.enabled = bool(t.enabled, base.tiktok.enabled)
    base.tiktok.pixelId = str(t.pixelId)
    base.tiktok.eventsApiToken = str(t.eventsApiToken)
    base.tiktok.testEventCode = str(t.testEventCode)
  }

  return withEnvSecrets(base)
}

/** متغيرات البيئة الحساسة تتقدم على قاعدة البيانات إن وُجدت */
function withEnvSecrets(cfg: TrackingConfig): TrackingConfig {
  const envMeta = readEnv('TRACKING_META_CAPI_TOKEN')
  if (envMeta) cfg.meta.capiToken = envMeta
  const envTikTok = readEnv('TRACKING_TIKTOK_EVENTS_TOKEN')
  if (envTikTok) cfg.tiktok.eventsApiToken = envTikTok
  const envGa4 = readEnv('TRACKING_GA4_API_SECRET')
  if (envGa4) cfg.google.ga4ApiSecret = envGa4
  // 🛡️ ترحيل سلس: المتغير القديم للـ GA4 (قبل طبقة التتبع) يعمل
  // كـ fallback عندما لا يكون الـ Measurement ID مضبوطاً من اللوحة.
  if (!cfg.google.ga4MeasurementId) {
    const legacyGa4 = readEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID')
    if (legacyGa4) cfg.google.ga4MeasurementId = legacyGa4
  }
  return cfg
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}
function pickBooleans(obj: Record<string, any>, keys: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const k of keys) if (typeof obj[k] === 'boolean') out[k] = obj[k]
  return out
}

/** قراءة الإعدادات الكاملة — السيرفر فقط */
export async function getTrackingConfig(): Promise<TrackingConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.cfg
  let cfg: TrackingConfig
  try {
    const row = await db.platformSetting.findUnique({ where: { key: SETTING_KEY } })
    cfg = mergeConfig(row ? safeJson(row.value) : null)
  } catch {
    cfg = mergeConfig(null)
  }
  cached = { cfg, at: Date.now() }
  return cfg
}

function safeJson(v: string): unknown {
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

/**
 * حفظ الإعدادات — يُستدعى من /api/admin/tracking (Super Admin فقط).
 * القاعدة: أي حقل سري فارغ ('') في الطلب يعني "بدون تغيير" حتى لا
 * يمسحه العرض Masked بالخطأ. لإزالة سري عمداً يُرسَل '__CLEAR__'.
 */
export async function saveTrackingConfig(patch: unknown): Promise<TrackingConfig> {
  const current = await getTrackingConfig()
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, any>

  const next: TrackingConfig = structuredClone(current)

  if (p.general && typeof p.general === 'object') {
    const g = p.general as Record<string, any>
    for (const k of ['enabled', 'debugMode', 'testMode', 'consentManagement'] as const) {
      if (typeof g[k] === 'boolean') next.general[k] = g[k]
    }
  }
  if (p.google && typeof p.google === 'object') {
    const g = p.google as Record<string, any>
    if (typeof g.enabled === 'boolean') next.google.enabled = g.enabled
    if (typeof g.ga4MeasurementId === 'string') next.google.ga4MeasurementId = g.ga4MeasurementId.trim()
    if (typeof g.adsConversionId === 'string') next.google.adsConversionId = g.adsConversionId.trim()
    if (g.adsLabels && typeof g.adsLabels === 'object') {
      for (const k of ['registration', 'trial', 'purchase'] as const) {
        if (typeof g.adsLabels[k] === 'string') next.google.adsLabels[k] = (g.adsLabels[k] as string).trim()
      }
    }
    if (typeof g.gtmId === 'string') next.google.gtmId = g.gtmId.trim()
    if (typeof g.useGtm === 'boolean') next.google.useGtm = g.useGtm
    if (typeof g.enhancedConversions === 'boolean') next.google.enhancedConversions = g.enhancedConversions
    if (typeof g.consentMode === 'boolean') next.google.consentMode = g.consentMode
    // ga4ApiSecret: فقط لو قيمة جديدة غير فارغة (أو __CLEAR__)
    next.google.ga4ApiSecret = applySecretPatch(current.google.ga4ApiSecret, g.ga4ApiSecret)
  }
  if (p.meta && typeof p.meta === 'object') {
    const m = p.meta as Record<string, any>
    if (typeof m.enabled === 'boolean') next.meta.enabled = m.enabled
    if (typeof m.pixelId === 'string') next.meta.pixelId = m.pixelId.trim()
    if (typeof m.datasetId === 'string') next.meta.datasetId = m.datasetId.trim()
    next.meta.capiToken = applySecretPatch(current.meta.capiToken, m.capiToken)
  }
  if (p.tiktok && typeof p.tiktok === 'object') {
    const t = p.tiktok as Record<string, any>
    if (typeof t.enabled === 'boolean') next.tiktok.enabled = t.enabled
    if (typeof t.pixelId === 'string') next.tiktok.pixelId = t.pixelId.trim()
    if (typeof t.testEventCode === 'string') next.tiktok.testEventCode = t.testEventCode.trim()
    next.tiktok.eventsApiToken = applySecretPatch(current.tiktok.eventsApiToken, t.eventsApiToken)
  }

  next.version = TRACKING_CONFIG_VERSION

  await db.platformSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(next), updatedAt: new Date() },
    create: { key: SETTING_KEY, value: JSON.stringify(next) },
  })

  invalidateTrackingConfigCache()
  return next
}

function applySecretPatch(current: string, incoming: unknown): string {
  if (typeof incoming !== 'string') return current
  const v = incoming.trim()
  if (v === '__CLEAR__') return ''
  if (v === '') return current // Masked display → بدون تغيير
  return v
}

// ─── Masking helpers ─────────────────────────────────────────────────

/** علامة أن السري مضبوط (ترجعها GET بدل قيمته الحقيقية) */
export function maskSecret(v: string): string | null {
  if (!v) return null
  const tail = v.length > 4 ? v.slice(-4) : v
  return `••••${tail}`
}

// ─── حالة اتصال كل منصة (لشاشة الحالة بدون Secrets) ─────────────────
export interface ProviderStatus {
  key: 'ga4' | 'google_ads' | 'meta' | 'tiktok'
  label: string
  connected: boolean
  detail: string
}

export function getProviderStatuses(cfg: TrackingConfig): ProviderStatus[] {
  const ga4Connected = cfg.google.enabled && cfg.general.enabled && /^G-[A-Z0-9]+$/i.test(cfg.google.ga4MeasurementId)
  const adsConnected =
    cfg.google.enabled && cfg.general.enabled && /^AW-\d+$/i.test(cfg.google.adsConversionId) && Object.values(cfg.google.adsLabels).some(Boolean)
  const metaConnected =
    cfg.meta.enabled && cfg.general.enabled && !!cfg.meta.pixelId && !!cfg.meta.capiToken
  const tiktokConnected =
    cfg.tiktok.enabled && cfg.general.enabled && !!cfg.tiktok.pixelId && !!cfg.tiktok.eventsApiToken

  return [
    {
      key: 'ga4',
      label: 'Google Analytics 4',
      connected: ga4Connected,
      detail: ga4Connected ? cfg.google.ga4MeasurementId : cfg.google.ga4MeasurementId ? 'Measurement ID غير صالح' : 'غير مضبوط',
    },
    {
      key: 'google_ads',
      label: 'Google Ads',
      connected: adsConnected,
      detail: adsConnected ? `${cfg.google.adsConversionId} (${Object.values(cfg.google.adsLabels).filter(Boolean).length} تحويلات)` : 'غير مضبوط',
    },
    {
      key: 'meta',
      label: 'Meta (Pixel + CAPI)',
      connected: metaConnected,
      detail: !cfg.meta.pixelId ? 'Pixel ID غير مضبوط' : !cfg.meta.capiToken ? 'Pixel مضبوط — CAPI Token مفقود' : cfg.meta.pixelId,
    },
    {
      key: 'tiktok',
      label: 'TikTok (Pixel + Events API)',
      connected: tiktokConnected,
      detail: !cfg.tiktok.pixelId ? 'Pixel ID غير مضبوط' : !cfg.tiktok.eventsApiToken ? 'Pixel مضبوط — Events Token مفقود' : cfg.tiktok.pixelId,
    },
  ]
}
