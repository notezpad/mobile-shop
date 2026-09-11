'use client'

import * as React from 'react'
import { Store, Facebook, Instagram, Twitter, MessageCircle } from 'lucide-react'

const PRODUCT_LINKS = [
  { label: 'المزايا', href: '#features' },
  { label: 'لمن النظام', href: '#who-for' },
  { label: 'الأسعار', href: '#pricing' },
  { label: 'العرض التوضيحي', href: '#screenshots' },
]
const COMPANY_LINKS = ['من نحن', 'المدونة', 'الوظائف', 'تواصل معنا']
const SUPPORT_LINKS = ['مركز المساعدة', 'الأسئلة الشائعة', 'الشروط والأحكام', 'سياسة الخصوصية']

export function LandingFooter() {
  const handleNav = (href: string) => {
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <footer className="landing-dark relative border-t border-white/5">
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/30">
                <Store className="size-5" />
              </span>
              <span className="text-base font-bold text-white">نظام المحل</span>
            </div>
            <p className="text-sm leading-relaxed lg-muted">
              منصة إدارة محلات الموبايل والكمبيوتر، والملابس والأحذية — جملة وقطاعي — من مكان واحد.
            </p>
            <div className="flex items-center gap-2">
              {[
                { icon: Facebook, label: 'فيسبوك' },
                { icon: Instagram, label: 'انستجرام' },
                { icon: Twitter, label: 'تويتر' },
                { icon: MessageCircle, label: 'واتساب' },
              ].map((s, i) => {
                const Icon = s.icon
                return (
                  <a
                    key={i}
                    href="#"
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
          <p>© {new Date().getFullYear()} نظام المحل. جميع الحقوق محفوظة.</p>
          <p>صُنع بحب في مصر 🇪🇬</p>
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

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-bold text-white">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l}>
            <a href="#" className="text-sm lg-muted transition-colors hover:text-brand-300">
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
