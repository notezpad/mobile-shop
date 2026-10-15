'use client'

/**
 * Sidebar — Premium 2026 Edition
 * ==================================================
 * Re-designed to match the rest of the in-app pages:
 *  • Brand block with gradient ring + glow on the avatar
 *  • Section labels (uppercase, letter-spaced, muted)
 *  • Nav items with: hover lift, active emerald tint + right rail + glow
 *  • Inventory sub-group with collapsible children and color dots
 *  • Footer card: "النظام يعمل" status + plan pill + logout button
 *  • Collapsed mode (md–lg): 64px icon rail with tooltips
 *
 * All colors come from the design tokens already defined in globals.css:
 *   --sidebar, --sidebar-foreground, --sidebar-accent, --sidebar-border,
 *   --primary, --primary-subtle, --brand-500/600, --success, --destructive
 *
 * Keeps the existing API (props: collapsed, onNavigate, className) and the
 * existing module-gating logic from useShopStore + plan-constants.
 */

import * as React from 'react'
import { useVocab, foodTerm } from '@/lib/vocab'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, Wrench, Users, Truck,
  PackagePlus, Wallet, ReceiptText, Banknote, Warehouse, Building2,
  BarChart3, Settings as SettingsIcon, UserCog, Power, ChevronLeft, Store, Plus, BookOpen,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import type { ViewKey } from '@/lib/store'
import { preloadView, shouldSkipPreload } from '@/lib/view-preload'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CRITICAL_MODULES } from '@/lib/plan-constants'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  module: ViewKey
  /** Optional tint accent for the icon (defaults to primary emerald). */
  accent?: string
}

/**
 * Inventory sub-pages — each keeps its own color identity (matches the
 * page-level hero tints in InventoryView/MovementsPage/TransfersPage/
 * StocktakePage so the sidebar dot == the page accent).
 */
const INVENTORY_CHILDREN: { path: string; label: string; color: string }[] = [
  { path: '/inventory', label: 'حالة المخزون', color: '#10b981' },
  { path: '/inventory/movements', label: 'الحركات', color: '#0ea5e9' },
  { path: '/inventory/transfers', label: 'التحويلات', color: '#f59e0b' },
  { path: '/inventory/stocktake', label: 'الجرد', color: '#0d9488' },
]

const MAIN_GROUP: NavItem[] = [
  { path: '/dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard, module: 'dashboard' },
  { path: '/pos', label: 'نقطة البيع', icon: ShoppingCart, module: 'pos' },
  { path: '/products', label: 'المنتجات', icon: Package, module: 'products' },
  { path: '/sales', label: 'سجل المبيعات', icon: Receipt, module: 'sales' },
  { path: '/maintenance', label: 'الصيانة', icon: Wrench, module: 'maintenance' },
  { path: '/customers', label: 'العملاء', icon: Users, module: 'customers' },
  { path: '/suppliers', label: 'الموردين', icon: Truck, module: 'suppliers' },
  { path: '/purchases', label: 'المشتريات', icon: PackagePlus, module: 'purchases' },
]

const MANAGE_GROUP: NavItem[] = [
  { path: '/guide', label: 'دليل الاستخدام', icon: BookOpen, module: 'guide' },
  { path: '/finance', label: 'المعاملات المالية', icon: Wallet, module: 'finance' },
  { path: '/expenses', label: 'المصروفات', icon: ReceiptText, module: 'expenses' },
  { path: '/cash', label: 'الخزنة', icon: Banknote, module: 'cash' },
  { path: '/reports', label: 'التقارير', icon: BarChart3, module: 'reports' },
  { path: '/branches', label: 'الفروع', icon: Building2, module: 'branches' },
  { path: '/users', label: 'المستخدمين', icon: UserCog, module: 'users' },
  { path: '/settings', label: 'الإعدادات', icon: SettingsIcon, module: 'settings' },
]

/* ───────────────────────── helpers ───────────────────────── */

function useActivePath() {
  const pathname = usePathname() ?? ''
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')
  return { pathname, isActive }
}

/* ───────────────────────── NavButton ───────────────────────── */

function NavButton({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const t = useVocab()
  const Icon = item.icon

  // ⚡ PERF FIX: التنزيل يبدأ من لحظة اللمس/الهوفر بدل الانتظار بعد الكليك.
  // (راجع src/lib/view-preload.ts للشرح الكامل للسلسلة المتسلسلة)
  const warmup = React.useCallback(() => {
    if (!shouldSkipPreload()) preloadView(item.path)
  }, [item.path])

  const linkEl = (
    <Link
      prefetch
      href={item.path}
      onMouseEnter={warmup}
      onPointerDown={warmup}
      onFocus={warmup}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        // base
        'group relative flex w-full items-center gap-3 rounded-xl text-right transition-all duration-base ease-out',
        'min-h-[40px] px-3 py-1.5 text-sm font-medium',
        // active vs default
        active
          ? 'bg-primary-subtle text-primary-subtle-foreground'
          : [
              'text-sidebar-foreground/70',
              'hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
            ].join(' '),
        collapsed && 'justify-center px-0',
      )}
    >
      <span
        className={cn(
          'relative grid place-items-center size-8 shrink-0 rounded-lg transition-all duration-base',
          active
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground/75 group-hover:text-sidebar-accent-foreground group-hover:bg-sidebar-accent/80',
        )}
      >
        {/* subtle ring on hover for affordance */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 rounded-lg ring-1 transition-opacity',
            active ? 'opacity-0' : 'ring-foreground/5 opacity-0 group-hover:opacity-100',
          )}
        />
        <Icon
          strokeWidth={active ? 2.2 : 2}
          className="size-[18px]"
        />
      </span>

      {!collapsed && (
        <span className="flex-1 truncate">{t(item.label)}</span>
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {t(item.label)}
        </TooltipContent>
      </Tooltip>
    )
  }

  return linkEl
}

/* ───────────────────────── Inventory group (collapsible) ───────────────────────── */

function InventoryGroup({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { pathname, isActive } = useActivePath()
  const inInventory = pathname.startsWith('/inventory')
  const parentActive = pathname === '/inventory'

  // Auto-open when entering inventory from outside, but respect manual close
  // when navigating *between* inventory sub-pages.
  const [open, setOpen] = React.useState(inInventory)
  const wasInInventory = React.useRef(inInventory)
  React.useEffect(() => {
    if (inInventory && !wasInInventory.current) setOpen(true)
    wasInInventory.current = inInventory
  }, [inInventory])

  // ⚡ PERF FIX: warm-up موحّد لكل روابط المخزون (راجع src/lib/view-preload.ts)
  const warmInventory = React.useCallback(() => {
    if (!shouldSkipPreload()) preloadView('/inventory')
  }, [])

  /* ── Collapsed mode: single icon link + tooltip ── */
  if (collapsed) {
    const linkEl = (
      <Link
        prefetch
        href="/inventory"
        onMouseEnter={warmInventory}
        onPointerDown={warmInventory}
        onFocus={warmInventory}
        onClick={onNavigate}
        aria-label="المخزون"
        className={cn(
          'group relative grid size-10 place-items-center rounded-xl transition-all duration-base',
          inInventory
            ? 'bg-primary-subtle text-primary-subtle-foreground ring-1 ring-primary/15'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        )}
      >
        {inInventory && (
          <span
            aria-hidden
            className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-l-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-[0_0_8px_0px] shadow-brand-500/60"
          />
        )}
        <Warehouse
          strokeWidth={inInventory ? 2.4 : 2}
          className={cn('size-[18px]', inInventory && 'text-primary')}
        />
      </Link>
    )
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          المخزون
        </TooltipContent>
      </Tooltip>
    )
  }

  /* ── Expanded mode: parent row with chevron + collapsible children ── */
  return (
    <div className="relative">
      {/* Parent row: click navigates to /inventory, (+) toggles children */}
      <div
        className={cn(
          'group relative flex w-full items-center rounded-xl transition-all duration-base',
          'min-h-[40px] text-right',
          parentActive
            ? 'bg-primary-subtle text-primary-subtle-foreground ring-1 ring-primary/15 shadow-[0_2px_8px_-2px_rgba(16,185,129,0.18)]'
            : inInventory
              ? 'bg-sidebar-accent/60 text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        )}
      >
        {(parentActive || inInventory) && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-l-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-[0_0_8px_0px] shadow-brand-500/60"
          />
        )}

        <Link
          prefetch
          href="/inventory"
          onMouseEnter={warmInventory}
          onPointerDown={warmInventory}
          onFocus={warmInventory}
          onClick={onNavigate}
          aria-current={parentActive ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5"
        >
          <span
            className={cn(
              'relative grid place-items-center size-8 shrink-0 rounded-lg transition-all',
              parentActive || inInventory
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground/75 group-hover:text-sidebar-accent-foreground group-hover:bg-sidebar-accent/80',
            )}
          >
            <Warehouse
              strokeWidth={parentActive || inInventory ? 2.4 : 2}
              className={cn('size-[18px]', (parentActive || inInventory) && 'text-primary')}
            />
          </span>
          <span className="flex-1 truncate text-sm font-medium">المخزون</span>
        </Link>

        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'إخفاء صفحات المخزون' : 'إظهار صفحات المخزون'}
          className={cn(
            'group/toggle me-1.5 flex size-7 shrink-0 items-center justify-center rounded-md transition-all',
            'active:scale-90',
            inInventory || open
              ? 'bg-primary/10 text-primary ring-1 ring-primary/15'
              : 'text-muted-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          <Plus
            className={cn(
              'size-3.5 transition-transform duration-base ease-out',
              open && 'rotate-45',
            )}
          />
        </button>
      </div>

      {/* Children — display:none toggling for zero-empty-space collapse */}
      <div
        style={{ display: open ? 'block' : 'none' }}
        className={open ? 'submenu-in' : undefined}
      >
        <div className="relative ms-[26px] mt-1 space-y-0.5 border-s border-sidebar-border/70 ps-3 pt-1 pb-1">
          {INVENTORY_CHILDREN.map((child) => {
            const active = pathname === child.path
            return (
              <Link
                key={child.path}
                prefetch
                href={child.path}
                onMouseEnter={() => shouldSkipPreload() || preloadView(child.path)}
                onPointerDown={() => shouldSkipPreload() || preloadView(child.path)}
                onFocus={() => shouldSkipPreload() || preloadView(child.path)}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                style={
                  {
                    '--dot': child.color,
                  } as React.CSSProperties
                }
                className={cn(
                  'group/child relative flex min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all',
                  active
                    ? 'font-bold'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                )}
              >
                {/* Active tint background using the child's color */}
                {active && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-lg"
                    style={{
                      backgroundColor: `${child.color}14`,
                      boxShadow: `inset 0 0 0 1px ${child.color}33`,
                    }}
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    'relative size-2 shrink-0 rounded-full transition-transform',
                    active ? 'scale-110' : 'scale-90 opacity-60 group-hover/child:opacity-100',
                  )}
                  style={{ backgroundColor: 'var(--dot)' }}
                />
                <span className="relative truncate">{child.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute -start-[13px] top-1/2 size-1.5 -translate-y-1/2 rounded-full ring-4 ring-sidebar"
                    style={{ backgroundColor: 'var(--dot)' }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Brand block ───────────────────────── */

function ShopAvatar({ logoPath, collapsed }: { logoPath?: string | null; collapsed?: boolean }) {
  if (logoPath) {
    return (
      <div
        className={cn(
          'shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-sidebar-border',
          collapsed ? 'size-10' : 'size-11',
        )}
      >
        <img src={logoPath} alt="شعار المحل" className="h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-2xl',
        'bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800',
        'shadow-md ring-1 ring-brand-400/30',
        collapsed ? 'size-10' : 'size-11',
      )}
    >
      {/* subtle inner glow */}
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/20"
      />
      <Store className="relative size-5 text-white" strokeWidth={1.9} />
    </div>
  )
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const shopName = useShopStore((s) => s.shopName)
  const logoPath = useShopStore((s) => s.branding?.logoPath)
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-sidebar-border px-4 py-3',
        collapsed && 'justify-center px-0',
      )}
    >
      <ShopAvatar logoPath={logoPath} collapsed={collapsed} />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p
            className="line-clamp-2 text-[17px] font-bold leading-[1.3] text-sidebar-foreground"
            style={{ fontFamily: 'var(--font-brand), var(--font-cairo), sans-serif' }}
            title={shopName}
          >
            {shopName}
          </p>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Section label ───────────────────────── */

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="select-none px-3 pb-1.5 pt-1 text-[11px] font-bold text-muted-foreground/70">
      {label}
    </p>
  )
}

/* ───────────────────────── Footer ───────────────────────── */

/* بداية الجلسة = وقت تحميل التطبيق (واحد لكل النسخ: عادي / مطوي / موبايل) */
const SESSION_START = typeof window === 'undefined' ? 0 : Date.now()
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** حالة الشبكة الحقيقية من المتصفح — من غير أي ريكويست للسيرفر */
function subscribeNetwork(cb: () => void) {
  const conn = (navigator as any).connection
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  conn?.addEventListener?.('change', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
    conn?.removeEventListener?.('change', cb)
  }
}
function networkSnapshot() {
  const conn = (navigator as any).connection
  return `${navigator.onLine ? 1 : 0}|${conn?.effectiveType ?? ''}`
}

function useNetwork() {
  const snap = React.useSyncExternalStore(subscribeNetwork, networkSnapshot, () => '1|')
  const [on, type] = snap.split('|')
  const online = on === '1'
  const bars = !online ? 0 : type === 'slow-2g' ? 1 : type === '2g' ? 2 : type === '3g' ? 3 : 4
  return { online, bars, type: type ? type.toUpperCase().replace('SLOW-', '') : 'LIVE' }
}

function useSessionClock() {
  const [secs, setSecs] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setSecs(Math.floor((Date.now() - SESSION_START) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(secs / 3600))}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}`
}

function Led({ online }: { online: boolean }) {
  const c = online ? 'bg-emerald-400' : 'bg-amber-400'
  return (
    <span className="relative grid size-7 shrink-0 place-items-center">
      {online && <span className={cn('absolute inline-flex size-3 animate-ping rounded-full opacity-60', c)} />}
      <span
        className={cn('relative inline-flex size-2.5 rounded-full', c)}
        style={{ boxShadow: `0 0 6px 0 ${online ? 'rgba(52,211,153,.6)' : 'rgba(251,191,36,.55)'}` }}
      />
    </span>
  )
}

function SignalBars({ level }: { level: number }) {
  return (
    <span aria-hidden dir="ltr" className="flex h-4 shrink-0 items-end gap-[3px]">
      {[5, 8, 11, 14].map((h, i) => (
        <span
          key={h}
          className={cn('w-[3px] rounded-[1px] transition-colors', i < level ? 'bg-emerald-500' : 'bg-foreground/15')}
          style={{ height: h }}
        />
      ))}
    </span>
  )
}

function StatusCard({ collapsed }: { collapsed?: boolean }) {
  const { online, bars } = useNetwork()
  const clock = useSessionClock()
  const label = online ? 'متصل بالسيرفر' : 'غير متصل'

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="grid size-11 place-items-center rounded-xl border border-sidebar-border bg-muted/50">
              <Led online={online} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            {label} · {clock}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex h-10 items-center gap-1.5 rounded-xl border border-sidebar-border bg-muted/50 px-2">
      <Led online={online} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-foreground">{label}</span>
      {online && (
        <span dir="ltr" className="text-[10.5px] tabular-nums text-muted-foreground" style={{ fontFamily: MONO }}>
          {clock}
        </span>
      )}
      <SignalBars level={bars} />
    </div>
  )
}

function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  const logout = useShopStore((s) => s.logout)

  const iconTile = (size: string) => (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white ring-1 ring-white/20',
        'shadow-[0_4px_10px_-3px_rgba(239,68,68,0.65)] transition-transform duration-base group-hover:scale-105',
        size,
      )}
    >
      <Power className="size-4" strokeWidth={2.4} />
    </span>
  )

  const btn = (
    <button
      type="button"
      onClick={logout}
      aria-label="تسجيل الخروج"
      className={cn(
        'group relative flex w-full items-center overflow-hidden rounded-2xl border transition-all duration-base ease-out',
        'border-red-500/30 bg-gradient-to-l from-red-500/12 to-red-500/[0.03] text-red-600 dark:text-red-400',
        'hover:border-red-500 hover:from-red-600 hover:to-red-500 hover:text-white',
        'hover:shadow-[0_10px_24px_-10px_rgba(239,68,68,0.7)] active:scale-[0.985]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50',
        collapsed ? 'size-11 justify-center rounded-xl' : 'min-h-[44px] gap-3 p-1.5 pe-3',
      )}
    >
      {collapsed ? iconTile('size-8') : (
        <>
          {iconTile('size-8')}
          <span className="flex-1 text-right text-sm font-bold">تسجيل الخروج</span>
          <ChevronLeft className="size-4 opacity-50 transition-transform duration-base group-hover:-translate-x-1 group-hover:opacity-100" />
        </>
      )}
    </button>
  )

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            تسجيل الخروج
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }
  return btn
}

function SidebarFooter({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="space-y-1.5 border-t border-sidebar-border px-2.5 py-2.5">
      <LogoutButton collapsed={collapsed} />
      <StatusCard collapsed={collapsed} />
    </div>
  )
}

/* ───────────────────────── Main Sidebar ───────────────────────── */

export interface SidebarProps {
  collapsed?: boolean
  onNavigate?: () => void
  className?: string
}

export function Sidebar({ collapsed, onNavigate, className }: SidebarProps) {
  const { isActive } = useActivePath()
  const navRef = React.useRef<HTMLElement>(null)
  const [moreBelow, setMoreBelow] = React.useState(false)

  // لو في عناصر تحت لسه ما ظهرتش: نضيف تلاشي أسفل القايمة يدل على السكرول
  const measure = React.useCallback(() => {
    const el = navRef.current
    if (!el) return
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 6)
  }, [])
  React.useEffect(() => {
    const el = navRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    Array.from(el.children).forEach((c) => ro.observe(c))
    return () => ro.disconnect()
  }, [measure])
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const user = useShopStore((s) => s.user)

  // 🔑 RBAC: تحديد إمكانية الوصول للموديول
  // - المدير: يشوف كل ما تسمح به الباقة
  // - الموظف بدون permissions: يشوف كل ما تسمح به الباقة (الوضع الافتراضي)
  // - الموظف بـ permissions: يشوف الـ permissions الخاصة بيه فقط
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const userPermissions = (!isAdmin && user?.permissions && user.permissions.length > 0)
    ? user.permissions
    : null

  const planHasModule = (key: string) =>
    enabledModules.includes(key) ||
    (CRITICAL_MODULES as readonly string[]).includes(key)

  const hasModule = (key: string) => {
    if (!planHasModule(key)) return false    // الباقة مش بتسمح → مخفي دايمًا
    if (userPermissions) return userPermissions.includes(key) // موظف بصلاحيات محددة
    return true  // مدير أو موظف بكل الصلاحيات
  }

  const mainItems = MAIN_GROUP.filter((it) => hasModule(it.module))
  const manageItems = MANAGE_GROUP.filter((it) => hasModule(it.module))
  const showInventory = hasModule('inventory')

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex h-full flex-col bg-sidebar border-l border-sidebar-border',
          'relative isolate',
          collapsed ? 'w-[68px]' : 'w-[260px]',
          className,
        )}
      >
        {/* Subtle ambient glow at the top — adds depth without distracting */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-brand-500/[0.04] to-transparent"
        />

        <Brand collapsed={collapsed} />

        <nav
          ref={navRef}
          onScroll={measure}
          style={
            moreBelow
              ? {
                  WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 36px), transparent)',
                  maskImage: 'linear-gradient(to bottom, #000 calc(100% - 36px), transparent)',
                }
              : undefined
          }
          className={cn(
            'sidebar-nav flex-1 overflow-y-auto overflow-x-hidden',
            'px-2 py-2.5',
          )}
          aria-label="القائمة الرئيسية"
        >
          {/* Main section */}
          {!collapsed && <SectionLabel label="الرئيسية" />}
          <div className="space-y-0.5">
            {mainItems.map((it) => (
              <NavButton
                key={it.path}
                item={it}
                active={isActive(it.path)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
            {showInventory && (
              <InventoryGroup collapsed={collapsed} onNavigate={onNavigate} />
            )}
          </div>

          {/* Manage section */}
          {!collapsed ? (
            <div className="mt-3">
              <SectionLabel label="الإدارة" />
            </div>
          ) : (
            <div className="my-3 mx-auto h-px w-7 bg-sidebar-border" />
          )}

          <div className="space-y-0.5">
            {manageItems.map((it) => (
              <NavButton
                key={it.path}
                item={it}
                active={isActive(it.path)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </nav>

        <SidebarFooter collapsed={collapsed} />
      </aside>
    </TooltipProvider>
  )
}
