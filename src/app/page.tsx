'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import {
  Menu,
  Loader2,
  Shield,
  LogOut,
  AlertTriangle,
  KeyRound,
  Clock,
  Sparkles,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { Sidebar } from '@/components/shop/Sidebar'
// ScaleWrapper is applied selectively around the authenticated app shell
// (MainApp / SuperAdminApp). It must NOT wrap the landing page or auth
// page — those rely on natural document scrolling and would be clipped
// by ScaleWrapper's `position: fixed; overflow: hidden` outer container.
// See: src/components/providers.tsx for the rationale.
import { ScaleWrapper } from '@/components/ScaleWrapper'

// FIXED: lazy-load all heavy view components so the initial JS bundle only contains
// the shell (Sidebar, auth, layout). Each view is fetched on first navigation to it.
// This alone cuts the initial parse+execute time by ~60-70% (from ~950KB to ~280KB).
//
// ⚡ PERF FIX (CPU time / Error 1102): switched from React.lazy to next/dynamic
// with ssr:false. React.lazy + Suspense is STILL fully rendered on the Worker
// during SSR (Next resolves the import and streams the real markup — the CPU
// cost is paid either way, just spread across the response instead of upfront).
// Every one of these views fetches its own data client-side in useEffect, so
// none of them need — or ever benefited from — being rendered on the server.
// ssr:false skips server rendering entirely for whichever view is active,
// which is the single biggest CPU cost on this route (this file renders 19
// possible views, several of them 1000+ line components). Zero behavior
// change: the `loading` fallback below is the same spinner Suspense showed.
const ViewFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="size-5 animate-spin text-primary" />
  </div>
)
const DashboardView  = dynamic(() => import('@/components/shop/DashboardView').then(m => m.DashboardView), { ssr: false, loading: ViewFallback })
const POSView        = dynamic(() => import('@/components/shop/POSView').then(m => m.POSView), { ssr: false, loading: ViewFallback })
const ProductsView   = dynamic(() => import('@/components/shop/ProductsView').then(m => m.ProductsView), { ssr: false, loading: ViewFallback })
const SalesHistoryView = dynamic(() => import('@/components/shop/SalesHistoryView').then(m => m.SalesHistoryView), { ssr: false, loading: ViewFallback })
const MaintenanceView = dynamic(() => import('@/components/shop/MaintenanceView').then(m => m.MaintenanceView), { ssr: false, loading: ViewFallback })
const CustomersView  = dynamic(() => import('@/components/shop/CustomersView').then(m => m.CustomersView), { ssr: false, loading: ViewFallback })
const SuppliersView  = dynamic(() => import('@/components/shop/SuppliersView').then(m => m.SuppliersView), { ssr: false, loading: ViewFallback })
const PurchaseOrdersView = dynamic(() => import('@/components/shop/PurchaseOrdersView').then(m => m.PurchaseOrdersView), { ssr: false, loading: ViewFallback })
const FinanceView    = dynamic(() => import('@/components/shop/FinanceView').then(m => m.FinanceView), { ssr: false, loading: ViewFallback })
const ExpensesView   = dynamic(() => import('@/components/shop/ExpensesView').then(m => m.ExpensesView), { ssr: false, loading: ViewFallback })
const CashView       = dynamic(() => import('@/components/shop/CashView').then(m => m.CashView), { ssr: false, loading: ViewFallback })
const ReportsView    = dynamic(() => import('@/components/shop/ReportsView').then(m => m.ReportsView), { ssr: false, loading: ViewFallback })
const SettingsView   = dynamic(() => import('@/components/shop/SettingsView').then(m => m.SettingsView), { ssr: false, loading: ViewFallback })
const UsersView      = dynamic(() => import('@/components/shop/UsersView').then(m => m.UsersView), { ssr: false, loading: ViewFallback })
const InventoryView  = dynamic(() => import('@/components/shop/InventoryView').then(m => m.InventoryView), { ssr: false, loading: ViewFallback })
const BranchesView   = dynamic(() => import('@/components/shop/BranchesView').then(m => m.BranchesView), { ssr: false, loading: ViewFallback })
const SuperAdminApp  = dynamic(() => import('@/components/admin/SuperAdminApp').then(m => m.SuperAdminApp), { ssr: false, loading: () => <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-primary" /></div> })
const LandingPage    = dynamic(() => import('@/components/landing/LandingPage').then(m => m.LandingPage), { ssr: false, loading: () => <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-primary" /></div> })
import { useShopStore } from '@/lib/store'
import { useViewRouter } from '@/lib/use-view-router'
import { api } from '@/lib/api'
import { getMe, type AuthUser } from '@/lib/auth-client'
import { toast } from 'sonner'
// 🛡️ 2026-09-15: import CRITICAL_MODULES from plan-constants (CLIENT-SAFE).
// DO NOT import from '@/lib/features' here — that file pulls in Prisma + `pg`
// (Postgres driver), which uses Node's `dns` module and breaks the browser
// bundle. plan-constants.ts has no db imports and is safe for client code.
import { CRITICAL_MODULES } from '@/lib/plan-constants'

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'لوحة المعلومات',
  pos: 'نقطة البيع',
  products: 'المنتجات',
  sales: 'سجل المبيعات',
  maintenance: 'الصيانة',
  customers: 'العملاء',
  suppliers: 'الموردين',
  purchases: 'المشتريات',
  finance: 'المعاملات المالية',
  expenses: 'الالمعاملات المالية',
  cash: 'الخزنة',
  reports: 'التقارير',
  settings: 'الإعدادات',
  users: 'المستخدمين',
  inventory: 'المخزون',
  branches: 'الفروع',
}

const ARABIC_DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const ARABIC_MONTHS_SHORT = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

function LiveClock() {
  // نفس نمط الـ mounted-guard المستخدم في ThemeToggle تحت — بيمنع أي فرق بين
  // وقت السيرفر ووقت المتصفح لحظة الـ hydration (كان ممكن يعمل وميض/mismatch).
  const [mounted, setMounted] = React.useState(false)
  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    setMounted(true)
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!mounted) {
    return <div className="h-10 w-[190px] shrink-0 rounded-full bg-muted/60" />
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  let h = now.getHours()
  const period = h >= 12 ? 'م' : 'ص'
  h = h % 12 || 12
  const m = pad(now.getMinutes())
  const s = pad(now.getSeconds())

  const dayName = ARABIC_DAYS[now.getDay()]
  const day = now.getDate()
  const month = ARABIC_MONTHS_SHORT[now.getMonth()]
  const year = now.getFullYear()

  return (
    <div
      className="inline-flex h-10 shrink-0 items-center gap-3 rounded-full border border-border bg-muted/60 px-4"
      aria-label={`الساعة الآن ${pad(h)}:${m}:${s} ${period}، ${dayName} ${day} ${month} ${year}`}
    >
      {/* نقطة "مباشر" */}
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>

      {/* الوقت — dir + flex صريحين عشان حرف الصباح/المساء (حرف عربي) يفضل
         مكانه صراحةً بدل ما يتحدد بخوارزمية الـ bidi. الحرف (م/ص) أول عنصر
         في الـ DOM هنا فيظهر على شمال الرقم */}
      <span dir="ltr" className="inline-flex items-baseline gap-1">
        <span className="text-xs font-semibold text-muted-foreground">{period}</span>
        <span className="text-base font-bold tabular-nums leading-none text-foreground">
          {pad(h)}:{m}:{s}
        </span>
      </span>

      {/* فاصل */}
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />

      {/* التاريخ */}
      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
        {dayName}، {day} {month} {year}
      </span>
    </div>
  )
}
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const uid = React.useId().replace(/:/g, '')
  if (!mounted) return <div className="size-9" />

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title="تبديل السمة"
      aria-label="تبديل الوضع الليلي والنهاري"
      className={[
        'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border transition-colors duration-500',
        'backdrop-blur-xl',
        isDark
          ? 'border-white/15 bg-gradient-to-b from-slate-800/70 to-slate-950/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]'
          : 'border-white/50 bg-gradient-to-b from-white/80 to-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95)]',
      ].join(' ')}
    >
      {/* glass sheen */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/50 to-transparent" />

      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ rotate: -90, opacity: 0, scale: 0.4 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative z-10 flex items-center justify-center"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id={`${uid}-moon`} cx="42%" cy="38%" r="70%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="55%" stopColor="#f5f6fa" />
                  <stop offset="100%" stopColor="#dfe3ee" />
                </radialGradient>
                <filter id={`${uid}-moonGlow`} x="-80%" y="-80%" width="260%" height="260%">
                  <feDropShadow dx="0" dy="0" stdDeviation="1.1" floodColor="#ffffff" floodOpacity="0.95" />
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ffffff" floodOpacity="0.55" />
                </filter>
              </defs>
              <path
                d="M20.2 14.8A8.6 8.6 0 1 1 9.2 3.4a7.1 7.1 0 0 0 11 11.4Z"
                fill={`url(#${uid}-moon)`}
                filter={`url(#${uid}-moonGlow)`}
              />
              <circle cx="6.3" cy="5.8" r="0.9" fill="#ffffff" opacity="0.95" />
              <circle cx="4.3" cy="10.5" r="0.55" fill="#ffffff" opacity="0.75" />
            </svg>
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, opacity: 0, scale: 0.4 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative z-10 flex items-center justify-center"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id={`${uid}-sun`} cx="45%" cy="40%" r="65%">
                  <stop offset="0%" stopColor="#fffbe6" />
                  <stop offset="45%" stopColor="#ffe066" />
                  <stop offset="100%" stopColor="#f5c400" />
                </radialGradient>
                <filter id={`${uid}-sunGlow`} x="-80%" y="-80%" width="260%" height="260%">
                  <feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="#ffd93d" floodOpacity="0.95" />
                  <feDropShadow dx="0" dy="0" stdDeviation="2.6" floodColor="#f5c400" floodOpacity="0.6" />
                </filter>
              </defs>
              <circle cx="12" cy="12" r="4.8" fill={`url(#${uid}-sun)`} filter={`url(#${uid}-sunGlow)`} />
              <g stroke="#ffd400" strokeWidth="1.8" strokeLinecap="round" filter={`url(#${uid}-sunGlow)`}>
                <line x1="12" y1="1.8" x2="12" y2="4.3" />
                <line x1="12" y1="19.7" x2="12" y2="22.2" />
                <line x1="4.3" y1="12" x2="1.8" y2="12" />
                <line x1="22.2" y1="12" x2="19.7" y2="12" />
                <line x1="5.3" y1="5.3" x2="7.1" y2="7.1" />
                <line x1="16.9" y1="16.9" x2="18.7" y2="18.7" />
                <line x1="5.3" y1="18.7" x2="7.1" y2="16.9" />
                <line x1="16.9" y1="7.1" x2="18.7" y2="5.3" />
              </g>
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

/* ---------------- Subscription Expired Screen ---------------- */

function SubscriptionExpiredScreen() {
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const logout = useShopStore((s) => s.logout)
  const user = useShopStore((s) => s.user)

  const redeem = async () => {
    if (!code.trim()) {
      toast.error('أدخل كود التفعيل')
      return
    }
    if (!user?.tenantId) return
    setBusy(true)
    try {
      await api('/api/admin/redeem', {
        method: 'POST',
        body: { code: code.trim().toUpperCase(), tenantId: user.tenantId },
      })
      toast.success('تم تفعيل الاشتراك بنجاح 🎉')
      setTimeout(() => window.location.reload(), 600)
    } catch (e: any) {
      toast.error(e?.message || 'كود غير صحيح')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-rose-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="overflow-hidden border-rose-200 shadow-xl">
          <CardContent className="p-0">
            <div className="flex flex-col items-center gap-2 bg-rose-600 px-6 py-8 text-white">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-white/15">
                <AlertTriangle className="size-7" />
              </div>
              <h1 className="text-xl font-bold">اشتراكك منتهي</h1>
              <p className="text-xs opacity-90">يرجى الاشتراك أو تفعيل كود للمتابعة</p>
            </div>
            <div className="space-y-4 p-6">
              {/* ── Option 1: Online payment via Paymob ── */}
              <div className="rounded-lg border bg-emerald-50 p-3">
                <p className="mb-2 text-xs font-semibold text-emerald-800">
                  📲 الدفع الإلكتروني عبر المحافظ (Vodafone Cash, Instapay, Fawry)
                </p>
                <a
                  href="/pricing"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  <Sparkles className="size-4" />
                  اشترك الآن — صفحة الباقات
                </a>
              </div>

              {/* ── Divider ── */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] text-muted-foreground">أو</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* ── Option 2: Activate by code ── */}
              <div className="space-y-1.5">
                <Label htmlFor="redeem-code">كود التفعيل</Label>
                <Input
                  id="redeem-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ABCDEFGHIJKL"
                  dir="ltr"
                  className="font-mono text-center text-lg tracking-widest"
                />
                <p className="text-[11px] text-muted-foreground">
                  أدخل الكود المكون من 12 حرف الذي حصلت عليه من الإدارة
                </p>
              </div>
              <Button onClick={redeem} className="w-full gap-1.5" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                تفعيل بكود
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  // 🛡️ FIX: wait for logout() to finish (it now awaits the
                  // server-side cookie clear itself) BEFORE reloading.
                  // Reloading on a fixed 200ms timer raced the network
                  // request — on a slow connection the cookie wasn't
                  // cleared yet, so the reload landed the user right back
                  // on this same expired-subscription screen, forcing them
                  // to click logout again and again.
                  await logout()
                  window.location.reload()
                }}
              >
                تسجيل الخروج
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

/* ---------------- Impersonation Banner ---------------- */

function ImpersonationBanner() {
  const [show, setShow] = React.useState(false)
  const [shopName, setShopName] = React.useState('')

  React.useEffect(() => {
    getMe().then((me) => {
      if (me?.role === 'SUPER_ADMIN' && (me as any).impersonating) {
        setShow(true)
        api<{ shopName?: string }>('/api/tenant').then((t) => {
          if (t?.shopName) setShopName(t.shopName)
        }).catch(() => {})
      }
    })
  }, [])

  const stopImpersonation = async () => {
    try {
      await api('/api/admin/stop-impersonation', { method: 'POST' })
      toast.success('تم العودة للوحة الأدمن')
      setTimeout(() => window.location.reload(), 200)
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    }
  }

  if (!show) return null

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-amber-950">
      <div className="flex items-center gap-2 text-xs sm:text-sm">
        <Shield className="size-4 shrink-0" />
        <span className="font-semibold">وضع المسؤول — تتصفح كمالك: {shopName || '...'}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 border-amber-900/30 bg-amber-50 text-xs hover:bg-amber-100"
        onClick={stopImpersonation}
      >
        <LogOut className="size-3" />
        عودة للأدمن
      </Button>
    </div>
  )
}

/* ---------------- Subscription Banner (warning) ---------------- */

function SubscriptionWarningBanner() {
  const [data, setData] = React.useState<{
    expiringSoon: boolean
    daysLeft: number | null
    expired: boolean
    planCode?: string
    planId?: number
  } | null>(null)

  React.useEffect(() => {
    api<any>('/api/subscription')
      .then((d) => setData(d))
      .catch(() => {})
  }, [])

  if (!data || data.expired || !data.expiringSoon) return null

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 bg-amber-400 px-4 py-2 text-amber-950">
      <Clock className="size-4 shrink-0" />
      <span className="text-xs sm:text-sm font-medium flex-1">
        ⏰ اشتراكك ينتهي خلال {data.daysLeft} {data.daysLeft === 1 ? 'يوم' : 'أيام'} — جدد الآن لتجنب الانقطاع
      </span>
      <a
        href="/pricing"
        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-900 px-3 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-800"
      >
        <Sparkles className="size-3.5" />
        تجديد الآن
      </a>
    </div>
  )
}

/* ---------------- Main App ---------------- */

function ModuleLockedView({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-amber-100 p-4 text-amber-600 dark:bg-amber-900/30">
        <Shield className="size-8" />
      </div>
      <h2 className="text-xl font-bold">{label} — غير متاحة في باقتك</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        الميزة دي متاحة في باقة أعلى. يمكنك ترقية اشتراكك لتفعيلها.
      </p>
      <a
        href="/pricing"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Sparkles className="size-4" />
        ترقية الاشتراك
      </a>
    </div>
  )
}

function MainApp() {
  const { activeView, setActiveView } = useViewRouter()
  const user = useShopStore((s) => s.user)
  const shopName = useShopStore((s) => s.shopName)
  const setPlan = useShopStore((s) => s.setPlan)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [subState, setSubState] = React.useState<{ loading: boolean; expired: boolean }> ({
    loading: true,
    expired: false,
  })

  // Check subscription status + hydrate plan context (enabledModules/capabilities/businessType).
  React.useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'EMPLOYEE' || user?.role === 'SUPER_ADMIN') {
      api<any>('/api/subscription')
        .then((d) => {
          if (Array.isArray(d?.enabledModules)) {
            setPlan({
              businessType: d.businessType === 'fashion' ? 'fashion' : 'electronics',
              enabledModules: d.enabledModules,
              capabilities: Array.isArray(d.capabilities) ? d.capabilities : [],
            })
          }
          setSubState({ loading: false, expired: !!d.expired })
        })
        .catch(() => {
          setSubState({ loading: false, expired: true })
        })
    } else {
      setSubState({ loading: false, expired: false })
    }
  }, [user, setPlan])

  const ActiveView = React.useMemo(() => {
    // 🛡️ 2026-09-15 (v2): Defence in depth (layer 3). CRITICAL_MODULES is
    // imported from @/lib/plan-constants (client-safe). Only `settings` and
    // `users` are forced-critical — everything else is gated by the plan's
    // enabledModules. The previous version had a local copy of
    // CRITICAL_MODULES that included every module, which defeated per-plan
    // gating entirely (every plan saw every module regardless of DB config).
    const isAllowed =
      activeView === 'dashboard' ||
      enabledModules.includes(activeView) ||
      (CRITICAL_MODULES as readonly string[]).includes(activeView)

    // Modules not in plan AND not in critical list → show locked view
    if (!isAllowed) {
      return <ModuleLockedView label={VIEW_TITLES[activeView] ?? activeView} />
    }
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />
      case 'pos':
        return <POSView />
      case 'products':
        return <ProductsView />
      case 'sales':
        return <SalesHistoryView />
      case 'maintenance':
        return <MaintenanceView />
      case 'customers':
        return <CustomersView />
      case 'suppliers':
        return <SuppliersView />
      case 'purchases':
        return <PurchaseOrdersView />
      case 'finance':
        return <FinanceView />
      case 'expenses':
        return <ExpensesView />
      case 'cash':
        return <CashView />
      case 'reports':
        return <ReportsView />
      case 'settings':
        return <SettingsView />
      case 'users':
        return <UsersView />
      case 'inventory':
        return <InventoryView />
      case 'branches':
        return <BranchesView />
      default:
        return <DashboardView />
    }
  }, [activeView, enabledModules])

  if (subState.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (subState.expired) {
    return <SubscriptionExpiredScreen />
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <ImpersonationBanner />
      <SubscriptionWarningBanner />

      {/*
        ───────────── Responsive sidebar strategy ─────────────
        < md (< 768px):  Hamburger menu in mobile top bar + Sheet drawer.
                         Content takes full width (no margin).
        md–lg (768-1023px): Icon rail — fixed-right 68px collapsed sidebar.
                         Mobile top bar still visible (h-14 with shop name).
                         Content margin = 68px.
        ≥ lg (≥ 1024px):  Full 260px sidebar.
                         Mobile top bar hidden.
                         Desktop header with LiveClock + ThemeToggle visible.
                         Content margin = 260px.

        We use Tailwind's `md:max-lg:*` (max-lg variant, supported in
        Tailwind v3.4+ and v4) to scope the icon-rail to exactly the md–lg
        range. Below md, neither fixed sidebar is shown.
      */}

      {/* Mobile top bar — shown below lg (covers both mobile + md rail modes) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <span className="font-bold">{shopName}</span>
        <ThemeToggle />
      </header>

      {/* Mobile sidebar (drawer) — below md only */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-[280px] p-0">
          <SheetTitle className="sr-only">القائمة</SheetTitle>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Icon rail sidebar — md to lg only (68px collapsed) */}
      <div className="fixed right-0 top-0 z-40 hidden h-screen md:max-lg:block">
        <Sidebar collapsed />
      </div>

      {/* Desktop sidebar — lg and up (260px full) */}
      <div className="fixed right-0 top-0 z-40 hidden h-screen lg:block">
        <Sidebar />
      </div>

      {/* Right side layout — header (lg only) fixed, content scrolls.
          Margins: none < md, 68px md–lg, 260px lg+. */}
      <div className="flex flex-1 flex-col min-h-0 md:mr-[68px] lg:mr-[260px]">

        {/* Desktop header — outside the scroll area, lg+ only */}
        <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:flex">
          {/* الساعة والتاريخ الحيّين — مقاسها مضبوط على ارتفاع التولبار (h-14) */}
          <LiveClock />
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* منطقة الـ scroll — بس المحتوى يتمرر، الهيدر ما يتأثرش ✅ */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6">
            {/*
              ⚡ Performance: removed AnimatePresence mode="wait" — it was adding
              360ms per navigation (180ms exit + 180ms enter). Now the view
              switches instantly. React.Suspense still shows the spinner while
              the lazy-loaded chunk is being fetched.
            */}
            <React.Suspense fallback={<ViewFallback />}>
              <div key={activeView}>
                {ActiveView}
              </div>
            </React.Suspense>
          </div>

        </div>

      </div>
    </div>
  )
}

/* ---------------- Root ---------------- */

export default function Home() {
  const [bootState, setBootState] = React.useState<'loading' | 'authed' | 'guest'>('loading')
  const setUser = useShopStore((s) => s.setUser)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const user = useShopStore((s) => s.user)
  const router = useRouter()

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      // ⚡ Performance: call getMe() + /api/tenant in PARALLEL instead of
      // sequential. This saves 1 full API roundtrip (~200-500ms).
      const [meResult, tenantResult] = await Promise.allSettled([
        getMe(),
        api<{
          shopName?: string
          phone?: string | null
          address?: string | null
          logoPath?: string | null
          invoicePrefix?: string
        }>('/api/tenant'),
      ])
      if (!alive) return

      const me = meResult.status === 'fulfilled' ? meResult.value : null
      if (me) {
        setUser(me)
        if (me.role === 'SUPER_ADMIN' && !(me as any).impersonating) {
          setBootState('authed')
        } else {
          if (tenantResult.status === 'fulfilled') {
            const t = tenantResult.value
            if (t?.shopName) setShopName(t.shopName)
            setBranding({
              phone: t?.phone ?? null,
              address: t?.address ?? null,
              logoPath: t?.logoPath ?? null,
              invoicePrefix: t?.invoicePrefix || 'INV',
            })
          }
          setBootState('authed')
        }
      } else {
        setBootState('guest')
      }
    })()
    return () => {
      alive = false
    }
  }, [setUser, setShopName, setBranding])

  // The logout button clears `user` in the store directly (see store.ts's
  // `logout` action) without going through this component. Without this
  // effect, `bootState` stayed 'authed' forever after logging out, so the
  // app kept rendering MainApp/SuperAdminApp with a null user instead of
  // returning to the landing/login page — the "logout button doesn't work"
  // bug. This effect brings bootState back in sync whenever the user is
  // cleared.
  React.useEffect(() => {
    if (!user && bootState === 'authed') {
      setBootState('guest')
    }
  }, [user, bootState])

  const handleAuthed = async (u: AuthUser, name?: string) => {
    setUser(u)
    if (u.role === 'SUPER_ADMIN') {
      setBootState('authed')
      return
    }
    if (name) {
      setShopName(name)
    }
    try {
      const t = await api<{
        shopName?: string
        phone?: string | null
        address?: string | null
        logoPath?: string | null
        invoicePrefix?: string
      }>('/api/tenant')
      if (!name && t?.shopName) setShopName(t.shopName)
      setBranding({
        phone: t?.phone ?? null,
        address: t?.address ?? null,
        logoPath: t?.logoPath ?? null,
        invoicePrefix: t?.invoicePrefix || 'INV',
      })
    } catch {
      /* ignore */
    }
    setBootState('authed')
  }

  if (bootState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (bootState === 'guest') {
    return (
      <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-primary" /></div>}>
        <LandingPage onAuthed={handleAuthed} />
      </React.Suspense>
    )
  }

  // Super admin (not impersonating) → SuperAdminApp on /
  if (user?.role === 'SUPER_ADMIN' && !(user as any).impersonating) {
    return (
      <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-primary" /></div>}>
        <SuperAdminApp />
      </React.Suspense>
    )
  }

  // Authed shop user → redirect to /dashboard (proper Next.js route)
  // Each shop page is now a separate route: /dashboard, /products, /settings, etc.
  // This gives us URL routing + code splitting + browser back/forward + bookmarks.
  return <RedirectToDashboard router={router} />
}

// 🛡️ FIX (redirect-loop / Cloudflare 1102): this redirect used to be a
// `window.location.href = '/dashboard'` assignment executed directly in
// Home's render body (not inside an effect). Side effects in a render body
// run on every render, not once — so any unrelated re-render while this
// branch was active (a store update, a slow network response arriving
// late, etc.) fired ANOTHER full hard-reload navigation on top of one
// already in flight. Two navigations racing each other is exactly what
// shows up as "the page keeps loading forever / white screen" — the
// browser keeps cancelling and restarting the page load. Each of those
// hard reloads is also a fresh request to the Worker (session + tenant +
// subscription lookups all over again), so a tight loop of them is what
// can blow through Cloudflare's per-request CPU limit (Error 1102).
//
// Moving the navigation into a `useEffect` that runs exactly once, and
// using the Next.js router (client-side transition, no full reload)
// instead of `window.location.href`, removes both problems.
function RedirectToDashboard({ router }: { router: ReturnType<typeof useRouter> }) {
  React.useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  )
}
