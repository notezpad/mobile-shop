'use client'

import * as React from 'react'
import { Menu, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { AuthMode } from './AuthModal'
import { SITE_NAME, SITE_NAME_AR } from '@/lib/site'

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
    <div className="lg-head-green sticky top-0 z-40 w-full">
      {/* Main header */}
      <header
        className={
          'w-full transition-all duration-300 ' +
          (scrolled ? 'lgh-nav' : 'border-b border-transparent bg-transparent')
        }
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <a href="#top" className="group flex items-center gap-3">
            <img
              src="/logo.svg" alt="Nezam POS" width={42} height={42}
              className="size-[42px] rounded-[14px] shadow-lg shadow-[#00402a]/40 ring-2 ring-white/90 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
            />
            <span className="flex flex-col leading-tight">
              <span dir="ltr" className="text-right text-[17px] font-black text-white">{SITE_NAME}</span>
              <span className="text-right text-[11px] font-semibold text-white/80">{SITE_NAME_AR}</span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNav(item.href)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/15 hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-3 lg:flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenAuth('login')}
              className="gap-1.5 text-white hover:bg-white/15 hover:text-white"
            >
              <LogIn className="size-4" />
              تسجيل الدخول
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenAuth('signup')}
              className="gap-1.5 bg-white font-extrabold text-[#005639] shadow-lg shadow-[#00402a]/30 hover:bg-[#eafaf1]"
            >
              ابدأ مجاناً
            </Button>
          </div>

          {/* Mobile: hamburger */}
          <div className="lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="القائمة" className="text-white hover:bg-white/15 hover:text-white">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="lg-head-green w-[300px] border-l border-white/15 !bg-[#007650] p-0 text-white">
                <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
                <div className="flex h-full flex-col">
                  {/* Mobile header */}
                  <div className="flex items-center gap-2.5 border-b border-white/10 bg-[#005639] px-5 py-5 text-white">
                    <img src="/logo.svg" alt="" width={36} height={36} className="size-9 rounded-xl ring-2 ring-white" />
                    <span className="flex flex-col leading-tight">
                      <span dir="ltr" className="text-base font-black">{SITE_NAME}</span>
                      <span className="text-xs font-semibold text-white/80">{SITE_NAME_AR}</span>
                    </span>
                  </div>

                  {/* Mobile nav links */}
                  <nav className="flex flex-col gap-1 p-4">
                    {NAV_ITEMS.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => handleNav(item.href)}
                        className="rounded-lg px-4 py-3.5 text-right text-base font-bold text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>

                  {/* Mobile CTAs */}
                  <div className="mt-auto space-y-2.5 border-t border-white/10 p-4">
                    <Button
                      variant="outline"
                      className="h-11 w-full gap-1.5 rounded-xl border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                      onClick={() => {
                        setMobileOpen(false)
                        onOpenAuth('login')
                      }}
                    >
                      <LogIn className="size-4" />
                      تسجيل الدخول
                    </Button>
                    <Button
                      className="h-11 w-full gap-1.5 rounded-xl bg-white font-extrabold text-[#005639] shadow-md hover:bg-[#eafaf1]"
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
