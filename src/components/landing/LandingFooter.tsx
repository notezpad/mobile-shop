'use client'

import * as React from 'react'
import { Store, MessageCircle, Facebook, Instagram, Twitter } from 'lucide-react'
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

export function LandingFooter() {
  const site = useSiteSettings()
  const socials = [
    { icon: MessageCircle, label: 'واتساب', href: site.whatsappUrl },
    { icon: Facebook, label: 'فيسبوك', href: site.facebookUrl },
    { icon: Instagram, label: 'إنستجرام', href: site.instagramUrl },
    { icon: Twitter, label: 'إكس', href: site.twitterUrl },
  ].filter((x) => x.href)
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
    <footer className="landing-dark relative border-t border-white/5">
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              {site.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt={site.platformName} className="size-9 rounded-xl object-contain" />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/30">
                  <Store className="size-5" />
                </span>
              )}
              <span className="text-base font-bold text-white">{site.platformName}</span>
            </div>
            <p className="text-sm leading-relaxed lg-muted">
              منصة إدارة محلات الموبايل والكمبيوتر، والملابس والأحذية — جملة وقطاعي — من مكان واحد.
            </p>
            <div className="flex items-center gap-2">
              {socials.map((s, i) => {
                const Icon = s.icon
                const isExternal = s.href.startsWith('http')
                return (
                  <a
                    key={i}
                    href={s.href}
                    {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    aria-label={s.label}
                    className="glass-card flex size-9 items-center justify-center rounded-lg lg-muted transition-colors hover:text-white"
                  >
                    <Icon className="size-4" />
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
      <h4 className="mb-4 text-sm font-bold text-white">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <button
              onClick={() => onNav(l.href)}
              className="text-sm lg-muted transition-colors hover:text-brand-300"
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
      <h4 className="mb-4 text-sm font-bold text-white">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => {
          const isInternal = l.href.startsWith('/')
          const isHash = l.href.startsWith('#')
          return (
            <li key={l.label}>
              {isInternal ? (
                <a href={l.href} className="text-sm lg-muted transition-colors hover:text-brand-300">
                  {l.label}
                </a>
              ) : isHash ? (
                <a href={l.href} className="text-sm lg-muted transition-colors hover:text-brand-300">
                  {l.label}
                </a>
              ) : (
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm lg-muted transition-colors hover:text-brand-300"
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
