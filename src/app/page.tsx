'use client'

import * as React from 'react'
import {
  Menu,
  Moon,
  Sun,
  Loader2,
  Shield,
  LogOut,
  AlertTriangle,
  KeyRound,
  Clock,
} from 'lucide-react'
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
import { DashboardView } from '@/components/shop/DashboardView'
import { POSView } from '@/components/shop/POSView'
import { ProductsView } from '@/components/shop/ProductsView'
import { SalesHistoryView } from '@/components/shop/SalesHistoryView'
import { MaintenanceView } from '@/components/shop/MaintenanceView'
import { CustomersView } from '@/components/shop/CustomersView'
import { SuppliersView } from '@/components/shop/SuppliersView'
import { PurchaseOrdersView } from '@/components/shop/PurchaseOrdersView'
import { FinanceView } from '@/components/shop/FinanceView'
import { ExpensesView } from '@/components/shop/ExpensesView'
import { CashView } from '@/components/shop/CashView'
import { ReportsView } from '@/components/shop/ReportsView'
import { SettingsView } from '@/components/shop/SettingsView'
import { UsersView } from '@/components/shop/UsersView'
import { InventoryView } from '@/components/shop/InventoryView'
import { BranchesView } from '@/components/shop/BranchesView'
import { SuperAdminApp } from '@/components/admin/SuperAdminApp'
import { LandingPage } from '@/components/landing/LandingPage'
import { useShopStore } from '@/lib/store'
import { api } from '@/lib/api'
import { getMe, type AuthUser } from '@/lib/auth-client'
import { toast } from 'sonner'

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
  expenses: 'المصروفات',
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
  if (!mounted) return <div className="size-9" />
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title="تبديل السمة"
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
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
              <p className="text-xs opacity-90">يرجى تفعيل كود اشتراك جديد للمتابعة</p>
            </div>
            <div className="space-y-4 p-6">
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
                onClick={() => {
                  logout()
                  setTimeout(() => window.location.reload(), 200)
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
      <span className="text-xs sm:text-sm font-medium">
        ⏰ اشتراكك ينتهي خلال {data.daysLeft} {data.daysLeft === 1 ? 'يوم' : 'أيام'} — جدد الآن لتجنب الانقطاع
      </span>
    </div>
  )
}

/* ---------------- Main App ---------------- */

function ModuleLockedView({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <div className="rounded-full bg-amber-100 p-4 text-amber-600 dark:bg-amber-900/30">
        <Shield className="size-8" />
      </div>
      <h2 className="text-xl font-bold">{label} — غير متاحة في باقتك</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        الميزة دي متاحة في باقة أعلى. يمكنك ترقية اشتراكك من إعدادات الحساب لتفعيلها.
      </p>
    </div>
  )
}

function MainApp() {
  const activeView = useShopStore((s) => s.activeView)
  const user = useShopStore((s) => s.user)
  const shopName = useShopStore((s) => s.shopName)
  const setPlan = useShopStore((s) => s.setPlan)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [subState, setSubState] = React.useState<{ loading: boolean; expired: boolean }> ({
    loading: true,
    expired: false,
  })

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

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
    // Guard: employees can't see admin-only views
    if (
      !isAdmin &&
      ['finance', 'expenses', 'cash', 'reports', 'settings', 'users', 'branches'].includes(activeView)
    ) {
      return <DashboardView />
    }
    // Defence-in-depth: even if a user manually flips activeView, block modules not in plan.
    if (!enabledModules.includes(activeView) && activeView !== 'dashboard') {
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
  }, [activeView, isAdmin, enabledModules])

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

      {/* Mobile top bar */}
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

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-[280px] p-0">
          <SheetTitle className="sr-only">القائمة</SheetTitle>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/*
        ✅ نفس أسلوب WorkerOS:
        - السايدبار: position fixed على اليمين — خارج الـ flex flow
        - الـ main: margin-right بعرض السايدبار + overflow-y-auto
        - النتيجة: شريط التمرير على أقصى اليسار (RTL طبيعي) ✅
      */}

      {/* Desktop sidebar — fixed right */}
      <div className="fixed right-0 top-0 hidden h-screen lg:block z-40">
        <Sidebar />
      </div>

      {/* Right side layout — header fixed, content scrolls */}
      <div className="flex flex-1 flex-col min-h-0 lg:mr-[260px]">

        {/* Desktop header — خارج منطقة الـ scroll ✅ */}
        <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:flex">
          {/* الساعة والتاريخ الحيّين — مقاسها مضبوط على ارتفاع التولبار (h-14) */}
          <LiveClock />
          <div className="flex items-center gap-2">
            {user && (
              <span className="text-xs text-muted-foreground">مرحباً، {user.name}</span>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* منطقة الـ scroll — بس المحتوى يتمرر، الهيدر ما يتأثرش ✅ */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {ActiveView}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground lg:px-6">
            © {new Date().getFullYear()} {shopName} — نظام إدارة المحل
          </footer>
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

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      const me = await getMe()
      if (!alive) return
      if (me) {
        setUser(me)
        if (me.role === 'SUPER_ADMIN' && !(me as any).impersonating) {
          // Super admin (not impersonating) — no shop name needed
          setBootState('authed')
        } else {
          // load tenant shop name + branding (logo/phone/address/invoice prefix)
          try {
            const t = await api<{
              shopName?: string
              phone?: string | null
              address?: string | null
              logoPath?: string | null
              invoicePrefix?: string
            }>('/api/tenant')
            if (t?.shopName) setShopName(t.shopName)
            setBranding({
              phone: t?.phone ?? null,
              address: t?.address ?? null,
              logoPath: t?.logoPath ?? null,
              invoicePrefix: t?.invoicePrefix || 'INV',
            })
          } catch {
            /* ignore — maybe expired */
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
    return <LandingPage onAuthed={handleAuthed} />
  }

  // Render based on role
  if (user?.role === 'SUPER_ADMIN' && !(user as any).impersonating) {
    return <SuperAdminApp />
  }

  return <MainApp />
}
