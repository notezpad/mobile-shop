'use client'

import * as React from 'react'
import { useSiteSettings } from '@/lib/use-site-settings'

const PRODUCT_LINKS = [
  { label: 'المزايا', href: '#features' },
  { label: 'لمن النظام', href: '#who-for' },
  { label: 'الأسعار', href: '#pricing' },
  { label: 'العرض التوضيحي', href: '#screenshots' },
]
const COMPANY_LINKS = [
  { label: 'من نحن', href: '/about-us' },
  { label: 'سياسة الكوكيز', href: '/cookies-policy' },
  { label: 'تواصل معنا', href: '/contact-us' },
]
const SUPPORT_LINKS = [
  { label: 'سياسة الاسترجاع', href: '/refund-policy' },
  { label: 'الأسئلة الشائعة', href: '/#faq' },
  { label: 'الشروط والأحكام', href: '/terms-and-conditions' },
  { label: 'سياسة الخصوصية', href: '/privacy-policy' },
]

/* أيقونات البراندات الرسمية (SVG) — lucide ما فيهاش واتساب ولا تليجرام ولا شعار X */
const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'
const FB_PATH = 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z'
const X_PATH = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'
const TG_PATH = 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'

function BrandIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

export function LandingFooter() {
  const site = useSiteSettings()
  // الأربع أيقونات ظاهرة دايمًا. اللي مالوش رابط في إعدادات الأدمن بيروح لصفحة «تواصل معنا»
  // (وتليجرام بيفتح رقم الدعم) لحد ما الأدمن يحط الرابط الحقيقي.
  const socials = [
    { d: WA_PATH, label: 'واتساب', color: '#25d366', href: site.whatsappUrl },
    { d: FB_PATH, label: 'فيسبوك', color: '#1877f2', href: site.facebookUrl || '/contact-us' },
    { d: X_PATH, label: 'تويتر (X)', color: '#0f1419', href: site.twitterUrl || '/contact-us' },
    { d: TG_PATH, label: 'تليجرام', color: '#27a7e7', href: site.telegramUrl || `https://t.me/+${site.whatsappNumber}` },
  ]
  const handleNav = (href: string) => {
    // If the hash target exists on the current page (landing page only), scroll to it.
    // Otherwise, navigate to the landing page with the hash so it can scroll there.
    const el = document.querySelector(href)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (href.startsWith('#')) {
      // We're on a non-landing page — go to landing page with the hash.
      // Full navigation مقصودة عشان المتصفح يعمل scroll للهاش على صفحة الـlanding
      // (router.push مابيضمنش السكرول ده من صفحة تانية) — نتخطى التحذير هنا.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/' + href)
    }
  }

  return (
    <footer className="lg-foot-green relative">
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              {site.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt={site.platformName} className="size-9 rounded-xl object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo.svg" alt={site.platformName} className="size-9 rounded-xl ring-2 ring-white/80" />
              )}
              <span className="text-base font-bold text-white">{site.platformName}</span>
            </div>
            <p className="text-sm leading-relaxed lg-muted">
              منصة إدارة محلات الموبايل والكمبيوتر، والملابس والأحذية — جملة وقطاعي — من مكان واحد.
            </p>
            <div className="flex items-center gap-2.5 pt-1">
              {socials.map((s) => {
                const isExternal = s.href.startsWith('http')
                return (
                  <a
                    key={s.label}
                    href={s.href}
                    {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    aria-label={s.label}
                    title={s.label}
                    className="soc-btn"
                    style={{ ['--c' as string]: s.color }}
                  >
                    <BrandIcon d={s.d} />
                  </a>
                )
              })}
            </div>
          </div>

          {/* Product links */}
          <FooterLinkColumn title="المنتج" links={PRODUCT_LINKS} onNav={handleNav} />
          {/* Company links */}
          <FooterColumn title="الشركة" links={COMPANY_LINKS} />
          {/* Support links */}
          <FooterColumn title="الدعم" links={SUPPORT_LINKS} />
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-center text-xs lg-muted sm:flex-row sm:text-right">
          <p>© {new Date().getFullYear()} {site.platformName}. جميع الحقوق محفوظة.</p>
          <p>صُنع للعالم العربي 🌍</p>
        </div>
      </div>
    </footer>
  )
}

function FooterLinkColumn({
  title,
  links,
  onNav,
}: {
  title: string
  links: { label: string; href: string }[]
  onNav: (href: string) => void
}) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-extrabold text-white">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <button
              onClick={() => onNav(l.href)}
              className="text-sm lg-muted transition-colors hover:text-white hover:underline"
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-extrabold text-white">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => {
          const isInternal = l.href.startsWith('/')
          const isHash = l.href.startsWith('#')
          return (
            <li key={l.label}>
              {isInternal ? (
                <a href={l.href} className="text-sm lg-muted transition-colors hover:text-white hover:underline">
                  {l.label}
                </a>
              ) : isHash ? (
                <a href={l.href} className="text-sm lg-muted transition-colors hover:text-white hover:underline">
                  {l.label}
                </a>
              ) : (
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm lg-muted transition-colors hover:text-white hover:underline"
                >
                  {l.label}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
