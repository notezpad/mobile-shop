'use client'

import * as React from 'react'
import {
  Menu,
  LogIn,
  Sparkles,
  Users,
  Tag,
  ShieldCheck,
  MessageCircleQuestion,
  ArrowLeft,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { AuthMode } from './AuthModal'
import { SITE_NAME, SITE_NAME_AR, WHATSAPP } from '@/lib/site'

interface NavItem {
  label: string
  href: string
  hint: string
}

const NAV_ITEMS: { item: NavItem; Icon: React.ElementType }[] = [
  { item: { label: 'المزايا', href: '#features', hint: 'كل ما يقدّمه النظام' }, Icon: Sparkles },
  { item: { label: 'لمن النظام', href: '#who-for', hint: 'محلات الملابس والأحذية وغيرها' }, Icon: Users },
  { item: { label: 'الأسعار', href: '#pricing', hint: 'باقات واضحة بدون رسوم خفية' }, Icon: Tag },
  { item: { label: 'ليه تثق فينا', href: '#trust', hint: 'أمان وسرعة ودعم حقيقي' }, Icon: ShieldCheck },
  { item: { label: 'الأسئلة الشائعة', href: '#faq', hint: 'إجابات في دقيقة' }, Icon: MessageCircleQuestion },
]

// أرقام عربية-هندية لفهارس عناصر القائمة
const INDEX_NUMERALS = ['٠١', '٠٢', '٠٣', '٠٤', '٠٥']

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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-2.5 sm:px-6 lg:px-8">
          {/* Logo */}
          <a href="#top" className="group flex items-center gap-3">
            <img
              src="/logo.svg" alt="Nezam POS" width={42} height={42}
              draggable={false}
              className="size-[42px] select-none rounded-[14px] shadow-lg shadow-[#00402a]/40 ring-2 ring-white/90 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
              style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
            />
            <span className="flex flex-col leading-tight">
              <span dir="ltr" className="text-right text-[17px] font-black text-white">{SITE_NAME}</span>
              <span className="text-right text-[11px] font-semibold text-white/80">{SITE_NAME_AR}</span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map(({ item }) => (
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
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="القائمة"
                  className="relative size-10 rounded-2xl text-white ring-1 ring-white/25 transition-all hover:bg-white/15 hover:ring-white/50"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>

              {/* ===== القائمة الجانبية — لوح زجاجي زمردي ===== */}
              <SheetContent
                side="right"
                className="nz-drawer w-[86vw] max-w-[360px] border-l border-white/10 !bg-transparent p-0 text-white sm:w-[360px]"
              >
                <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
                <div className="nz-drawer-surface relative flex h-full flex-col overflow-hidden">
                  {/* هالة ضوء علوية */}
                  <div className="pointer-events-none absolute -top-28 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-[#00c98b]/25 blur-3xl" aria-hidden />

                  {/* ترويسة اللوح */}
                  <div className="relative px-5 pb-4 pt-6">
                    <div className="nz-glass-card flex items-center gap-3 px-4 py-3.5">
                      <img
                        src="/logo.svg" alt="" width={38} height={38}
                        draggable={false}
                        className="size-[38px] select-none rounded-[12px] shadow-md shadow-black/40 ring-2 ring-white/85"
                        style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
                      />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span dir="ltr" className="text-right text-[15px] font-black text-white">{SITE_NAME}</span>
                        <span className="text-right text-[11px] font-semibold text-white/65">{SITE_NAME_AR}</span>
                      </div>
                      <span className="nz-gold-chip mr-auto shrink-0">تجربة مجانية</span>
                    </div>
                  </div>

                  {/* روابط القائمة */}
                  <nav className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-2 pt-1" aria-label="روابط الصفحة">
                    {NAV_ITEMS.map(({ item, Icon }, i) => (
                      <button
                        key={item.href}
                        onClick={() => handleNav(item.href)}
                        style={{ '--i': i } as React.CSSProperties}
                        className="nz-menu-item group"
                      >
                        <span className="nz-item-index" aria-hidden>{INDEX_NUMERALS[i]}</span>
                        <span className="nz-item-icon" aria-hidden>
                          <Icon className="size-[18px]" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-right">
                          <span className="text-[15px] font-extrabold leading-none text-white">{item.label}</span>
                          <span className="text-[11px] font-medium leading-none text-white/55">{item.hint}</span>
                        </span>
                        <ArrowLeft className="nz-item-arrow size-4 shrink-0" aria-hidden />
                      </button>
                    ))}
                  </nav>

                  {/* أزرار الحساب */}
                  <div className="relative space-y-2.5 border-t border-white/10 bg-black/20 p-4 backdrop-blur-md">
                    <button
                      onClick={() => {
                        setMobileOpen(false)
                        onOpenAuth('signup')
                      }}
                      className="nz-cta-primary group"
                    >
                      <span>ابدأ مجاناً</span>
                      <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden />
                    </button>
                    <button
                      onClick={() => {
                        setMobileOpen(false)
                        onOpenAuth('login')
                      }}
                      className="nz-cta-ghost"
                    >
                      <LogIn className="size-4" aria-hidden />
                      <span>تسجيل الدخول</span>
                    </button>

                    {/* دعم مباشر واتساب */}
                    <a
                      href={`https://wa.me/${WHATSAPP.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="nz-support-link"
                    >
                      <MessageCircle className="size-4" aria-hidden />
                      <span>دعم مباشر على واتساب</span>
                    </a>
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
