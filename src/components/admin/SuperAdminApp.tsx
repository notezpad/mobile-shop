'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
      className="size-9 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
  collapsed = false,
  className,
}: {
  active: AdminView
  onChange: (v: AdminView) => void
  expiringCount: number
  onNavigate?: () => void
  /** Render the sidebar in icon-rail mode (68px wide, no labels). */
  collapsed?: boolean
  className?: string
}) {
  const user = useShopStore((s) => s.user)
  const logout = useShopStore((s) => s.logout)

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground',
        collapsed ? 'w-[68px]' : 'w-[260px]',
        className
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center gap-3 border-b border-sidebar-border px-4 py-5',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Shield className="size-6" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">منصة إدارة المحلات</p>
            <Badge className="mt-0.5 bg-warning-subtle text-warning-subtle-foreground hover:bg-warning-subtle hover:text-warning-subtle-foreground px-1.5 py-0 text-[10px]">
              لوحة الأدمن
            </Badge>
          </div>
        )}
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
              title={collapsed ? it.label : undefined}
              onClick={() => {
                onChange(it.key)
                onNavigate?.()
              }}
              className={cn(
                'group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                'min-h-[44px] mb-1',
                collapsed ? 'justify-center px-0' : 'text-right',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
              {it.key === 'subscriptions' && expiringCount > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    collapsed && 'absolute -left-1 top-1 px-1 py-0',
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
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col gap-1')}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-subtle text-warning-subtle-foreground text-sm font-bold">
            {user?.name?.trim()?.charAt(0) ?? 'A'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                {user?.email}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            title="تسجيل الخروج"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

export function SuperAdminApp() {
  // 🛡️ 2026-09-17 (v2): URL-based routing for admin views.
  // Read the active view from ?view=X query param so that:
  //   - Refresh preserves the current page ✓
  //   - Back/forward buttons work ✓
  //   - User can bookmark a specific admin page ✓
  //   - URL is shareable ✓
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlView = searchParams.get('view') as AdminView | null
  const active: AdminView = (urlView && NAV.some(n => n.key === urlView)) ? urlView : 'dashboard'

  const setActive = React.useCallback((view: AdminView) => {
    const params = new URLSearchParams(window.location.search)
    if (view === 'dashboard') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    const qs = params.toString()
    router.push(qs ? `/?${qs}` : '/')
  }, [router])
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
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {/*
        ───────────── Responsive sidebar strategy (matches shop app) ─────────────
        < md (< 768px):  Hamburger menu + Sheet drawer (full Sidebar).
        md–lg (768–1023px): Icon rail — 68px collapsed sidebar.
        ≥ lg (≥ 1024px):  Full 260px sidebar.

        We use Tailwind's `md:max-lg:*` max-variant (Tailwind v3.4+, supported in v4)
        to scope the icon-rail to exactly the md–lg range.
      */}

      {/* Mobile top bar — shown below lg (covers both mobile + md rail modes) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:bg-sidebar-accent"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <span className="font-bold">{VIEW_TITLES[active]}</span>
        <ThemeToggle />
      </header>

      {/* Mobile sidebar (drawer) — below md only */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-[280px] border-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">قائمة الأدمن</SheetTitle>
          <AdminSidebar
            active={active}
            onChange={setActive}
            expiringCount={expiringCount}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Icon rail sidebar — md to lg only (68px collapsed) */}
      <div className="fixed right-0 top-0 z-40 hidden h-screen md:max-lg:block">
        <AdminSidebar
          active={active}
          onChange={setActive}
          expiringCount={expiringCount}
          collapsed
        />
      </div>

      {/* Desktop sidebar — lg and up (260px full) */}
      <div className="fixed right-0 top-0 z-40 hidden h-screen lg:block">
        <AdminSidebar
          active={active}
          onChange={setActive}
          expiringCount={expiringCount}
        />
      </div>

      {/* Main content — margin adapts: none < md, 68px md–lg, 260px lg+.
          On mobile/tablet this div is in normal flex flow.
          On md+ the fixed sidebar floats to the right (RTL), so we use
          md:mr-[68px] lg:mr-[260px] to make room. */}
      <main className="flex flex-1 flex-col bg-background min-h-0 md:mr-[68px] lg:mr-[260px]">
        {/* Desktop header — outside the scroll area, lg+ only */}
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-sidebar-border dark:bg-background/95 lg:flex">
          <div>
            <h2 className="text-sm font-bold">{VIEW_TITLES[active]}</h2>
            <p className="text-xs text-muted-foreground">منصة إدارة المحلات</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 border-warning-subtle bg-warning-subtle text-warning-subtle-foreground dark:text-warning-subtle-foreground">
              <Shield className="size-3" />
              أدمن أعلى
            </Badge>
            <ThemeToggle />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
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

        <footer className="mt-auto border-t border-border bg-background px-4 py-3 text-center text-xs text-muted-foreground dark:border-sidebar-border dark:bg-sidebar lg:px-6">
          © {new Date().getFullYear()} منصة إدارة المحلات — لوحة الأدمن الأعلى
        </footer>
      </main>
    </div>
  )
}
