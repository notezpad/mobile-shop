'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, Wrench, Users, Truck,
  PackagePlus, Wallet, ReceiptText, Banknote, Warehouse, Building2,
  BarChart3, Settings as SettingsIcon, UserCog, LogOut, Store,
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

const MAIN_GROUP: NavItem[] = [
  { path: '/dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard, module: 'dashboard' },
  { path: '/pos', label: 'نقطة البيع', icon: ShoppingCart, module: 'pos' },
  { path: '/products', label: 'المنتجات', icon: Package, module: 'products' },
  { path: '/sales', label: 'سجل المبيعات', icon: Receipt, module: 'sales' },
  { path: '/maintenance', label: 'الصيانة', icon: Wrench, module: 'maintenance' },
  { path: '/customers', label: 'العملاء', icon: Users, module: 'customers' },
  { path: '/suppliers', label: 'الموردين', icon: Truck, module: 'suppliers' },
  { path: '/purchases', label: 'المشتريات', icon: PackagePlus, module: 'purchases' },
  { path: '/inventory', label: 'المخزون', icon: Warehouse, module: 'inventory' },
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
