'use client'

import * as React from 'react'
import { SITE_NAME_AR, SUPPORT_EMAIL, SUPPORT_PHONE, WHATSAPP } from '@/lib/site'

/**
 * إعدادات المنصة العامة للواجهة (فوتر / تواصل معنا).
 * القيم الافتراضية من lib/site.ts بتظهر فورًا (من غير وميض)، وبعدين بتتبدّل بقيم الأدمن
 * لو محفوظة. نتيجة الـ fetch بتتخزن في الذاكرة فمكوّنين في نفس الصفحة = طلب واحد.
 */
export interface SiteSettings {
  platformName: string
  supportEmail: string
  supportPhone: string
  websiteUrl: string
  logoUrl: string
  facebookUrl: string
  twitterUrl: string
  telegramUrl: string
  instagramUrl: string
  whatsappUrl: string
  /** أرقام فقط بصيغة دولية (للروابط wa.me) */
  whatsappNumber: string
}

const DEFAULT_WA = WHATSAPP.replace(/\D/g, '')

const DEFAULTS: SiteSettings = {
  platformName: SITE_NAME_AR,
  supportEmail: SUPPORT_EMAIL,
  supportPhone: SUPPORT_PHONE,
  websiteUrl: '',
  logoUrl: '',
  facebookUrl: '',
  twitterUrl: '',
  telegramUrl: '',
  instagramUrl: '',
  whatsappUrl: `https://wa.me/${DEFAULT_WA}`,
  whatsappNumber: DEFAULT_WA,
}

function merge(saved: Partial<Record<string, string>>): SiteSettings {
  const s = { ...DEFAULTS }
  for (const k of Object.keys(DEFAULTS) as (keyof SiteSettings)[]) {
    if (k === 'whatsappNumber') continue
    const v = saved[k]
    if (typeof v === 'string' && v.trim()) s[k] = v.trim()
  }
  const m = /wa\.me\/\+?(\d{6,15})/i.exec(s.whatsappUrl)
  s.whatsappNumber = m ? m[1] : DEFAULT_WA
  return s
}

let cached: SiteSettings | null = null
let inflight: Promise<SiteSettings> | null = null

function load(): Promise<SiteSettings> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetch('/api/site/settings')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((d) => (cached = merge(d ?? {})))
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useSiteSettings(): SiteSettings {
  const [s, setS] = React.useState<SiteSettings>(cached ?? DEFAULTS)
  React.useEffect(() => {
    let alive = true
    load().then((v) => alive && setS(v))
    return () => {
      alive = false
    }
  }, [])
  return s
}
