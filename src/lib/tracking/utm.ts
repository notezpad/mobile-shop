/**
 * ═══════════════════════════════════════════════════════════════════
 * UTM Builder — بناء وتنسيق روابط الحملات (Meta / Google / TikTok)
 * ═══════════════════════════════════════════════════════════════════
 * Pure functions — تعمل في المتصفح والسيرفر بدون أي I/O.
 * القواعد:
 *   - القيم تُطبَّع (lowercase + شرطات) لكن الـ Macros تُحترم كما هي
 *     ({{...}} لـ Meta، {...} لـ Google، __X__ لـ TikTok).
 *   - الرابط الأساسي (Canonical) يُحفظ كما هو — UTM تُلحق به فقط.
 *   - urlHash (SHA-256) للرابط النهائي → منع التكرار على مستوى DB.
 */

export type UtmPlatform = 'meta' | 'google' | 'tiktok' | 'custom'

export interface UtmInput {
  destinationUrl: string
  platform: UtmPlatform | string
  campaign: string
  content?: string
  term?: string
  utmId?: string
  source?: string // اختياري — وإلا يُشتق من المنصة
  medium?: string // اختياري — وإلا يُشتق من المنصة
  name?: string // اسم الحملة للعرض في المكتبة
}

export interface UtmBuildResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  destinationUrl: string
  source: string
  medium: string
  campaign: string
  content: string
  term: string
  utmId: string
  fullUrl: string
}

// ─── اقتراحات Source / Medium حسب المنصة ─────────────────────────────

export const PLATFORM_SUGGESTIONS: Record<UtmPlatform, { sources: string[]; mediums: string[]; label: string }> = {
  meta: { sources: ['facebook', 'instagram', 'meta'], mediums: ['paid_social', 'paid_social_video', 'paid_social_story', 'social'], label: 'Meta (Facebook / Instagram)' },
  google: { sources: ['google'], mediums: ['cpc', 'paid_search', 'display', 'shopping', 'youtube'], label: 'Google Ads' },
  tiktok: { sources: ['tiktok'], mediums: ['paid_social', 'paid_social_video', 'social'], label: 'TikTok Ads' },
  custom: { sources: ['newsletter', 'referral', 'whatsapp', 'telegram'], mediums: ['email', 'referral', 'social', 'cpc'], label: 'مخصص' },
}

// ─── Dynamic Parameters لكل منصة (Macros تُستبدل بواسطة المنصة) ───────

export const PLATFORM_MACROS: Record<UtmPlatform, { macro: string; label: string; target: 'content' | 'term' | 'campaign' | 'utmId' | 'source' }[]> = {
  meta: [
    { macro: '{{campaign.name}}', label: 'اسم الحملة', target: 'utmId' },
    { macro: '{{adset.name}}', label: 'اسم Ad Set', target: 'content' },
    { macro: '{{ad.name}}', label: 'اسم الإعلان', target: 'content' },
    { macro: '{{ad.id}}', label: 'Ad ID', target: 'content' },
    { macro: '{{site_source_name}}', label: 'المصدر (fb/ig/msg/an)', target: 'source' },
    { macro: '{{placement}}', label: 'موضع الإعلان', target: 'term' },
  ],
  google: [
    { macro: '{campaignid}', label: 'Campaign ID', target: 'utmId' },
    { macro: '{adgroupid}', label: 'Ad Group ID', target: 'content' },
    { macro: '{creative}', label: 'Creative ID', target: 'content' },
    { macro: '{keyword}', label: 'الكلمة المفتاحية', target: 'term' },
    { macro: '{matchtype}', label: 'نوع المطابقة', target: 'term' },
    { macro: '{device}', label: 'الجهاز (m/c/t)', target: 'content' },
  ],
  tiktok: [
    { macro: '__CAMPAIGN_NAME__', label: 'اسم الحملة', target: 'content' },
    { macro: '__AID__', label: 'Ad ID', target: 'utmId' },
    { macro: '__AID_NAME__', label: 'اسم الإعلان', target: 'content' },
    { macro: '__PLACEMENT__', label: 'موضع الإعلان', target: 'term' },
  ],
  custom: [],
}

/** هل النص يحتوي Macro (لا يُطبَّع)؟ */
function hasMacro(v: string): boolean {
  return /\{\{|__[A-Z0-9_]+__|\{[a-z0-9_]+\}/i.test(v)
}

/** تطبيع قيمة UTM — lowercase، مسافات → شرطات، إزالة الأحرف الخطرة */
export function normalizeUtmValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-.{}%]/g, '')
    .slice(0, 120)
}

/** تطبيع قيمة قد تحتوي Macro — تنظيف بسيط فقط */
export function normalizeMacroValue(raw: string): string {
  return raw.trim().replace(/\s+/g, '_').slice(0, 160)
}

/** تشفير قيمة UTM للانضمام للرابط — الماكرو {{...}} / {...} / __X__ تبقى حرفية */
function encodeUtmValue(v: string): string {
  // آمن: a-z 0-9 _ - . % وأقواس الماكرو {} (منصات الإعلان تتطلبها حرفية)
  // نهشّم فقط ما قد يكسر بنية الرابط: & = ? # + " مسافة وأحرف غير ASCII
  return v.replace(/[^a-zA-Z0-9_\-./%{}]/g, (ch) => encodeURIComponent(ch))
}

export function getMacros(platform: string) {
  return PLATFORM_MACROS[(platform as UtmPlatform) in PLATFORM_MACROS ? (platform as UtmPlatform) : 'custom'] ?? []
}

export function getSuggestions(platform: string) {
  return PLATFORM_SUGGESTIONS[(platform as UtmPlatform) in PLATFORM_SUGGESTIONS ? (platform as UtmPlatform) : 'custom']
}

/** فحص أن الرابط الأساسي صالح ولا يحتوي UTM مسبقاً (Canonical نظيف) */
export function validateDestination(raw: string): { ok: boolean; error?: string; canonical: string } {
  const url = raw.trim()
  if (!url) return { ok: false, error: 'الرابط الأساسي مطلوب', canonical: '' }
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'الرابط يجب أن يبدأ بـ http:// أو https://', canonical: '' }
  try {
    const u = new URL(url)
    if (u.search) {
      // فيه query — نسمح به لكن نحذف أي utm_* موجود للحفاظ على Canonical نظيف
      const kept: string[] = []
      u.searchParams.forEach((v, k) => { if (!/^utm_/i.test(k)) kept.push(`${k}=${v}`) })
      const clean = `${u.origin}${u.pathname}${kept.length ? '?' + kept.join('&') : ''}${u.hash}`
      return { ok: true, canonical: clean }
    }
    return { ok: true, canonical: `${u.origin}${u.pathname}${u.hash}` }
  } catch {
    return { ok: false, error: 'رابط غير صالح', canonical: '' }
  }
}

/**
 * بناء رابط UTM كامل + تحقق شامل.
 * لا يرمي استثناءات — يرجع errors/warnings للعرض في الواجهة.
 */
export function buildUtmUrl(input: UtmInput): UtmBuildResult {
  const errors: string[] = []
  const warnings: string[] = []

  const dest = validateDestination(input.destinationUrl || '')
  if (!dest.ok) errors.push(dest.error || 'رابط غير صالح')

  const source = normalizeUtmValue(input.source || getSuggestions(String(input.platform)).sources[0] || '')
  const medium = normalizeUtmValue(input.medium || getSuggestions(String(input.platform)).mediums[0] || '')
  // اسم الحملة قد يحتوي Macro من المستخدم — نطبّع بحذر
  const rawCampaign = (input.campaign || '').trim()
  if (!rawCampaign) errors.push('اسم الحملة (utm_campaign) مطلوب')
  const campaign = hasMacro(rawCampaign) ? normalizeMacroValue(rawCampaign) : normalizeUtmValue(rawCampaign)
  if (campaign && !hasMacro(campaign) && campaign.length < 3) warnings.push('اسم الحملة قصير جداً — يُفضَّل 3 أحرف على الأقل')

  const content = hasMacro(input.content || '') ? normalizeMacroValue(input.content!) : normalizeUtmValue(input.content || '')
  const term = hasMacro(input.term || '') ? normalizeMacroValue(input.term!) : normalizeUtmValue(input.term || '')
  const utmId = hasMacro(input.utmId || '') ? normalizeMacroValue(input.utmId!) : normalizeUtmValue(input.utmId || '')

  if (!source) errors.push('utm_source مطلوب')
  if (!medium) errors.push('utm_medium مطلوب')

  // تحذيرات منطقية
  if (source && !/^(facebook|instagram|meta|google|tiktok|newsletter|referral|whatsapp|telegram|email)$/.test(source) && input.platform !== 'custom') {
    warnings.push(`المصدر "${source}" غير معتاد للمنصة ${String(input.platform)}`)
  }
  if (medium && /^(social|organic)$/.test(medium) && ['meta', 'google', 'tiktok'].includes(String(input.platform))) {
    warnings.push('روابط الإعلانات المدفوعة يُفضَّل أن يكون medium فيها paid_* لتصنيف صحيح في التقارير')
  }

  let fullUrl = dest.canonical
  if (errors.length === 0) {
    const parts: string[] = [
      `utm_source=${encodeUtmValue(source)}`,
      `utm_medium=${encodeUtmValue(medium)}`,
      `utm_campaign=${encodeUtmValue(campaign)}`,
    ]
    if (content) parts.push(`utm_content=${encodeUtmValue(content)}`)
    if (term) parts.push(`utm_term=${encodeUtmValue(term)}`)
    if (utmId) parts.push(`utm_id=${encodeUtmValue(utmId)}`)
    fullUrl = `${dest.canonical}${dest.canonical.includes('?') ? '&' : '?'}${parts.join('&')}`
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    destinationUrl: dest.canonical,
    source, medium, campaign, content, term, utmId,
    fullUrl,
  }
}

/** SHA-256 hex للرابط النهائي — يُستخدم لمنع التكرار (Safari/Node compatible) */
export async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // fallback Node
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(text).digest('hex')
}

/** تصدير صفوف CSV (مع BOM للعربية في Excel) */
export function toCsv(rows: Record<string, unknown>[], headers?: { key: string; label: string }[]): string {
  if (!rows.length) return ''
  const cols = headers ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = cols.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(',')).join('\n')
  return '\uFEFF' + head + '\n' + body
}
