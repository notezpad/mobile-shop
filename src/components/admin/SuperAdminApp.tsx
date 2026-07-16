'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Store,
  Bell,
  Package,
  Ticket,
  Wallet,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Shield,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useShopStore } from '@/lib/store'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { AdminDashboardView } from './AdminDashboardView'
import { AdminTenantsView } from './AdminTenantsView'
import { AdminSubscriptionsView } from './AdminSubscriptionsView'
import { AdminPlansView } from './AdminPlansView'
import { AdminCodesView } from './AdminCodesView'
import { AdminFinanceView } from './AdminFinanceView'
import { AdminSettingsView } from './AdminSettingsView'

type AdminView =
  | 'dashboard'
  | 'tenants'
  | 'subscriptions'
  | 'plans'
  | 'codes'
  | 'finance'
  | 'settings'

const NAV: { key: AdminView; label: string; icon: any; group: string }[] = [
  { key: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard, group: 'الرئيسية' },
  { key: 'tenants', label: 'المحلات المشتركة', icon: Store, group: 'العملاء' },
  { key: 'subscriptions', label: 'الاشتراكات', icon: Bell, group: 'الاشتراكات' },
  { key: 'plans', label: 'خطط الاشتراك', icon: Package, group: 'الباقات' },
  { key: 'codes', label: 'أكواد الاشتراك', icon: Ticket, group: 'أكواد التفعيل' },
  { key: 'finance', label: 'الإيرادات', icon: Wallet, group: 'المالية' },
  { key: 'settings', label: 'إعدادات المنصة', icon: SettingsIcon, group: 'الإعدادات' },
]

const VIEW_TITLES: Record<AdminView, string> = {
  dashboard: 'لوحة المعلومات',
  tenants: 'المحلات المشتركة',
  subscriptions: 'الاشتراكات',
  plans: 'خطط الاشتراك',
  codes: 'أكواد الاشتراك',
  finance: 'الإيرادات',
  settings: 'إعدادات المنصة',
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
      className="size-9 text-slate-300 hover:bg-slate-700/50 hover:text-white"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title="تبديل السمة"
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function AdminSidebar({
  active,
  onChange,
  expiringCount,
  onNavigate,
  className,
}: {
  active: AdminView
  onChange: (v: AdminView) => void
  expiringCount: number
  onNavigate?: () => void
  className?: string
}) {
  const user = useShopStore((s) => s.user)
  const logout = useShopStore((s) => s.logout)

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-slate-900 text-slate-100',
        'w-[260px]',
        className
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Shield className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">منصة إدارة المحلات</p>
          <Badge className="mt-0.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/20 hover:text-amber-300 px-1.5 py-0 text-[10px]">
            لوحة الأدمن
          </Badge>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV.map((it) => {
          const Icon = it.icon
          const isActive = active === it.key
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => {
                onChange(it.key)
                onNavigate?.()
              }}
              className={cn(
                'group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                'min-h-[44px] text-right mb-1',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1 truncate">{it.label}</span>
              {it.key === 'subscriptions' && expiringCount > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-destructive/20 text-destructive'
                  )}
                >
                  {expiringCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-800 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 text-sm font-bold">
            {user?.name?.trim()?.charAt(0) ?? 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
            <p className="truncate text-[11px] text-slate-400" dir="ltr">
              {user?.email}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="تسجيل الخروج"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-destructive/20 hover:text-destructive"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

export function SuperAdminApp() {
  const [active, setActive] = React.useState<AdminView>('dashboard')
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [expiringCount, setExpiringCount] = React.useState(0)
  const user = useShopStore((s) => s.user)

  // Fetch expiring count for sidebar badge
  const loadExpiring = React.useCallback(async () => {
    try {
      const data = await api<{ expiringWithin7Days: number }>('/api/admin/stats')
      setExpiringCount(data.expiringWithin7Days ?? 0)
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    loadExpiring()
  }, [loadExpiring])

  const ActiveView = React.useMemo(() => {
    switch (active) {
      case 'dashboard':
        return <AdminDashboardView />
      case 'tenants':
        return <AdminTenantsView />
      case 'subscriptions':
        return <AdminSubscriptionsView />
      case 'plans':
        return <AdminPlansView />
      case 'codes':
        return <AdminCodesView />
      case 'finance':
        return <AdminFinanceView />
      case 'settings':
        return <AdminSettingsView />
      default:
        return <AdminDashboardView />
    }
  }, [active])

  // Touch user to avoid lint warning when not directly used in main render
  void user

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-3 text-slate-100 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-slate-300 hover:bg-slate-800"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <span className="font-bold">منصة الأدمن</span>
        <ThemeToggle />
      </header>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-[280px] border-0 bg-slate-900 p-0">
          <SheetTitle className="sr-only">قائمة الأدمن</SheetTitle>
          <AdminSidebar
            active={active}
            onChange={setActive}
            expiringCount={expiringCount}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <div className="sticky top-0 hidden h-screen lg:block">
          <AdminSidebar
            active={active}
            onChange={setActive}
            expiringCount={expiringCount}
          />
        </div>

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
          {/* Desktop header */}
          <header className="sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-slate-800 dark:bg-slate-900/95 lg:flex">
            <div>
              <h2 className="text-sm font-bold">{VIEW_TITLES[active]}</h2>
              <p className="text-xs text-muted-foreground">منصة إدارة المحلات</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <Shield className="size-3" />
                أدمن أعلى
              </Badge>
              <ThemeToggle />
            </div>
          </header>

          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {ActiveView}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="mt-auto border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-900 lg:px-6">
            © {new Date().getFullYear()} منصة إدارة المحلات — لوحة الأدمن الأعلى
          </footer>
        </main>
      </div>
    </div>
  )
}
