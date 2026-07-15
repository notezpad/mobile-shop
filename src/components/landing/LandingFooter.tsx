'use client'

import * as React from 'react'
import { Store, Facebook, Instagram, Twitter, MessageCircle } from 'lucide-react'

const PRODUCT_LINKS = ['المزايا', 'الأسعار', 'كيف يعمل', 'العرض التوضيحي']
const COMPANY_LINKS = ['من نحن', 'المدونة', 'الوظائف', 'تواصل معنا']
const SUPPORT_LINKS = [
  'مركز المساعدة',
  'الأسئلة الشائعة',
  'الشروط والأحكام',
  'سياسة الخصوصية',
]

export function LandingFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-md shadow-primary/30">
                <Store className="size-5" />
              </span>
              <span className="text-base font-bold text-foreground">نظام المحل</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              منصة إدارة المحلات #1 في مصر — حلول متكاملة لإدارة المبيعات والمخزون
              والصيانة والعملاء.
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
                    className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    <Icon className="size-4" />
                  </a>
                )
              })}
            </div>
          </div>

          {/* Product links */}
          <FooterColumn title="المنتج" links={PRODUCT_LINKS} />
          {/* Company links */}
          <FooterColumn title="الشركة" links={COMPANY_LINKS} />
          {/* Support links */}
          <FooterColumn title="الدعم" links={SUPPORT_LINKS} />
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-center text-xs text-muted-foreground sm:flex-row sm:text-right">
          <p>© {new Date().getFullYear()} نظام المحل. جميع الحقوق محفوظة.</p>
          <p>صُنع بحب في مصر 🇪🇬</p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-bold text-foreground">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l}>
            <a
              href="#"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
