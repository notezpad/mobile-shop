'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, Wrench, Users, Truck,
  PackagePlus, Wallet, ReceiptText, Banknote, Warehouse, Building2,
  BarChart3, Settings as SettingsIcon, UserCog, LogOut, Store, Plus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import type { ViewKey } from '@/lib/store'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
// 🛡️ 2026-09-15: import CRITICAL_MODULES from plan-constants (CLIENT-SAFE).
// DO NOT import from '@/lib/features' here — that file pulls in Prisma + `pg`
// (the Postgres driver), which uses Node's `dns` module and breaks the
// browser bundle. `plan-constants.ts` has no db imports and is safe for
// client components.
import { CRITICAL_MODULES } from '@/lib/plan-constants'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  module: ViewKey
}

/**
 * 🛡️ 2026-09-30: صفحات المخزون بقت صفحات مستقلة بدل التبويبات —
 * عنصر "المخزون" في السايدبار بقى مجموعة قابلة للتوسيع بعلامة (+)
 * يخرج منها: المخزون / الحركات / التحويلات / الجرد، وكل صفحة بلون هويتها.
 */
const INVENTORY_CHILDREN: { path: string; label: string; color: string }[] = [
  { path: '/inventory', label: 'حالة المخزون', color: '#10b981' },
  { path: '/inventory/movements', label: 'الحركات', color: '#0ea5e9' },
  { path: '/inventory/transfers', label: 'التحويلات', color: '#f59e0b' },
  { path: '/inventory/stocktake', label: 'الجرد', color: '#8b5cf6' },
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
  { path: '/finance', label: 'المعاملات المالية', icon: Wallet, module: 'finance' },
  { path: '/expenses', label: 'المصروفات', icon: ReceiptText, module: 'expenses' },
  { path: '/cash', label: 'الخزنة', icon: Banknote, module: 'cash' },
  { path: '/reports', label: 'التقارير', icon: BarChart3, module: 'reports' },
  { path: '/settings', label: 'الإعدادات', icon: SettingsIcon, module: 'settings' },
  { path: '/branches', label: 'الفروع', icon: Building2, module: 'branches' },
  { path: '/users', label: 'المستخدمين', icon: UserCog, module: 'users' },
]

function NavButton({
  item,
  active,
  collapsed,
}: {
  item: NavItem
  active: boolean
  collapsed?: boolean
}) {
  const Icon = item.icon

  const linkEl = (
    <Link
      href={item.path}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        'h-11 text-right',
        active
          ? 'bg-primary-subtle text-primary-subtle-foreground'
          : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -right-2 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-l-full bg-primary shadow-[0_0_6px_0px] shadow-primary/60"
        />
      )}
      <Icon
        className={cn(
          'size-[18px] shrink-0 transition-colors',
          active
            ? 'text-primary'
            : 'text-muted-foreground/70 group-hover:text-sidebar-accent-foreground',
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return linkEl
}

/* ───────────── مجموعة المخزون القابلة للتوسيع (+) ───────────── */

function InventoryGroup({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed?: boolean
  pathname: string
  onNavigate?: () => void
}) {
  const inInventory = pathname.startsWith('/inventory')
  // بيتفتح تلقائياً أول ما تدخل أي صفحة من صفحات المخزون، وتفضل مفتوحة
  // على ذوقك لحد ما تقفلها بنفسك.
  const [open, setOpen] = React.useState(inInventory)
  React.useEffect(() => {
    if (inInventory) setOpen(true)
  }, [inInventory])

  const parentActive = pathname === '/inventory'

  /* ── الوضع المطوي (شريط الأيقونات): لينك عادي + Tooltip ── */
  if (collapsed) {
    const linkEl = (
      <Link
        href="/inventory"
        className={cn(
          'group relative flex size-11 items-center justify-center rounded-lg transition-all duration-150',
          inInventory
            ? 'bg-primary-subtle text-primary-subtle-foreground'
            : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        {inInventory && (
          <span
            aria-hidden
            className="absolute -right-2 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-l-full bg-primary shadow-[0_0_6px_0px] shadow-primary/60"
          />
        )}
        <Warehouse
          className={cn(
            'size-[18px] shrink-0',
            inInventory ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-sidebar-accent-foreground',
          )}
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

  return (
    <div>
      {/* الصف الرئيسي: كليك = الدخول لصفحة المخزون · علامة (+) = فتح/قفل الصفحات */}
      <div
        className={cn(
          'group relative flex w-full items-center rounded-lg transition-all duration-150',
          parentActive
            ? 'bg-primary-subtle text-primary-subtle-foreground'
            : inInventory
              ? 'bg-sidebar-accent/60 text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        {(parentActive || inInventory) && (
          <span
            aria-hidden
            className="absolute -right-2 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-l-full bg-primary shadow-[0_0_6px_0px] shadow-primary/60"
          />
        )}
        <Link
          href="/inventory"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-right"
        >
          <Warehouse
            className={cn(
              'size-[18px] shrink-0 transition-colors',
              parentActive || inInventory
                ? 'text-primary'
                : 'text-muted-foreground/70 group-hover:text-sidebar-accent-foreground',
            )}
          />
          <span className="truncate text-sm font-medium">المخزون</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'إخفاء صفحات المخزون' : 'إظهار صفحات المخزون'}
          className={cn(
            'me-2 flex size-6 shrink-0 items-center justify-center rounded-md border transition-all duration-base',
            'hover:bg-sidebar-accent active:scale-90',
            inInventory || open
              ? 'border-primary/25 bg-primary/10 text-primary'
              : 'border-sidebar-border text-muted-foreground',
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

      {/* الصفحات الفرعية — بتنفتح بحركة سلسة، وكل واحدة بلون هويتها */}
      <div
        className={cn(
          'grid transition-all duration-base ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="relative ms-[26px] space-y-0.5 border-s border-sidebar-border/70 py-1.5 ps-2.5">
            {INVENTORY_CHILDREN.map((child) => {
              const active = pathname === child.path
              return (
                <Link
                  key={child.path}
                  href={child.path}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  style={
                    active
                      ? ({
                          backgroundColor: `${child.color}1a`,
                          color: child.color,
                          ['--dot' as string]: child.color,
                        } as React.CSSProperties)
                      : ({ ['--dot' as string]: child.color } as React.CSSProperties)
                  }
                  className={cn(
                    'relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors',
                    active
                      ? 'font-bold'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 shrink-0 rounded-full transition-transform',
                      active ? 'scale-110' : 'scale-90 opacity-60',
                    )}
                    style={{ backgroundColor: 'var(--dot)' }}
                  />
                  <span className="truncate">{child.label}</span>
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -start-[11px] top-1/2 size-1.5 -translate-y-1/2 rounded-full ring-4 ring-sidebar"
                      style={{ backgroundColor: 'var(--dot)' }}
                    />
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ShopAvatar({ logoPath }: { logoPath?: string | null }) {
  if (logoPath) {
    return (
      <div className="shrink-0 size-9 overflow-hidden rounded-xl shadow-sm ring-1 ring-sidebar-border">
        <img src={logoPath} alt="شعار المحل" className="h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div className="shrink-0 relative flex size-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 shadow-sm ring-1 ring-brand-500/20">
      <Store className="relative size-[18px] text-white" strokeWidth={1.8} />
    </div>
  )
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const shopName = useShopStore((s) => s.shopName)
  const logoPath = useShopStore((s) => s.branding?.logoPath)
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-[14px] border-b border-sidebar-border',
        collapsed && 'justify-center px-0',
      )}
    >
      <ShopAvatar logoPath={logoPath} />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-normal text-sidebar-foreground leading-tight">
            {shopName}
          </p>
          <div className="mt-1.5 h-[2px] w-[50%] rounded-full bg-gradient-to-l from-brand-600 to-brand-400 opacity-80" />
        </div>
      )}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
      {label}
    </p>
  )
}

function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  const logout = useShopStore((s) => s.logout)

  const btn = (
    <button
      type="button"
      onClick={logout}
      className={cn(
        'group flex w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-150',
        'bg-destructive/10 text-destructive hover:bg-destructive hover:text-white',
        'border border-destructive/20 hover:border-destructive',
        'active:scale-[0.98] shadow-sm',
        collapsed ? 'size-10 self-center p-0' : 'h-10 px-4',
      )}
    >
      <LogOut className="size-4 shrink-0 transition-colors" />
      {!collapsed && <span>تسجيل الخروج</span>}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          تسجيل الخروج
        </TooltipContent>
      </Tooltip>
    )
  }

  return btn
}

function SidebarFooter({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-2 py-3 border-t border-sidebar-border">
      <LogoutButton collapsed={collapsed} />
      {!collapsed && (
        <div className="flex items-center gap-2 px-3 pt-1">
          <span className="relative inline-flex size-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          <span className="text-[11px] font-medium text-success/80">النظام يعمل</span>
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
  const pathname = usePathname()
  const enabledModules = useShopStore((s) => s.plan.enabledModules)

  const hasModule = (key: string) =>
    enabledModules.includes(key) ||
    (CRITICAL_MODULES as readonly string[]).includes(key)

  const mainItems = MAIN_GROUP.filter((it) => hasModule(it.module))
  const manageItems = MANAGE_GROUP.filter((it) => hasModule(it.module))
  const showInventory = hasModule('inventory')

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex h-full flex-col bg-sidebar border-l border-sidebar-border',
          collapsed ? 'w-[60px]' : 'w-[252px]',
          className,
        )}
      >
        <Brand collapsed={collapsed} />

        <nav className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!collapsed && <SectionLabel label="الرئيسية" />}
          <div className="space-y-0.5">
            {mainItems.map((it) => (
              <div key={it.path} onClick={onNavigate}>
                <NavButton item={it} active={pathname === it.path} collapsed={collapsed} />
              </div>
            ))}
            {showInventory && (
              <InventoryGroup collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
            )}
          </div>

          {!collapsed && (
            <div className="mt-4">
              <SectionLabel label="الإدارة" />
            </div>
          )}
          {collapsed && <div className="my-3 mx-auto w-6 h-px bg-sidebar-border" />}

          <div className="space-y-0.5">
            {manageItems.map((it) => (
              <div key={it.path} onClick={onNavigate}>
                <NavButton item={it} active={pathname === it.path} collapsed={collapsed} />
              </div>
            ))}
          </div>
        </nav>

        <SidebarFooter collapsed={collapsed} />
      </aside>
    </TooltipProvider>
  )
}
