'use client'

/**
 * SuperAdminApp — Sidebar & Topbar (Admin Edition)
 * ==================================================
 * مقتبس من سايدبار/توب بار لوحة المستخدم (shop/Sidebar + shop/Topbar)
 * مع هوية خاصة بالأدمن: لون ذهبي/عنبري بدل الأخضر، شارة "SUPER ADMIN"،
 * أقسام مجمّعة، بحث انتقال سريع (⌘K)، ساعة حيّة، جرس الاشتراكات المنتهية،
 * وكارت حالة النظام في أسفل السايدبار.
 */

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Store,
  CreditCard,
  Package,
  Ticket,
  Wallet,
  Settings as SettingsIcon,
  Megaphone,
  Power,
  Menu,
  Shield,
  Crown,
  ChevronLeft,
  Search,
  Command,
  CalendarDays,
  Bell,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/shop/ThemeToggle'
import { useShopStore } from '@/lib/store'
import { api } from '@/lib/api'
import { AdminDashboardView } from './AdminDashboardView'
import { AdminTenantsView } from './AdminTenantsView'
import { AdminSubscriptionsView } from './AdminSubscriptionsView'
import { AdminPlansView } from './AdminPlansView'
import { AdminCodesView } from './AdminCodesView'
import { AdminFinanceView } from './AdminFinanceView'
import { AdminSettingsView } from './AdminSettingsView'
import { AdminTrackingView } from './AdminTrackingView'

type AdminView =
  | 'dashboard'
  | 'tenants'
  | 'subscriptions'
  | 'plans'
  | 'codes'
  | 'finance'
  | 'tracking'
  | 'settings'

interface NavItem {
  key: AdminView
  label: string
  hint: string
  icon: LucideIcon
}

/** مجموعات القائمة — كل مجموعة لها عنوان صغير زي سايدبار المستخدم */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'نظرة عامة',
    items: [
      { key: 'dashboard', label: 'لوحة المعلومات', hint: 'ملخص أداء المنصة', icon: LayoutDashboard },
    ],
  },
  {
    label: 'العملاء والاشتراكات',
    items: [
      { key: 'tenants', label: 'المحلات المشتركة', hint: 'إدارة حسابات المحلات', icon: Store },
      { key: 'subscriptions', label: 'الاشتراكات', hint: 'الاشتراكات الحالية والمنتهية', icon: CreditCard },
      { key: 'plans', label: 'خطط الاشتراك', hint: 'الباقات والأسعار والمزايا', icon: Package },
      { key: 'codes', label: 'أكواد الاشتراك', hint: 'أكواد التفعيل والخصم', icon: Ticket },
    ],
  },
  {
    label: 'المال والنمو',
    items: [
      { key: 'finance', label: 'الإيرادات', hint: 'الإيرادات والمدفوعات', icon: Wallet },
      { key: 'tracking', label: 'التسويق والتتبع', hint: 'الحملات والتحويلات', icon: Megaphone },
    ],
  },
  {
    label: 'النظام',
    items: [
      { key: 'settings', label: 'إعدادات المنصة', hint: 'الإعدادات العامة', icon: SettingsIcon },
    ],
  },
]

const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
const NAV_BY_KEY = Object.fromEntries(ALL_NAV.map((n) => [n.key, n])) as Record<AdminView, NavItem>

/* ───────────────────────── NavButton ───────────────────────── */

function NavButton({
  item,
  active,
  collapsed,
  badge,
  onClick,
}: {
  item: NavItem
  active: boolean
  collapsed?: boolean
  badge?: number
  onClick: () => void
}) {
  const Icon = item.icon

  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-xl text-right transition-all duration-base ease-out',
        'min-h-[40px] px-3 py-1.5 text-sm font-medium',
        active
          ? 'bg-amber-500/[0.11] text-amber-800 ring-1 ring-amber-500/20 shadow-[0_2px_10px_-3px_rgba(245,158,11,0.30)] dark:bg-amber-400/[0.10] dark:text-amber-200 dark:ring-amber-400/20'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      {/* Active rail (right edge in RTL) */}
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-l-full bg-gradient-to-b from-amber-300 to-amber-600 shadow-[0_0_8px_0] shadow-amber-500/60"
        />
      )}

      <span
        className={cn(
          'relative grid size-8 shrink-0 place-items-center rounded-lg transition-all duration-base',
          active
            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm ring-1 ring-amber-300/40'
            : 'text-muted-foreground/75 group-hover:bg-sidebar-accent/80 group-hover:text-sidebar-accent-foreground',
        )}
      >
        <Icon strokeWidth={active ? 2.2 : 2} className="size-[18px]" />
        {/* نقطة تنبيه في وضع الأيقونات */}
        {collapsed && !!badge && badge > 0 && (
          <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-red-500 ring-2 ring-sidebar" />
        )}
      </span>

      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}

      {!collapsed && !!badge && badge > 0 && (
        <span
          className={cn(
            'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums',
            active ? 'bg-amber-600 text-white' : 'bg-red-500/15 text-red-600 dark:text-red-400',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {item.label}
          {!!badge && badge > 0 ? ` (${badge})` : ''}
        </TooltipContent>
      </Tooltip>
    )
  }
  return btn
}

/* ───────────────────────── Brand block ───────────────────────── */

function AdminBrand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-sidebar-border px-4 py-3.5',
        collapsed && 'justify-center px-0',
      )}
    >
      <div
        className={cn(
          'relative grid shrink-0 place-items-center overflow-hidden rounded-2xl',
          'bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600',
          'shadow-md ring-1 ring-amber-300/40',
          collapsed ? 'size-10' : 'size-11',
        )}
      >
        <span aria-hidden className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/25" />
        <Shield className="relative size-5 text-white" strokeWidth={1.9} />
      </div>

      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[17px] font-bold leading-tight text-sidebar-foreground"
            style={{ fontFamily: 'var(--font-brand), var(--font-cairo), sans-serif' }}
          >
            منصة إدارة المحلات
          </p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gradient-to-l from-amber-500/20 to-amber-500/5 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300">
            <Crown className="size-2.5" strokeWidth={2.4} />
            SUPER ADMIN
          </span>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="select-none px-3 pb-1.5 pt-1 text-[11px] font-bold text-muted-foreground/70">
      {label}
    </p>
  )
}

/* ───────────────────────── Footer: status + user + logout ───────────────────────── */

const SESSION_START = typeof window === 'undefined' ? 0 : Date.now()
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

function subscribeNetwork(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
function useOnline() {
  return React.useSyncExternalStore(
    subscribeNetwork,
    () => navigator.onLine,
    () => true,
  )
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

function StatusCard({ collapsed }: { collapsed?: boolean }) {
  const online = useOnline()
  const clock = useSessionClock()
  const label = online ? 'النظام يعمل' : 'غير متصل'

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
    </div>
  )
}

function UserCard({ collapsed }: { collapsed?: boolean }) {
  const user = useShopStore((s) => s.user)
  const initial = user?.name?.trim()?.charAt(0) ?? 'A'

  const avatar = (
    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 ring-1 ring-amber-300/40">
      <span aria-hidden className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/25" />
      <span className="relative text-sm font-bold text-white">{initial}</span>
    </span>
  )

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>{avatar}</TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            {user?.name} {user?.email ? `· ${user.email}` : ''}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-gradient-to-l from-amber-500/[0.07] to-transparent px-2 py-1.5">
      {avatar}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[12.5px] font-bold text-sidebar-foreground">{user?.name}</p>
        <p className="truncate text-[10.5px] text-muted-foreground" dir="ltr">
          {user?.email}
        </p>
      </div>
    </div>
  )
}

function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  const logout = useShopStore((s) => s.logout)

  const iconTile = (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white ring-1 ring-white/20',
        'shadow-[0_4px_10px_-3px_rgba(239,68,68,0.65)] transition-transform duration-base group-hover:scale-105',
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
      {iconTile}
      {!collapsed && (
        <>
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

/* ───────────────────────── Sidebar ───────────────────────── */

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

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'relative isolate flex h-full flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground',
          collapsed ? 'w-[68px]' : 'w-[260px]',
          className,
        )}
      >
        {/* Ambient amber glow at the top */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-36 bg-gradient-to-b from-amber-500/[0.07] to-transparent"
        />

        <AdminBrand collapsed={collapsed} />

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
          className="sidebar-nav flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5"
          aria-label="قائمة الأدمن"
        >
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-3' : undefined}>
              {!collapsed ? (
                <SectionLabel label={group.label} />
              ) : (
                gi > 0 && <div className="mx-auto mb-3 h-px w-7 bg-sidebar-border" />
              )}
              <div className="space-y-0.5">
                {group.items.map((it) => (
                  <NavButton
                    key={it.key}
                    item={it}
                    active={active === it.key}
                    collapsed={collapsed}
                    badge={it.key === 'subscriptions' ? expiringCount : undefined}
                    onClick={() => {
                      onChange(it.key)
                      onNavigate?.()
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1.5 border-t border-sidebar-border px-2.5 py-2.5">
          <UserCard collapsed={collapsed} />
          <LogoutButton collapsed={collapsed} />
          <StatusCard collapsed={collapsed} />
        </div>
      </aside>
    </TooltipProvider>
  )
}

/* ───────────────────────── Topbar pieces ───────────────────────── */

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function LiveClock({ timeZone = 'Africa/Cairo' }: { timeZone?: string }) {
  const [now, setNow] = React.useState<Date | null>(null)
  React.useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!now) return <div className="h-9 w-[220px] shrink-0 animate-pulse rounded-xl bg-muted/50" />

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const pad = (n: number | string) => String(n).padStart(2, '0')
  const hour24 = Number(get('hour')) % 24
  const period = hour24 >= 12 ? 'م' : 'ص'
  const h12 = hour24 % 12 || 12
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))

  return (
    <div className="inline-flex shrink-0 items-stretch overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
        </span>
        <div dir="ltr" className="flex items-baseline gap-px tabular-nums">
          <span className="text-sm font-bold tracking-tight text-foreground">
            {pad(h12)}:{pad(get('minute'))}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground/60">:{pad(get('second'))}</span>
          <span className="mr-1 text-[10px] font-bold text-muted-foreground">{period}</span>
        </div>
      </div>
      <div className="my-1.5 w-px shrink-0 bg-border" />
      <div className="flex items-center gap-1.5 bg-muted/30 px-3 py-1.5">
        <CalendarDays className="size-3 shrink-0 text-muted-foreground/50" />
        <span dir="rtl" className="whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
          {WEEKDAYS[wd] ?? ''}، {get('day')} {MONTHS[Number(get('month')) - 1]} {get('year')}
        </span>
      </div>
    </div>
  )
}

/** بحث انتقال سريع بين صفحات الأدمن — ⌘K / Ctrl+K أو "/" */
function QuickJump({ onGo }: { onGo: (v: AdminView) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const [value, setValue] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [hi, setHi] = React.useState(0)

  const results = React.useMemo(() => {
    const q = value.trim()
    if (!q) return ALL_NAV
    return ALL_NAV.filter((n) => n.label.includes(q) || n.hint.includes(q) || n.key.includes(q.toLowerCase()))
  }, [value])

  React.useEffect(() => setHi(0), [value])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName ?? '')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    const outside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('mousedown', outside)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('mousedown', outside)
    }
  }, [])

  const go = (v: AdminView) => {
    onGo(v)
    setValue('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div ref={wrapRef} className="relative max-w-md flex-1" role="search">
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
        <Search className="size-4" />
      </div>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setValue(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHi((i) => Math.min(i + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && results[hi]) {
            e.preventDefault()
            go(results[hi].key)
          } else if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
        placeholder="انتقل إلى صفحة… (محلات، اشتراكات، إيرادات)"
        aria-label="انتقال سريع"
        className={cn(
          'h-9 w-full rounded-xl border border-input bg-card/80 pl-16 pr-9 text-sm',
          'shadow-xs backdrop-blur-sm transition-all',
          'placeholder:text-muted-foreground/70 hover:border-input-hover',
          'focus-visible:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30',
        )}
      />
      <kbd className="absolute inset-y-0 left-3 my-auto hidden h-5 items-center gap-0.5 rounded border border-border bg-muted/60 px-1.5 font-mono text-[10px] font-semibold text-muted-foreground sm:flex">
        <Command className="size-2.5" />K
      </kbd>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">لا توجد نتائج</p>
          ) : (
            results.map((n, i) => {
              const Icon = n.icon
              return (
                <button
                  key={n.key}
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => go(n.key)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-right transition-colors',
                    i === hi ? 'bg-amber-500/10' : 'hover:bg-muted',
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-semibold">{n.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{n.hint}</span>
                  </span>
                  {i === hi && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function ExpiringBell({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={count > 0 ? `${count} اشتراك ينتهي خلال 7 أيام` : 'لا توجد تنبيهات'}
      aria-label="تنبيهات الاشتراكات"
      className="shell-icon-btn relative"
    >
      <Bell className="size-[18px]" strokeWidth={2} />
      {count > 0 && (
        <span className="absolute -left-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9.5px] font-bold tabular-nums text-white ring-2 ring-card">
          {count}
        </span>
      )}
    </button>
  )
}

function AdminPill({ compact }: { compact?: boolean }) {
  const user = useShopStore((s) => s.user)
  const name = user?.name?.trim() || 'الأدمن'
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-border bg-card/80 px-2.5 py-1.5 shadow-xs backdrop-blur-sm',
        'transition-all duration-base hover:border-amber-500/30 hover:bg-card hover:shadow-sm',
      )}
    >
      <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 ring-1 ring-amber-300/40">
        <span aria-hidden className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/25" />
        <Crown className="relative size-3.5 text-white" strokeWidth={2.3} />
      </span>
      {!compact && (
        <div className="hidden min-w-0 leading-tight sm:block">
          <p className="max-w-[120px] truncate text-[12px] font-bold text-foreground" title={name}>
            {name}
          </p>
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 text-[9.5px] font-extrabold tracking-wide text-amber-700 dark:text-amber-300">
            أدمن أعلى
          </span>
        </div>
      )}
    </div>
  )
}

function Divider() {
  return <div className="header-divider" />
}

/** Desktop topbar (lg+): [عنوان الصفحة] [بحث ⌘K] [ساعة] [theme | bell | admin] */
function AdminDesktopTopbar({
  active,
  expiringCount,
  onChange,
}: {
  active: AdminView
  expiringCount: number
  onChange: (v: AdminView) => void
}) {
  const item = NAV_BY_KEY[active]
  const Icon = item.icon
  return (
    <header
      className={cn(
        'sticky top-0 z-20 hidden h-16 shrink-0 items-center gap-4 lg:flex',
        'border-b border-border bg-card/70 px-6 backdrop-blur-xl',
        'shadow-[0_1px_0_0_rgba(15,23,42,0.04)]',
      )}
    >
      {/* Page identity */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm ring-1 ring-amber-300/40">
          <Icon className="size-[18px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 leading-tight">
          <h2 className="truncate text-[15px] font-bold">{item.label}</h2>
          <p className="truncate text-[11.5px] text-muted-foreground">{item.hint}</p>
        </div>
      </div>

      <QuickJump onGo={onChange} />

      <div className="flex flex-1 justify-center">
        <LiveClock />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Divider />
        <ExpiringBell count={expiringCount} onClick={() => onChange('subscriptions')} />
        <Divider />
        <AdminPill />
      </div>
    </header>
  )
}

/** Mobile / tablet topbar (< lg) */
function AdminMobileTopbar({
  active,
  expiringCount,
  onMenuOpen,
  onChange,
}: {
  active: AdminView
  expiringCount: number
  onMenuOpen: () => void
  onChange: (v: AdminView) => void
}) {
  const item = NAV_BY_KEY[active]
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 lg:hidden',
        'border-b border-border bg-card/80 px-3 backdrop-blur-xl',
        'pt-[env(safe-area-inset-top)] shadow-sm',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onMenuOpen}
          aria-label="فتح القائمة"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm ring-1 ring-amber-300/40">
          <item.icon className="size-[18px]" strokeWidth={2.1} />
        </span>
        <span className="truncate text-sm font-bold">{item.label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <Divider />
        <ExpiringBell count={expiringCount} onClick={() => onChange('subscriptions')} />
        <Divider />
        <AdminPill compact />
      </div>
    </header>
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
  const active: AdminView = (urlView && ALL_NAV.some(n => n.key === urlView)) ? urlView : 'dashboard'

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
      case 'tracking':
        return <AdminTrackingView />
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

      {/* Mobile / tablet top bar — below lg */}
      <AdminMobileTopbar
        active={active}
        expiringCount={expiringCount}
        onMenuOpen={() => setMobileOpen(true)}
        onChange={setActive}
      />

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
        {/* Desktop top bar — lg+ */}
        <AdminDesktopTopbar active={active} expiringCount={expiringCount} onChange={setActive} />

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
