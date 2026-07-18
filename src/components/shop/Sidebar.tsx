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
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShopStore, type ViewKey } from '@/lib/store'
import { Badge } from '@/components/ui/badge'

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
        'group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
        'min-h-[44px] text-right',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <Icon
        className={cn(
          'size-5 shrink-0',
          active
            ? 'text-primary-foreground'
            : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  )
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const shopName = useShopStore((s) => s.shopName)
  const initial = shopName?.trim()?.charAt(0) ?? 'م'
  return (
    <div className="flex items-center gap-3 px-3 py-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-bold shadow-sm">
        {initial}
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-sidebar-foreground">
            {shopName}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            نظام إدارة متكامل
          </p>
        </div>
      )}
    </div>
  )
}

function UserFooter({ collapsed }: { collapsed?: boolean }) {
  const user = useShopStore((s) => s.user)
  const logout = useShopStore((s) => s.logout)
  if (!user) return null
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            isAdmin
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {user.name?.trim()?.charAt(0) ?? 'U'}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {user.name}
            </p>
            <Badge
              variant="outline"
              className={cn(
                'mt-0.5 px-1.5 py-0 text-[10px] font-medium',
                isAdmin
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-muted-foreground/30 bg-muted text-muted-foreground'
              )}
            >
              {isAdmin ? 'المدير' : 'الموظف'}
            </Badge>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          title="تسجيل الخروج"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4" />
        </button>
      </div>
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
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const handleNav = (k: ViewKey) => {
    setActiveView(k)
    onNavigate?.()
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-l bg-sidebar',
        collapsed ? 'w-[68px]' : 'w-[260px]',
        className
      )}
    >
      <Brand collapsed={collapsed} />
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {!collapsed && (
          <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            الرئيسية
          </p>
        )}
        <div className="space-y-1">
          {MAIN_GROUP.map((it) => (
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
              {MANAGE_GROUP.map((it) => (
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
      <UserFooter collapsed={collapsed} />
    </aside>
  )
}
