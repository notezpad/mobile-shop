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
import type { AuthMode } from './AuthModal'

interface NavItem {
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'المزايا', href: '#features' },
  { label: 'كيف يعمل', href: '#how-it-works' },
  { label: 'الأسعار', href: '#pricing' },
  { label: 'آراء العملاء', href: '#testimonials' },
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
    <div className="sticky top-0 z-40 w-full">
      {/* Top promo bar */}
      {showTopBar && (
        <div className="relative bg-gradient-to-l from-primary to-emerald-600 text-primary-foreground">
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
          'w-full border-b transition-all duration-300 ' +
          (scrolled
            ? 'border-border/60 bg-background/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/70'
            : 'border-transparent bg-background/40 backdrop-blur-sm')
        }
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-md shadow-primary/30">
              <Store className="size-5" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold text-foreground">نظام المحل</span>
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                منصة إدارة المحلات #1 في مصر
              </span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNav(item.href)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenAuth('login')}
              className="gap-1.5"
            >
              <LogIn className="size-4" />
              تسجيل الدخول
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenAuth('signup')}
              className="gap-1.5 shadow-sm shadow-primary/30"
            >
              ابدأ مجاناً
            </Button>
          </div>

          {/* Mobile: hamburger */}
          <div className="lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="القائمة">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] p-0">
                <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
                <div className="flex h-full flex-col">
                  {/* Mobile header */}
                  <div className="flex items-center gap-2.5 border-b bg-gradient-to-l from-primary to-emerald-600 px-5 py-5 text-primary-foreground">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-primary-foreground/15">
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
                        className="rounded-md px-3 py-3 text-right text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>

                  {/* Mobile CTAs */}
                  <div className="mt-auto space-y-2 border-t p-4">
                    <Button
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() => {
                        setMobileOpen(false)
                        onOpenAuth('login')
                      }}
                    >
                      <LogIn className="size-4" />
                      تسجيل الدخول
                    </Button>
                    <Button
                      className="w-full gap-1.5"
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
