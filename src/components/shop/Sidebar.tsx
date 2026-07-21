'use client'

import * as React from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Wrench,
  Users,
  Truck,
  PackagePlus,
  Wallet,
  ReceiptText,
  Banknote,
  Warehouse,
  Building2,
  BarChart3,
  Settings as SettingsIcon,
  UserCog,
  LogOut,
  Store,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { useShopStore, type ViewKey } from '@/lib/store'

interface NavItem {
  key: ViewKey
  label: string
  icon: LucideIcon
}

const MAIN_GROUP: NavItem[] = [
  { key: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard },
  { key: 'pos', label: 'نقطة البيع', icon: ShoppingCart },
  { key: 'products', label: 'المنتجات', icon: Package },
  { key: 'sales', label: 'سجل المبيعات', icon: Receipt },
  { key: 'maintenance', label: 'الصيانة', icon: Wrench },
  { key: 'customers', label: 'العملاء', icon: Users },
  { key: 'suppliers', label: 'الموردين', icon: Truck },
  { key: 'purchases', label: 'المشتريات', icon: PackagePlus },
  { key: 'inventory', label: 'المخزون', icon: Warehouse },
]

const MANAGE_GROUP: NavItem[] = [
  { key: 'finance', label: 'المعاملات المالية', icon: Wallet },
  { key: 'expenses', label: 'المصروفات', icon: ReceiptText },
  { key: 'cash', label: 'الخزنة', icon: Banknote },
  { key: 'reports', label: 'التقارير', icon: BarChart3 },
  { key: 'settings', label: 'الإعدادات', icon: SettingsIcon },
  { key: 'branches', label: 'الفروع', icon: Building2 },
  { key: 'users', label: 'المستخدمين', icon: UserCog },
]

/* NavButton — sidebar navigation item.
 *
 * Active state: subtle primary-subtle background + primary-subtle-foreground text
 * + a 6×24 primary-colored pill on the right (RTL inner edge).
 *
 * Inactive state: muted-foreground text, transparent bg, hovers to muted bg.
 *
 * The active pill is positioned -right-3 (which in RTL visually appears
 * as a left-edge indicator, but since the sidebar is on the right of the
 * screen, the pill sits on the sidebar's inner edge — closest to the content).
 */
function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem
  active: boolean
  collapsed?: boolean
  onClick?: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-base ease-out',
        'min-h-[44px] text-right',
        active
          ? 'bg-primary-subtle text-primary-subtle-foreground shadow-xs'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -right-2 top-1/2 -translate-y-1/2 h-6 w-1 rounded-l-full bg-primary shadow-sm"
        />
      )}
      <Icon
        className={cn(
          'size-5 shrink-0 transition-colors',
          active
            ? 'text-primary'
            : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  )
}

/* ShopAvatar — branded shop logo with fallback Store icon.
 *
 * Uses the brand gradient (brand-600 → brand-800) for the fallback avatar.
 * The avatar size is fixed at 40px (size-10) so we can use tailwind tokens
 * instead of inline styles — keeps the design system consistent and
 * avoids CSS-in-JS overhead.
 *
 * The fallback includes a subtle top-left white overlay (glass effect)
 * which gives the gradient a more "premium logo" feel without being
 * a separate asset. */
function ShopAvatar({ logoPath }: { logoPath?: string | null }) {
  if (logoPath) {
    return (
      <div className="shrink-0 size-10 overflow-hidden rounded-xl shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoPath}
          alt="شعار المحل"
          className="h-full w-full object-cover"
        />
      </div>
    )
  }
  return (
    <div className="shrink-0 relative flex size-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 shadow-sm ring-1 ring-brand-500/20">
      {/* Glass overlay — top-left white tint for premium feel */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"
      />
      <Store className="relative size-5 text-white" strokeWidth={1.8} />
    </div>
  )
}

/* ThemeToggle — light/dark switch.
 *
 * Reads/writes the `class` strategy via next-themes. Renders both icons
 * with CSS-based crossfade so there's no hydration mismatch. */
function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  const isDark = mounted && theme === 'dark'

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
        className="size-11 self-center flex items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
      >
        {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      <span>{isDark ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
    </button>
  )
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const shopName = useShopStore((s) => s.shopName)
  const logoPath = useShopStore((s) => s.branding?.logoPath)
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-4 border-b border-sidebar-border',
        collapsed && 'justify-center'
      )}
    >
      <ShopAvatar logoPath={logoPath} />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sidebar-foreground font-bold leading-tight tracking-tight">
            {shopName}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">نظام إدارة المحل</p>
        </div>
      )}
    </div>
  )
}

function SidebarFooter({ collapsed }: { collapsed?: boolean }) {
  const logout = useShopStore((s) => s.logout)
  return (
    <div className="flex flex-col gap-2 px-3 py-3 border-t border-sidebar-border">
      <ThemeToggle collapsed={collapsed} />

      {/* Logout button — destructive tonal, no inline styles.
          Uses destructive-subtle for low-emphasis danger (footer action). */}
      <button
        type="button"
        onClick={logout}
        title="تسجيل الخروج"
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-base ease-out',
          'bg-destructive-subtle text-destructive-subtle-foreground hover:bg-destructive hover:text-destructive-foreground',
          'active:scale-[0.98]',
          collapsed ? 'size-11 self-center p-0' : 'py-2.5 px-4'
        )}
      >
        <LogOut className="size-4 shrink-0" />
        {!collapsed && <span>تسجيل الخروج</span>}
      </button>

      {/* System status + brand — only in expanded mode */}
      {!collapsed && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-success">
            {/* Ping dot — green for "system operational".
                Uses tailwind's animate-ping (built-in) instead of custom keyframes. */}
            <span className="relative inline-flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            <span className="truncate">النظام يعمل</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-muted-foreground text-[0.65rem] font-medium opacity-60">
            <Package className="size-3" aria-hidden="true" />
            <span>المتجر</span>
          </div>
        </div>
      )}
    </div>
  )
}

export interface SidebarProps {
  collapsed?: boolean
  onNavigate?: () => void
  className?: string
}

export function Sidebar({ collapsed, onNavigate, className }: SidebarProps) {
  const activeView = useShopStore((s) => s.activeView)
  const setActiveView = useShopStore((s) => s.setActiveView)
  const user = useShopStore((s) => s.user)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const mainItems = MAIN_GROUP.filter((it) => enabledModules.includes(it.key))
  const manageItems = MANAGE_GROUP.filter((it) => enabledModules.includes(it.key))

  const handleNav = (k: ViewKey) => {
    setActiveView(k)
    onNavigate?.()
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-sidebar border-l border-sidebar-border',
        collapsed ? 'w-[68px]' : 'w-[260px]',
        className
      )}
    >
      <Brand collapsed={collapsed} />
      <nav className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            الرئيسية
          </p>
        )}
        <div className="space-y-1">
          {mainItems.map((it) => (
            <NavButton
              key={it.key}
              item={it}
              active={activeView === it.key}
              collapsed={collapsed}
              onClick={() => handleNav(it.key)}
            />
          ))}
        </div>
        {isAdmin && (
          <>
            {!collapsed && (
              <p className="px-3 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                الإدارة
              </p>
            )}
            <div className="space-y-1">
              {manageItems.map((it) => (
                <NavButton
                  key={it.key}
                  item={it}
                  active={activeView === it.key}
                  collapsed={collapsed}
                  onClick={() => handleNav(it.key)}
                />
              ))}
            </div>
          </>
        )}
      </nav>
      <SidebarFooter collapsed={collapsed} />
    </aside>
  )
}
