'use client'

import * as React from 'react'
import { useVocab } from '@/lib/vocab'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, Wrench, Users, Truck,
  PackagePlus, Wallet, ReceiptText, Banknote, Warehouse, Building2,
  BarChart3, Settings as SettingsIcon, UserCog, Power, ChevronLeft, ChevronDown, Store,
  Boxes, Activity, ArrowRightLeft, ClipboardCheck, UsersRound, CalendarCheck, HandCoins, BadgeDollarSign, TreePalm as PalmtreeIcon, Award,
  Percent, CircleUserRound,
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
  module?: ViewKey
}

const INVENTORY_CHILDREN: { path: string; label: string; color: string; icon: LucideIcon }[] = [
  { path: '/inventory', label: 'حالة المخزون', color: '#10b981', icon: Boxes },
  { path: '/inventory/movements', label: 'الحركات', color: '#0ea5e9', icon: Activity },
  { path: '/inventory/transfers', label: 'التحويلات', color: '#f59e0b', icon: ArrowRightLeft },
  { path: '/inventory/stocktake', label: 'الجرد', color: '#0d9488', icon: ClipboardCheck },
]

const HR_CHILDREN: { path: string; label: string; color: string; icon: LucideIcon }[] = [
  { path: '/hr', label: 'نظرة عامة', color: '#0ea5e9', icon: UsersRound },
  { path: '/hr/employees', label: 'الموظفين', color: '#10b981', icon: UserCog },
  { path: '/hr/attendance', label: 'الحضور والانصراف', color: '#f59e0b', icon: CalendarCheck },
  { path: '/hr/evaluations', label: 'التقييمات', color: '#f59e0b', icon: Award },
  { path: '/hr/leaves', label: 'الإجازات', color: '#ec4899', icon: PalmtreeIcon },
  { path: '/hr/advances', label: 'السلف', color: '#a855f7', icon: HandCoins },
  { path: '/hr/payroll', label: 'الرواتب', color: '#0d9488', icon: BadgeDollarSign },
]

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
  { path: '/commissions', label: 'عمولات البائعين', icon: Percent, module: 'sales' },
  { path: '/reports', label: 'التقارير', icon: BarChart3, module: 'reports' },
  { path: '/branches', label: 'الفروع', icon: Building2, module: 'branches' },
  { path: '/users', label: 'المستخدمين', icon: UserCog, module: 'users' },
  { path: '/settings', label: 'الإعدادات', icon: SettingsIcon, module: 'settings' },
]

const MY_PROFILE_ITEM: NavItem = {
  path: '/profile',
  label: 'ملفي',
  icon: CircleUserRound,
}

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

  const warmup = React.useCallback(() => {
    if (!shouldSkipPreload()) preloadView(item.path)
  }, [item.path])

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
        'group relative flex w-full items-center gap-3 rounded-xl transition-all duration-200',
        'min-h-[48px] px-3 py-2 text-[15px]',
        active
          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 font-bold shadow-sm ring-1 ring-emerald-500/20'
          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 font-semibold',
        collapsed && 'justify-center px-0',
      )}
    >
      {/* 🛑 خط ملون يمتد بطول التاب النشط ليعطيه ثباتاً وقوة */}
      {active && !collapsed && (
        <span className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r-xl bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
      )}

      <span
        className={cn(
          'relative grid place-items-center size-9 shrink-0 rounded-lg transition-all duration-200',
          active
            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm shadow-emerald-500/30'
            : 'bg-transparent text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10',
        )}
      >
        <Icon strokeWidth={active ? 2.5 : 2.2} className="size-5" />
      </span>

      {!collapsed && (
        <span className="flex-1 truncate">
          {t(item.label)}
        </span>
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

/* ───────────────────────── Groups ───────────────────────── */

function InventoryGroup({
  collapsed,
  onNavigate,
  blindOnly = false,
}: {
  collapsed?: boolean
  onNavigate?: () => void
  blindOnly?: boolean
}) {
  const router = useRouter()
  const { pathname } = useActivePath()
  const inInventory = pathname.startsWith('/inventory')
  const [open, setOpen] = React.useState(inInventory)
  const wasInInventory = React.useRef(inInventory)

  React.useEffect(() => {
    if (inInventory && !wasInInventory.current) setOpen(true)
    wasInInventory.current = inInventory
  }, [inInventory])

  const warmInventory = React.useCallback(() => {
    if (!shouldSkipPreload()) preloadView('/inventory')
  }, [])

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
          'group relative grid size-12 place-items-center rounded-xl transition-all duration-200',
          inInventory
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600'
            : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50',
        )}
      >
        <Warehouse strokeWidth={inInventory ? 2.4 : 2} className="size-6" />
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

  const onParentClick = () => {
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
        className={cn(
          'group relative flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-right text-[15px] transition-all duration-200',
          inInventory
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 font-bold shadow-sm ring-1 ring-emerald-500/20'
            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 font-semibold',
        )}
      >
        {inInventory && (
          <span className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r-xl bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
        )}
        <span
          className={cn(
            'relative grid size-9 shrink-0 place-items-center rounded-lg transition-all duration-200',
            inInventory
              ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm shadow-emerald-500/30'
              : 'text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10',
          )}
        >
          <Warehouse strokeWidth={inInventory ? 2.5 : 2.2} className="size-5" />
        </span>
        <span className="flex-1 truncate">المخزون</span>
        <ChevronDown className={cn('size-4 shrink-0 opacity-60 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <div
        style={{ display: open ? 'block' : 'none' }}
        className={open ? 'animate-in slide-in-from-top-1 fade-in duration-200' : undefined}
      >
        <div className="relative mt-1 space-y-1 pe-0 pb-1">
          <span className="absolute bottom-2 top-0 w-px bg-slate-200 dark:bg-slate-800" style={{ insetInlineStart: '24px' }} />
          {(blindOnly ? INVENTORY_CHILDREN.filter((c) => c.path === '/inventory/stocktake') : INVENTORY_CHILDREN).map((child) => {
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
                className={cn(
                  'group/child relative flex min-h-[42px] items-center gap-3 rounded-lg py-1.5 pe-2 text-sm transition-all duration-200 ps-[42px]',
                  active
                    ? 'bg-emerald-50/50 dark:bg-emerald-500/5 font-bold text-emerald-800 dark:text-emerald-200'
                    : 'font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/30',
                )}
              >
                <span className="absolute top-1/2 h-px w-[12px]" style={{ insetInlineStart: '24px', backgroundColor: active ? child.color : 'var(--border)' }} />
                <span
                  className="relative grid size-8 shrink-0 place-items-center rounded-md transition-all duration-200 group-hover/child:scale-105"
                  style={active ? { backgroundColor: child.color, color: '#fff', boxShadow: `0 2px 8px -2px ${child.color}80` } : { backgroundColor: `${child.color}15`, color: child.color }}
                >
                  <ChildIcon strokeWidth={active ? 2.4 : 2.2} className="size-4" />
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

function HrGroup({ collapsed, onNavigate, staffOnly }: { collapsed?: boolean; onNavigate?: () => void; staffOnly?: boolean }) {
  const homePath = staffOnly ? '/hr/attendance' : '/hr'
  const children = staffOnly ? HR_CHILDREN.filter((c) => HR_STAFF_PATHS.includes(c.path)) : HR_CHILDREN
  const router = useRouter()
  const { pathname } = useActivePath()
  const inHr = pathname.startsWith('/hr')
  const [open, setOpen] = React.useState(inHr)
  const wasInHr = React.useRef(inHr)

  React.useEffect(() => {
    if (inHr && !wasInHr.current) setOpen(true)
    wasInHr.current = inHr
  }, [inHr])

  const warmHr = React.useCallback(() => {
    if (!shouldSkipPreload()) preloadView('/hr')
  }, [])

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
          'group relative grid size-12 place-items-center rounded-xl transition-all duration-200',
          inHr
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600'
            : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50',
        )}
      >
        <UsersRound strokeWidth={inHr ? 2.4 : 2} className="size-6" />
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

  const onParentClick = () => {
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
        className={cn(
          'group relative flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-right text-[15px] transition-all duration-200',
          inHr
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 font-bold shadow-sm ring-1 ring-emerald-500/20'
            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 font-semibold',
        )}
      >
        {inHr && (
          <span className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r-xl bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
        )}
        <span
          className={cn(
            'relative grid size-9 shrink-0 place-items-center rounded-lg transition-all duration-200',
            inHr
              ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm shadow-emerald-500/30'
              : 'text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10',
          )}
        >
          <UsersRound strokeWidth={inHr ? 2.5 : 2.2} className="size-5" />
        </span>
        <span className="flex-1 truncate">الموارد البشرية</span>
        <ChevronDown className={cn('size-4 shrink-0 opacity-60 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <div style={{ display: open ? 'block' : 'none' }} className={open ? 'animate-in slide-in-from-top-1 fade-in duration-200' : undefined}>
        <div className="relative mt-1 space-y-1 pe-0 pb-1">
          <span className="absolute bottom-2 top-0 w-px bg-slate-200 dark:bg-slate-800" style={{ insetInlineStart: '24px' }} />
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
                className={cn(
                  'group/child relative flex min-h-[42px] items-center gap-3 rounded-lg py-1.5 pe-2 text-sm transition-all duration-200 ps-[42px]',
                  active
                    ? 'bg-emerald-50/50 dark:bg-emerald-500/5 font-bold text-emerald-800 dark:text-emerald-200'
                    : 'font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/30',
                )}
              >
                <span className="absolute top-1/2 h-px w-[12px]" style={{ insetInlineStart: '24px', backgroundColor: active ? child.color : 'var(--border)' }} />
                <span
                  className="relative grid size-8 shrink-0 place-items-center rounded-md transition-all duration-200 group-hover/child:scale-105"
                  style={active ? { backgroundColor: child.color, color: '#fff', boxShadow: `0 2px 8px -2px ${child.color}80` } : { backgroundColor: `${child.color}15`, color: child.color }}
                >
                  <ChildIcon strokeWidth={active ? 2.4 : 2.2} className="size-4" />
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

/* ───────────────────────── Brand & Header ───────────────────────── */

function ShopAvatar({ logoPath, collapsed }: { logoPath?: string | null; collapsed?: boolean }) {
  if (logoPath) {
    return (
      <div className={cn('shrink-0 overflow-hidden rounded-xl shadow-md ring-1 ring-white/20', collapsed ? 'size-10' : 'size-11')}>
        <img src={logoPath} alt="شعار المحل" className="h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-xl', 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700', 'shadow-lg shadow-emerald-500/30 ring-2 ring-white/20', collapsed ? 'size-10' : 'size-11')}>
      <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/30" />
      <Store className="relative size-5 text-white drop-shadow-md" strokeWidth={2.2} />
    </div>
  )
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const shopName = useShopStore((s) => s.shopName)
  const logoPath = useShopStore((s) => s.branding?.logoPath)
  
  // 🛑 الفكرة الذكية 1: تصغير الخط تلقائياً بناءً على عدد الحروف
  const nameLength = shopName?.length || 0
  const fontSizeClass = nameLength > 22 ? 'text-sm' : nameLength > 14 ? 'text-base' : 'text-xl'

  return (
    <div className={cn('flex items-center gap-2.5 border-b border-slate-200/60 dark:border-slate-800/60 px-3 py-3', collapsed && 'justify-center px-0 py-4')}>
      <ShopAvatar logoPath={logoPath} collapsed={collapsed} />
      {!collapsed && (
        <div 
          className="min-w-0 flex-1 flex flex-col justify-center overflow-hidden"
          style={{
            // 🛑 الفكرة الذكية 2: تلاشي النص بنعومة من اليسار بدلاً من القطع المفاجئ (...)
            maskImage: 'linear-gradient(to left, #000 80%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to left, #000 80%, transparent 100%)'
          }}
        >
          <p 
            className={cn(
              'truncate whitespace-nowrap font-bold leading-tight text-black dark:text-white transition-all duration-300',
              fontSizeClass
            )} 
            title={shopName} // 🛑 الفكرة الذكية 3: إظهار الاسم بالكامل عند وضع الماوس
            style={{ fontFamily: 'Tajawal, Cairo, sans-serif' }}
          >
            {shopName || <span className="inline-block h-5 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700 align-middle" />}
          </p>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1.5 pt-4">
      <p className="select-none text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800/60" />
    </div>
  )
}

/* ───────────────────────── Footer ───────────────────────── */

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

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
    const start = Date.now()
    const id = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(secs / 3600))}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}`
}

function Led({ online }: { online: boolean }) {
  const c = online ? 'bg-emerald-500' : 'bg-amber-500'
  return (
    <span className="relative grid size-6 shrink-0 place-items-center">
      {online && <span className={cn('absolute inline-flex size-2.5 animate-ping rounded-full opacity-60', c)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', c)} style={{ boxShadow: `0 0 8px 0 ${online ? 'rgba(16,185,129,0.8)' : 'rgba(245,158,11,0.8)'}` }} />
    </span>
  )
}

function SignalBars({ level }: { level: number }) {
  return (
    <span aria-hidden dir="ltr" className="flex h-3.5 shrink-0 items-end gap-[2px]">
      {[4, 7, 10, 13].map((h, i) => (
        <span key={h} className={cn('w-[2.5px] rounded-sm transition-colors', i < level ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700')} style={{ height: h }} />
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
            <span className="grid size-10 place-items-center rounded-lg border border-slate-200/60 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/50 shadow-inner">
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
    <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200/60 bg-white dark:border-slate-800/60 dark:bg-slate-900/50 px-2.5 shadow-sm backdrop-blur-md">
      <Led online={online} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-700 dark:text-slate-300">{label}</span>
      {online && <span dir="ltr" className="text-[10px] tabular-nums font-semibold text-slate-400 dark:text-slate-500" style={{ fontFamily: MONO }}>{clock}</span>}
      <SignalBars level={bars} />
    </div>
  )
}

function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  const logout = useShopStore((s) => s.logout)

  const iconTile = (size: string) => (
    <span className={cn('grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-rose-400 to-rose-600 text-white ring-1 ring-white/20', 'shadow-[0_4px_10px_-3px_rgba(225,29,72,0.5)] transition-transform duration-200 group-hover:scale-105', size)}>
      <Power className="size-3.5" strokeWidth={2.4} />
    </span>
  )

  const btn = (
    <button
      type="button"
      onClick={logout}
      aria-label="تسجيل الخروج"
      className={cn(
        'group relative flex w-full items-center overflow-hidden rounded-xl border transition-all duration-200 ease-out',
        'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400',
        'hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 hover:shadow-[0_4px_12px_-4px_rgba(225,29,72,0.4)] active:scale-[0.98]',
        collapsed ? 'size-10 justify-center rounded-lg' : 'min-h-[44px] gap-2.5 p-1.5 pe-2.5',
      )}
    >
      {collapsed ? iconTile('size-7') : (
        <>
          {iconTile('size-8')}
          <span className="flex-1 text-right text-[13px] font-bold">تسجيل الخروج</span>
          <ChevronLeft className="size-3.5 opacity-50 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:opacity-100" />
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
    <div className="space-y-2 border-t border-slate-200/60 dark:border-slate-800/60 px-3 py-3">
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

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const userPermissions = (!isAdmin && user?.permissions && user.permissions.length > 0) ? user.permissions : null

  const planHasModule = (key: string) => enabledModules.includes(key) || (CRITICAL_MODULES as readonly string[]).includes(key)

  const hasModule = (key: string) => {
    if (!planHasModule(key)) return false
    if (userPermissions) return userPermissions.includes(key)
    return true
  }

  const mainItems = MAIN_GROUP.filter((it) => hasModule(it.module!))
  const manageItems = MANAGE_GROUP.filter((it) => hasModule(it.module!) || (it.path === '/commissions' && planHasModule('sales') && !!userPermissions?.includes('commissions')))
  const showInventory = hasModule('inventory')
  const showBlindStocktake = !showInventory && planHasModule('inventory') && !!userPermissions?.includes('blind_stocktake')
  const hrStaffOnly = !isAdmin && !!user?.permissions?.includes('hr_attendance')
  const showHr = planHasModule('hr') && (isAdmin || hrStaffOnly)
  const showMyProfile = isAdmin || !userPermissions || !!userPermissions.includes('my_profile')

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex h-full flex-col bg-white dark:bg-slate-950 border-l border-slate-200/60 dark:border-slate-800/60',
          'relative isolate',
          collapsed ? 'w-[72px]' : 'w-[250px]', // 🛑 تم تقليل العرض من 280 إلى 250
          className,
        )}
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-slate-50 to-transparent dark:from-slate-900/50" />

        <Brand collapsed={collapsed} />

        <nav
          ref={navRef}
          onScroll={measure}
          style={moreBelow ? { WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 36px), transparent)', maskImage: 'linear-gradient(to bottom, #000 calc(100% - 36px), transparent)' } : undefined}
          className={cn('sidebar-nav flex-1 overflow-y-auto overflow-x-hidden', 'px-2.5 py-2')}
          aria-label="القائمة الرئيسية"
        >
          {!collapsed && <SectionLabel label="الرئيسية" />}
          <div className="space-y-1">
            {mainItems.map((it) => (
              <NavButton key={it.path} item={it} active={isActive(it.path)} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
            {(showInventory || showBlindStocktake) && (
              <InventoryGroup collapsed={collapsed} onNavigate={onNavigate} blindOnly={!showInventory} />
            )}
          </div>

          {!collapsed ? (
            <div className="mt-1"><SectionLabel label="الإدارة" /></div>
          ) : (
            <div className="my-3 mx-auto h-px w-6 bg-slate-200 dark:bg-slate-800" />
          )}

          <div className="space-y-1">
            {manageItems.map((it) => (
              <NavButton key={it.path} item={it} active={isActive(it.path)} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
            {showHr && <HrGroup collapsed={collapsed} onNavigate={onNavigate} staffOnly={hrStaffOnly} />}
            {showMyProfile && (
              <NavButton item={MY_PROFILE_ITEM} active={isActive('/profile')} collapsed={collapsed} onNavigate={onNavigate} />
            )}
          </div>
        </nav>

        <SidebarFooter collapsed={collapsed} />
      </aside>
    </TooltipProvider>
  )
}