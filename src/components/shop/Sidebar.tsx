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
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, Wrench, Users, Truck,
  PackagePlus, Wallet, ReceiptText, Banknote, Warehouse, Building2,
  BarChart3, Settings as SettingsIcon, UserCog, Power, ChevronLeft, ChevronDown, Store,
  Boxes, Activity, ArrowRightLeft, ClipboardCheck, UsersRound, CalendarCheck, HandCoins, BadgeDollarSign, TreePalm as PalmtreeIcon, Award,
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
const INVENTORY_CHILDREN: { path: string; label: string; color: string; icon: LucideIcon }[] = [
  { path: '/inventory', label: 'حالة المخزون', color: '#10b981', icon: Boxes },
  { path: '/inventory/movements', label: 'الحركات', color: '#0ea5e9', icon: Activity },
  { path: '/inventory/transfers', label: 'التحويلات', color: '#f59e0b', icon: ArrowRightLeft },
  { path: '/inventory/stocktake', label: 'الجرد', color: '#0d9488', icon: ClipboardCheck },
]

/** الموارد البشرية — شاشات قليلة وبسيطة (كل واحدة بلونها زي المخزون) */
const HR_CHILDREN: { path: string; label: string; color: string; icon: LucideIcon }[] = [
  { path: '/hr', label: 'نظرة عامة', color: '#0ea5e9', icon: UsersRound },
  { path: '/hr/employees', label: 'الموظفين', color: '#10b981', icon: UserCog },
  { path: '/hr/attendance', label: 'الحضور والانصراف', color: '#f59e0b', icon: CalendarCheck },
  { path: '/hr/evaluations', label: 'التقييمات', color: '#f59e0b', icon: Award },
  { path: '/hr/leaves', label: 'الإجازات', color: '#ec4899', icon: PalmtreeIcon },
  { path: '/hr/advances', label: 'السلف', color: '#a855f7', icon: HandCoins },
  { path: '/hr/payroll', label: 'الرواتب', color: '#0d9488', icon: BadgeDollarSign },
]

/** صفحات مشرف الفرع (صلاحية hr_attendance) */
const HR_STAFF_PATHS = ['/hr/attendance', '/hr/leaves']

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

  // ⚡ 2026-10-17 (تقليل CPU — الخطوة 3): prefetch={false} بدل viewport-prefetch
  // — كل لينك في القايمة كان بيطلع طلب RSC للـ Worker أول ما يدخل الشاشة
  // (20+ استدعاء Worker مع كل فتح صفحة) حتى لو المستخدم مش هيضغط. دلوقتي
  // التنزيل يحصل عند الهوفر/الكليك بس — نفس سرعة التنقل تقريبًا (الصفحات كلها
  // prerendered)، والأوفلاين مش متأثر لأنه معتمد على كاش الـ SW للصفحات
  // (PRECACHE_URLS) مش على prefetch الراوتر.
  const linkEl = (
    <Link
      prefetch={false}
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
  const router = useRouter()
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
        prefetch={false}
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

  /* ── Expanded mode: parent row (toggle) + connected sub-pages ── */
  const onParentClick = () => {
    // أول ضغطة من برّه المخزون: افتح القايمة وروح لحالة المخزون مباشرة.
    // بعد كده الضغطة بتفتح/تقفل القايمة بس — من غير زرار × منفصل.
    if (!inInventory) {
      setOpen(true)
      warmInventory()
      router.push('/inventory')
      onNavigate?.()
      return
    }
    setOpen((o) => !o)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onParentClick}
        onMouseEnter={warmInventory}
        onFocus={warmInventory}
        aria-expanded={open}
        aria-controls="inventory-subnav"
        className={cn(
          'group relative flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3 py-1.5 text-right text-sm font-medium transition-all duration-base',
          inInventory
            ? 'bg-primary-subtle text-primary-subtle-foreground ring-1 ring-primary/15'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        )}
      >
        {inInventory && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-l-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-[0_0_8px_0px] shadow-brand-500/60"
          />
        )}
        <span
          className={cn(
            'relative grid size-8 shrink-0 place-items-center rounded-lg transition-all',
            inInventory
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground/75 group-hover:bg-sidebar-accent/80 group-hover:text-sidebar-accent-foreground',
          )}
        >
          <Warehouse strokeWidth={inInventory ? 2.2 : 2} className="size-[18px]" />
        </span>
        <span className="flex-1 truncate">المخزون</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 opacity-60 transition-transform duration-base ease-out group-hover:opacity-100',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Sub-pages — display:none toggling for zero-empty-space collapse */}
      <div
        id="inventory-subnav"
        style={{ display: open ? 'block' : 'none' }}
        className={open ? 'submenu-in' : undefined}
      >
        <div className="relative mt-1.5 mb-1 space-y-1 pe-0">
          {/* العمود الفقري: خط رأسي يمرّ من تحت أيقونة المخزون */}
          <span
            aria-hidden
            className="absolute bottom-5 top-0 w-px bg-sidebar-border"
            style={{ insetInlineStart: '27px' }}
          />
          {INVENTORY_CHILDREN.map((child) => {
            const active = pathname === child.path
            const ChildIcon = child.icon
            const warm = () => shouldSkipPreload() || preloadView(child.path)
            return (
              <Link
                key={child.path}
                prefetch={false}
                href={child.path}
                onMouseEnter={warm}
                onPointerDown={warm}
                onFocus={warm}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group/child relative flex min-h-[44px] items-center gap-3 rounded-xl py-1.5 pe-3 text-sm transition-all duration-base',
                  'ps-[46px]',
                  active
                    ? 'font-bold text-sidebar-foreground'
                    : 'font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                )}
                style={
                  active
                    ? { backgroundColor: `${child.color}1a`, boxShadow: `inset 0 0 0 1px ${child.color}40` }
                    : undefined
                }
              >
                {/* وصلة أفقية من العمود الفقري للصفحة */}
                <span
                  aria-hidden
                  className="absolute top-1/2 h-px w-[14px] transition-colors"
                  style={{
                    insetInlineStart: '27px',
                    backgroundColor: active ? child.color : 'var(--sidebar-border)',
                  }}
                />
                {/* بلاطة الأيقونة — ملوّنة بهوية الصفحة دايمًا، وتتملّى لما تكون الصفحة الحالية */}
                <span
                  className="relative grid size-8 shrink-0 place-items-center rounded-lg transition-all duration-base group-hover/child:scale-105"
                  style={
                    active
                      ? { backgroundColor: child.color, color: '#fff', boxShadow: `0 4px 12px -2px ${child.color}80` }
                      : { backgroundColor: `${child.color}1f`, color: child.color }
                  }
                >
                  <ChildIcon strokeWidth={active ? 2.3 : 2} className="size-[17px]" />
                </span>
                <span className="relative flex-1 truncate">{child.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HrGroup({
  collapsed,
  onNavigate,
  staffOnly,
}: {
  collapsed?: boolean
  onNavigate?: () => void
  /** مشرف الفرع: الحضور والإجازات فقط (مفيش مبالغ) */
  staffOnly?: boolean
}) {
  const homePath = staffOnly ? '/hr/attendance' : '/hr'
  const children = staffOnly ? HR_CHILDREN.filter((c) => HR_STAFF_PATHS.includes(c.path)) : HR_CHILDREN
  const router = useRouter()
  const { pathname, isActive } = useActivePath()
  const inHr = pathname.startsWith('/hr')
  const parentActiveHr = pathname === '/hr'

  // Auto-open when entering inventory from outside, but respect manual close
  // when navigating *between* inventory sub-pages.
  const [open, setOpen] = React.useState(inHr)
  const wasInHr = React.useRef(inHr)
  React.useEffect(() => {
    if (inHr && !wasInHr.current) setOpen(true)
    wasInHr.current = inHr
  }, [inHr])

  // ⚡ PERF FIX: warm-up موحّد لكل روابط الموارد البشرية (راجع src/lib/view-preload.ts)
  const warmHr = React.useCallback(() => {
    if (!shouldSkipPreload()) preloadView('/hr')
  }, [])

  /* ── Collapsed mode: single icon link + tooltip ── */
  if (collapsed) {
    const linkEl = (
      <Link
        prefetch={false}
        href={homePath}
        onMouseEnter={warmHr}
        onPointerDown={warmHr}
        onFocus={warmHr}
        onClick={onNavigate}
        aria-label="الموارد البشرية"
        className={cn(
          'group relative grid size-10 place-items-center rounded-xl transition-all duration-base',
          inHr
            ? 'bg-primary-subtle text-primary-subtle-foreground ring-1 ring-primary/15'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        )}
      >
        {inHr && (
          <span
            aria-hidden
            className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-l-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-[0_0_8px_0px] shadow-brand-500/60"
          />
        )}
        <UsersRound
          strokeWidth={inHr ? 2.4 : 2}
          className={cn('size-[18px]', inHr && 'text-primary')}
        />
      </Link>
    )
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          الموارد البشرية
        </TooltipContent>
      </Tooltip>
    )
  }

  /* ── Expanded mode: parent row (toggle) + connected sub-pages ── */
  const onParentClick = () => {
    // أول ضغطة من برّه الموارد البشرية: افتح القايمة وروح لحالة الموارد البشرية مباشرة.
    // بعد كده الضغطة بتفتح/تقفل القايمة بس — من غير زرار × منفصل.
    if (!inHr) {
      setOpen(true)
      warmHr()
      router.push(homePath)
      onNavigate?.()
      return
    }
    setOpen((o) => !o)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onParentClick}
        onMouseEnter={warmHr}
        onFocus={warmHr}
        aria-expanded={open}
        aria-controls="hr-subnav"
        className={cn(
          'group relative flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3 py-1.5 text-right text-sm font-medium transition-all duration-base',
          inHr
            ? 'bg-primary-subtle text-primary-subtle-foreground ring-1 ring-primary/15'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        )}
      >
        {inHr && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-l-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-[0_0_8px_0px] shadow-brand-500/60"
          />
        )}
        <span
          className={cn(
            'relative grid size-8 shrink-0 place-items-center rounded-lg transition-all',
            inHr
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground/75 group-hover:bg-sidebar-accent/80 group-hover:text-sidebar-accent-foreground',
          )}
        >
          <UsersRound strokeWidth={inHr ? 2.2 : 2} className="size-[18px]" />
        </span>
        <span className="flex-1 truncate">الموارد البشرية</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 opacity-60 transition-transform duration-base ease-out group-hover:opacity-100',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Sub-pages — display:none toggling for zero-empty-space collapse */}
      <div
        id="hr-subnav"
        style={{ display: open ? 'block' : 'none' }}
        className={open ? 'submenu-in' : undefined}
      >
        <div className="relative mt-1.5 mb-1 space-y-1 pe-0">
          {/* العمود الفقري: خط رأسي يمرّ من تحت أيقونة الموارد البشرية */}
          <span
            aria-hidden
            className="absolute bottom-5 top-0 w-px bg-sidebar-border"
            style={{ insetInlineStart: '27px' }}
          />
          {children.map((child) => {
            const active = pathname === child.path
            const ChildIcon = child.icon
            const warm = () => shouldSkipPreload() || preloadView(child.path)
            return (
              <Link
                key={child.path}
                prefetch={false}
                href={child.path}
                onMouseEnter={warm}
                onPointerDown={warm}
                onFocus={warm}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group/child relative flex min-h-[44px] items-center gap-3 rounded-xl py-1.5 pe-3 text-sm transition-all duration-base',
                  'ps-[46px]',
                  active
                    ? 'font-bold text-sidebar-foreground'
                    : 'font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                )}
                style={
                  active
                    ? { backgroundColor: `${child.color}1a`, boxShadow: `inset 0 0 0 1px ${child.color}40` }
                    : undefined
                }
              >
                {/* وصلة أفقية من العمود الفقري للصفحة */}
                <span
                  aria-hidden
                  className="absolute top-1/2 h-px w-[14px] transition-colors"
                  style={{
                    insetInlineStart: '27px',
                    backgroundColor: active ? child.color : 'var(--sidebar-border)',
                  }}
                />
                {/* بلاطة الأيقونة — ملوّنة بهوية الصفحة دايمًا، وتتملّى لما تكون الصفحة الحالية */}
                <span
                  className="relative grid size-8 shrink-0 place-items-center rounded-lg transition-all duration-base group-hover/child:scale-105"
                  style={
                    active
                      ? { backgroundColor: child.color, color: '#fff', boxShadow: `0 4px 12px -2px ${child.color}80` }
                      : { backgroundColor: `${child.color}1f`, color: child.color }
                  }
                >
                  <ChildIcon strokeWidth={active ? 2.3 : 2} className="size-[17px]" />
                </span>
                <span className="relative flex-1 truncate">{child.label}</span>
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
        'flex items-center gap-2.5 border-b border-sidebar-border px-3 py-3',
        collapsed && 'justify-center px-0',
      )}
    >
      <ShopAvatar logoPath={logoPath} collapsed={collapsed} />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p
            className="truncate whitespace-nowrap text-[17px] font-bold leading-[1.4] text-sidebar-foreground"
            style={{ fontFamily: 'var(--font-brand), var(--font-cairo), sans-serif' }}
            title={shopName}
          >
            {shopName || <span className="inline-block h-4 w-28 animate-pulse rounded bg-sidebar-foreground/10 align-middle" />}
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
  const hrStaffOnly = !isAdmin && !!user?.permissions?.includes('hr_attendance')
  const showHr = planHasModule('hr') && (isAdmin || hrStaffOnly)

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
            {showHr && <HrGroup collapsed={collapsed} onNavigate={onNavigate} staffOnly={hrStaffOnly} />}
          </div>
        </nav>

        <SidebarFooter collapsed={collapsed} />
      </aside>
    </TooltipProvider>
  )
}
