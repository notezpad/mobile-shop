'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Menu, CalendarDays, Home, ChevronRight } from 'lucide-react'
import { Sidebar } from '@/components/shop/Sidebar'
import { ThemeToggle } from '@/components/shop/ThemeToggle'
import { NotificationBell } from '@/components/shop/NotificationBell'
import { PWAInstallPrompt } from '@/components/shop/PWAInstallPrompt'
import { ChunkGuard } from '@/components/shop/ChunkGuard'
import { OfflineIndicator } from '@/components/shop/OfflineIndicator'
import { TrialExpiredBanner } from '@/components/shop/TrialExpiredBanner'
import { RoleBadge } from '@/components/shop/RoleBadge'
import { useOfflineReady } from '@/lib/offline/use-offline'
import { useShopStore } from '@/lib/store'
import { api } from '@/lib/api'
import { getMe } from '@/lib/auth-client'

const VIEW_PATHS: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/pos': 'pos',
  '/products': 'products',
  '/sales': 'sales',
  '/maintenance': 'maintenance',
  '/customers': 'customers',
  '/suppliers': 'suppliers',
  '/purchases': 'purchases',
  '/inventory': 'inventory',
  '/finance': 'finance',
  '/expenses': 'expenses',
  '/cash': 'cash',
  '/reports': 'reports',
  '/settings': 'settings',
  '/users': 'users',
  '/branches': 'branches',
}

// 🛡️ 2026-09-27: الساعة والتاريخ هنا كانوا بيتحسبوا بـ now.getHours() /
// now.getDay() / ...إلخ، واللي بتاخد "توقيت الحائط" من *جهاز/متصفح*
// المستخدم نفسه — مش من إعداد المنطقة الزمنية بتاع المحل (Settings ›
// timezone). ده كان بيعمل تضارب بصري: موظف فاتح من دولة تانية بيشوف
// ساعة مختلفة عن التوقيت اللي بيتحسب بيه "مبيعات اليوم" فعليًا في
// السيرفر (اللي بياخد tenant.timezone دايمًا، راجع src/lib/tenantTime.ts).
//
// الحل: بنسيب `now` زي ما هو (لحظة زمنية مطلقة صحيحة أيًا كان جهاز
// المستخدم)، لكن بدل ما نستخرج الساعة/الشهر منه بدوال الجهاز المحلية،
// بنستخدم Intl.DateTimeFormat مع timeZone بتاع المحل عشان نعرض "توقيت
// حائط" المحل بالظبط، متسق مع باقي أرقام السيستم.
function getWallTimeInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'), // e.g. "Sun", "Mon"...
    day: Number(get('day')),
    month: Number(get('month')), // 1-12
    year: Number(get('year')),
  }
}

const WEEKDAY_MAP: Record<string, string> = {
  Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء',
  Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت',
}

function LiveClock({ timeZone }: { timeZone: string }) {
  const [mounted, setMounted] = React.useState(false)
  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    setMounted(true)
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!mounted) return <div className="h-9 w-[220px] shrink-0 rounded-xl bg-muted/50 animate-pulse" />

  const pad = (n: number) => String(n).padStart(2, '0')
  const wall = getWallTimeInTz(now, timeZone)
  let h = wall.hour
  const period = h >= 12 ? 'م' : 'ص'
  h = h % 12 || 12
  const m = pad(wall.minute)
  const s = pad(wall.second)
  const dayName = WEEKDAY_MAP[wall.weekday] || wall.weekday
  const day = wall.day
  const month = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][wall.month - 1]
  const year = wall.year

  return (
    <div className="inline-flex h-10 shrink-0 items-stretch overflow-hidden rounded-xl border border-border bg-card">
      {/* ── الوقت ── */}
      <div className="flex items-center gap-2 px-3">
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        <div dir="ltr" className="flex items-baseline gap-px tabular-nums">
          <span className="text-sm font-bold tracking-tight text-foreground">{pad(h)}:{m}</span>
          <span className="text-[11px] font-medium text-muted-foreground/60">:{s}</span>
          <span className="ml-1 text-[10px] font-bold text-muted-foreground">{period}</span>
        </div>
      </div>

      <div className="w-px shrink-0 bg-border" />

      {/* ── التاريخ ── */}
      <div className="flex items-center gap-1.5 bg-muted/40 px-3">
        <CalendarDays className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span dir="rtl" className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
          {dayName}، {day} {month} {year}
        </span>
      </div>
    </div>
  )
}

/** 🛡️ 2026-10-06: إغلاق السايدبار بزر Escape — بديل مباشر لسلوك Radix الشيتي
    القديم من غير أي Radix. مركّب مستقل عشان الـ effect يعتمد على enabled بس. */
function EscapeCloser({ onEscape, enabled }: { onEscape: () => void; enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape, enabled])
  return null
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [bootState, setBootState] = React.useState<'loading' | 'authed' | 'guest' | 'admin'>('loading')
  const setUser = useShopStore((s) => s.setUser)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const setPlan = useShopStore((s) => s.setPlan)
  const setSubscription = useShopStore((s) => s.setSubscription)
  const user = useShopStore((s) => s.user)
  const subscription = useShopStore((s) => s.subscription)
  const tenantTimezone = useShopStore((s) => s.branding.timezone)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // ─── Swipe-to-close for the mobile drawer (anchored right → drag right) ───
  // transform-only (no re-render while dragging). On release we clear the inline
  // styles so the existing CSS transition animates to open/closed from the finger.
  const swipe = React.useRef({ x: 0, y: 0, t: 0, dx: 0, locked: false, active: false })
  const onSwipeStart = (e: React.TouchEvent<HTMLElement>) => {
    const p = e.touches[0]
    swipe.current = { x: p.clientX, y: p.clientY, t: Date.now(), dx: 0, locked: false, active: true }
  }
  const onSwipeMove = (e: React.TouchEvent<HTMLElement>) => {
    const s = swipe.current
    if (!s.active) return
    const p = e.touches[0]
    const dx = p.clientX - s.x
    const dy = p.clientY - s.y
    if (!s.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s.active = false; return }
      if (dx > 10 && dx > Math.abs(dy)) s.locked = true
      else return
    }
    s.dx = Math.max(0, dx)
    const el = e.currentTarget
    el.style.transition = 'none'
    el.style.transform = `translateX(${s.dx}px)`
  }
  const onSwipeEnd = (e: React.TouchEvent<HTMLElement>) => {
    const s = swipe.current
    if (!s.active || !s.locked) { s.active = false; return }
    s.active = false
    const el = e.currentTarget
    const velocity = s.dx / Math.max(1, Date.now() - s.t)
    el.style.transition = ''
    el.style.transform = ''
    if (s.dx > 80 || velocity > 0.5) setMobileOpen(false)
  }

  // ⚡ Initialize offline sync engine (flush outbox when network returns)
  useOfflineReady()

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      // 🛡️ ROOT FIX (استهلاك موارد): التلات ريكويستات كانوا بيتنططوا
      // بالتوازي لأي حد يفتح الصفحة — يعني زائر/بوت مش مسجّل دخول كان
      // بيكلّف 3 ريكويستات + 3 اتصالات قاعدة بيانات. دلوقتي بنتأكد من
      // السيشن الأول، وبعدها بس بنسحب بيانات المحل والاشتراك.
      const meResult = await Promise.allSettled([getMe()]).then((r) => r[0])
      if (!alive) return

      const me = meResult.status === 'fulfilled' ? meResult.value : null
      if (!me) {
        setBootState('guest')
        return
      }
      setUser(me)

      const [tenantResult, subResult] = await Promise.allSettled([
        api<{ shopName?: string; phone?: string | null; address?: string | null; logoPath?: string | null; invoicePrefix?: string; timezone?: string }>('/api/tenant'),
        api<any>('/api/subscription'),
      ])
      if (!alive) return

      if (me.role === 'SUPER_ADMIN' && !(me as any).impersonating) {
        setBootState('admin')
        router.replace('/')
        return
      }

      if (tenantResult.status === 'fulfilled') {
        const t = tenantResult.value
        if (t?.shopName) setShopName(t.shopName)
        setBranding({
          phone: t?.phone ?? null,
          address: t?.address ?? null,
          logoPath: t?.logoPath ?? null,
          invoicePrefix: t?.invoicePrefix || 'INV',
          // 🛡️ 2026-09-27: تولبار الساعة/التاريخ فوق بيتبع دلوقتي المنطقة
          // الزمنية بتاعة المحل (مش جهاز المستخدم) — راجع LiveClock تحت.
          timezone: t?.timezone || 'Africa/Cairo',
        })
      }

      if (subResult.status === 'fulfilled') {
        const d = subResult.value
        // 🛡️ 2026-09-13: NO LONGER redirect on expired. Instead, store the
        // subscription state in the shop store and let the user continue
        // using the system. A `TrialExpiredBanner` will be shown at the top
        // of every page encouraging them to subscribe via /pricing.
        setSubscription({
          expired: Boolean(d?.expired),
          expiringSoon: Boolean(d?.expiringSoon),
          daysLeft: typeof d?.daysLeft === 'number' ? d.daysLeft : null,
          endDate: d?.endDate ?? null,
          planCode: d?.planCode ?? null,
          planName: d?.planName ?? null,
          period: d?.period ?? null,
        })
        if (Array.isArray(d?.enabledModules)) {
          setPlan({
            businessType: d.businessType === 'fashion' ? 'fashion' : 'electronics',
            enabledModules: d.enabledModules,
            capabilities: Array.isArray(d.capabilities) ? d.capabilities : [],
          })
        }
      }

      setBootState('authed')
    })()
    return () => { alive = false }
  }, [setUser, setShopName, setBranding, setPlan, setSubscription, router])

  React.useEffect(() => {
    if (!user && bootState === 'authed') {
      setBootState('guest')
    }
  }, [user, bootState])

  React.useEffect(() => {
    if (bootState === 'guest') {
      router.replace('/')
    }
  }, [bootState, router])

  if (bootState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (bootState === 'guest' || bootState === 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    // 🛡️ الشِل ثابت (fixed inset-0) بدل h-screen: كده الهيدر والسايدبار مش
    // بيتحركوا أبدًا مع سكرول الصفحة على الموبايل — السكرول بس داخل منطقة
    // المحتوى. (h-screen = 100vh كان أطول من الشاشة الظاهرة في كروم موبايل.)
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden overscroll-none">
      {/* Sticky trial/expiring banner — shown above everything else when
          subscription is expired or expiring soon. Does NOT lock the user
          out; just encourages them to subscribe. */}
      {/* 🛡️ v14: يكشف فشل تحميل chunks بعد نشر نسخة جديدة ويعمل ريلود
          تلقائي بدل الشاشة السوداء */}
      <ChunkGuard />
      <TrialExpiredBanner />
      <OfflineIndicator />
      {/* Mobile top bar */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" aria-label="فتح القائمة" className="shell-icon-btn" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </button>
          {/* زر الرئيسية: نفس شكل لوجو السايدبار، يرجّع للوحة المعلومات */}
          <Link
            href="/dashboard"
            aria-label="الرئيسية — لوحة المعلومات"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ring-1 ring-brand-500/20 transition-transform active:scale-90"
          >
            <Home className="size-[18px]" strokeWidth={1.9} />
          </Link>
          <div className="header-divider" />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          <div className="header-divider" />
          <NotificationBell />
          <div className="header-divider" />
          <RoleBadge role={user?.role as any} />
        </div>
      </header>

      {/* Mobile sidebar */}
      {/* 🛡️ 2026-10-06 — إصلاح تجمّد الجوال بالكامل: درَجر بسيط بدون Radix Dialog
          خالص. التاريخ: باتش v5 حط forceMount على SheetContent عشان يسرّع
          الفتح، بس ده خلّى Radix Overlay (اللي جوّه RemoveScroll) متركّب
          على طول → listeners غير passive على document بتعمل preventDefault
          لكل touchmove = سكرول الجوال ميت + أي لمسة بتنزل 1px الـ click
          بتاعها بيتلغى. وحتى بعد modal={false}، اختبارات المتصفح أثبتت إن
          وجود الشيت الـ forceMounted بيفسد dispatch بتاع React للضغطات
          الحقيقية (isTrusted) على الهيدر كله (المصدر: react-dialog 1.1.23
          + Presence/DismissableLayer مع forceMount).
          الحل النهائي: درَجر عادي — div ثابت بيتحرك بـ translate-x CSS.
          * شجرة السايدبار متجمّعة دايمًا جوّاه → الفتح فوري (300ms أنيميشن
            CSS نضيف من غير إعادة بناء — نفس هدف forceMount بالظبط).
          * مقفول = translate-x-full (بره الشاشة) + inert (مش بياخد focus
            ولا يترى لقارئات الشاشة) — مفيش أي طبقة فوق الصفحة.
          * مفيش قفل سكرول خالص: الشل fixed inset-0 + overflow-hidden،
            والمس على الـ Overlay (غير قابل للسكرول) مش بيسكرول حاجة وراه. */}
      {/* الظل الخلفي */}
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* الدرج نفسه */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="قائمة التنقل"
        inert={!mobileOpen}
        className={`fixed inset-y-0 right-0 z-50 flex h-dvh w-[82vw] max-w-[300px] flex-col bg-background shadow-lg transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onSwipeStart}
        onTouchMove={onSwipeMove}
        onTouchEnd={onSwipeEnd}
        onTouchCancel={onSwipeEnd}
      >
        {/* مقبض الإغلاق: لسان على الحافة الحرّة للدرج
            🛡️ 2026-10-06 — عزل events:
            • onPointerDown بدل onClick: أسرع استجابة، وبيشتغل قبل ما أي
              bubble يوصل للدرج أو للسايدبار.
            • stopPropagation على كل touch events: يمنع الـ swipe handlers
              بتاعة الدرج من اعتبار الضغطة على المقبض بداية سحب.
            • preventDefault على touchend: يقطع الـ "ghost click" اللي
              بيوصل للعنصر اللي وراه بعد 300ms على بعض المتصفحات.
            • touchAction none: يمنع المتصفح من تفسير اللمسة كسكرول. */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation()
            setMobileOpen(false)
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onTouchCancel={(e) => e.stopPropagation()}
          className="sb-edge-tab"
          data-open={mobileOpen}
          aria-label="إغلاق القائمة"
          style={{ touchAction: 'none' }}
        >
          <span className="sb-edge-grip" aria-hidden="true" />
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="sr-only">إغلاق</span>
        </button>
        {/* w-full: السايدبار يملا الدرج بالكامل */}
        <Sidebar className="w-full border-l-0" onNavigate={() => setMobileOpen(false)} />
      </div>
      {/* إغلاق بزرار Escape (سلوك الشيت القديم) */}
      <EscapeCloser onEscape={() => setMobileOpen(false)} enabled={mobileOpen} />

      {/*
        Sidebar + Main content in a flex-row.
        The sidebar is in the flex flow (not fixed), so the OfflineIndicator
        above it pushes it down correctly — no overlap.
      */}
      <div className="flex flex-1 min-h-0">
        {/* Icon rail sidebar — md to lg only (68px collapsed) */}
        <div className="hidden md:max-lg:flex shrink-0 h-full">
          <Sidebar collapsed />
        </div>

        {/* Desktop sidebar — lg and up (260px full) */}
        <div className="hidden lg:flex shrink-0 h-full">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
        {/* Desktop header */}
        <header className="sticky top-0 z-20 hidden h-16 shrink-0 items-center justify-between border-b bg-card/90 px-6 backdrop-blur-md lg:flex">
          <LiveClock timeZone={tenantTimezone || 'Africa/Cairo'} />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="header-divider" />
            <NotificationBell />
            <div className="header-divider" />
            <RoleBadge role={user?.role as any} />
          </div>
        </header>

        {/* Scrollable content area — renders the page */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain min-h-0 min-w-0">
          <div className="p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 min-w-0">
            {children}
          </div>
        </div>
      </div>
      </div>
      <PWAInstallPrompt />
    </div>
  )
}
