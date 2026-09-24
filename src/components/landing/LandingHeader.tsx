'use client'

import * as React from 'react'
import { Menu, Store, X, LogIn, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { VerticalSwitch } from './VerticalSwitch'
import type { AuthMode } from './AuthModal'

interface NavItem {
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'المزايا', href: '#features' },
  { label: 'لمن النظام', href: '#who-for' },
  { label: 'الأسعار', href: '#pricing' },
  { label: 'ليه تثق فينا', href: '#trust' },
  { label: 'الأسئلة الشائعة', href: '#faq' },
]

interface LandingHeaderProps {
  onOpenAuth: (mode: AuthMode) => void
}

export function LandingHeader({ onOpenAuth }: LandingHeaderProps) {
  const [scrolled, setScrolled] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [showTopBar, setShowTopBar] = React.useState(true)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNav = (href: string) => {
    setMobileOpen(false)
    const el = document.querySelector(href)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="landing-dark sticky top-0 z-40 w-full">
      {/* Top promo bar */}
      {showTopBar && (
        <div className="relative bg-gradient-to-l from-brand-600 to-brand-800 text-white">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs sm:text-sm">
            <Sparkles className="size-3.5 shrink-0" />
            <span className="font-medium">
              🎁 تجربة مجانية 14 يوم — بدون بطاقة ائتمان
            </span>
            <button
              type="button"
              onClick={() => setShowTopBar(false)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded p-1 opacity-80 hover:bg-white/10 hover:opacity-100"
              aria-label="إغلاق"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main header */}
      <header
        className={
          'w-full transition-all duration-300 ' +
          (scrolled ? 'glass-nav' : 'border-b border-transparent bg-transparent')
        }
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/30">
              <Store className="size-5" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold text-white">نظام المحل</span>
              <span className="hidden text-[10px] lg-muted sm:block">
                منصة إدارة المحلات والجملة #1 في العالم العربي
              </span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNav(item.href)}
                className="rounded-md px-3 py-2 text-sm font-medium lg-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-3 lg:flex">
            <VerticalSwitch className="hidden xl:inline-flex" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenAuth('login')}
              className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
            >
              <LogIn className="size-4" />
              تسجيل الدخول
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenAuth('signup')}
              className="gap-1.5 bg-gradient-to-l from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30 hover:from-brand-400 hover:to-brand-600"
            >
              ابدأ مجاناً
            </Button>
          </div>

          {/* Mobile: hamburger */}
          <div className="lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="القائمة" className="text-white hover:bg-white/10 hover:text-white">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="landing-dark w-[300px] border-l border-white/10 bg-[#0c0e14] p-0 text-white">
                <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
                <div className="flex h-full flex-col">
                  {/* Mobile header */}
                  <div className="flex items-center gap-2.5 border-b border-white/10 bg-gradient-to-l from-brand-600 to-brand-800 px-5 py-5 text-white">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-white/15">
                      <Store className="size-5" />
                    </span>
                    <span className="text-base font-bold">نظام المحل</span>
                  </div>

                  {/* Mobile nav links */}
                  <nav className="flex flex-col gap-1 p-4">
                    {NAV_ITEMS.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => handleNav(item.href)}
                        className="rounded-lg px-4 py-3.5 text-right text-base font-bold text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>

                  {/* Mobile CTAs */}
                  <div className="mt-auto space-y-2.5 border-t border-white/10 p-4">
                    <Button
                      variant="outline"
                      className="h-11 w-full gap-1.5 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setMobileOpen(false)
                        onOpenAuth('login')
                      }}
                    >
                      <LogIn className="size-4" />
                      تسجيل الدخول
                    </Button>
                    <Button
                      className="h-11 w-full gap-1.5 rounded-xl bg-gradient-to-l from-brand-500 to-brand-700 font-bold text-white shadow-md shadow-brand-600/30 hover:from-brand-400 hover:to-brand-600"
                      onClick={() => {
                        setMobileOpen(false)
                        onOpenAuth('signup')
                      }}
                    >
                      ابدأ مجاناً
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </div>
  )
}
