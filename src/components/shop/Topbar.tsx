'use client'

/**
 * Topbar — Premium 2026 Edition
 * ==================================================
 * Replaces the inline header in (shop)/layout.tsx.
 *
 * Layout (desktop, lg+):
 *   [Quick search ⌘K]      [Live clock + date]      [theme | bell | POS CTA | user pill]
 *
 * Layout (mobile, < lg):
 *   [☰] [brand] [search]              [theme | bell | role]
 *
 * Design tokens used:
 *   --background, --card, --border, --muted, --foreground,
 *   --primary, --primary-subtle, --brand-500/600, --destructive
 *
 * All subcomponents are local to this file so the layout stays clean.
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, Home, Search, ShoppingCart, Menu, X, Command, Loader2, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './ThemeToggle'
import { NotificationBell } from './NotificationBell'
import { RoleBadge } from './RoleBadge'

/* ───────────────────────── helpers ───────────────────────── */

const WEEKDAY_MAP: Record<string, string> = {
  Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء',
  Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت',
}

function getWallTimeInTz(date: Date, timeZone: string) {
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
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
    day: Number(get('day')),
    month: Number(get('month')),
    year: Number(get('year')),
  }
}

/* ───────────────────────── LiveClock ───────────────────────── */

function LiveClock({ timeZone }: { timeZone: string }) {
  const [mounted, setMounted] = React.useState(false)
  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!mounted) {
    return <div className="h-9 w-[220px] shrink-0 rounded-xl bg-muted/50 animate-pulse" />
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const wall = getWallTimeInTz(now, timeZone)
  let h = wall.hour
  const period = h >= 12 ? 'م' : 'ص'
  h = h % 12 || 12
  const m = pad(wall.minute)
  const s = pad(wall.second)
  const dayName = WEEKDAY_MAP[wall.weekday] || wall.weekday
  const day = wall.day
  const month = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][wall.month - 1]
  const year = wall.year

  return (
    <div className="inline-flex items-stretch shrink-0 rounded-xl border border-border bg-card/80 shadow-sm overflow-hidden backdrop-blur-sm">
      {/* Time */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        <div dir="ltr" className="flex items-baseline gap-px tabular-nums">
          <span className="text-sm font-bold tracking-tight text-foreground">{pad(h)}:{m}</span>
          <span className="text-[11px] font-medium text-muted-foreground/60">:{s}</span>
          <span className="text-[10px] font-bold text-muted-foreground mr-1">{period}</span>
        </div>
      </div>

      <div className="w-px bg-border my-1.5 shrink-0" />

      {/* Date */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30">
        <CalendarDays className="size-3 text-muted-foreground/50 shrink-0" />
        <span
          dir="rtl"
          className="whitespace-nowrap text-[11px] font-semibold text-muted-foreground"
        >
          {dayName}، {day} {month} {year}
        </span>
      </div>
    </div>
  )
}

/* ───────────────────────── QuickSearch ───────────────────────── */

function QuickSearch() {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [value, setValue] = React.useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = value.trim()
    if (!q) {
      router.push('/products')
      return
    }
    router.push(`/products?search=${encodeURIComponent(q)}`)
    inputRef.current?.blur()
  }

  // ⌘K / Ctrl+K to focus the search from anywhere
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      // "/" focuses search when not already in an input
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName ?? '')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <form
      onSubmit={submit}
      className="relative flex-1 max-w-md"
      role="search"
      aria-label="بحث سريع عن المنتجات"
    >
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
        <Search className="size-4" />
      </div>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ابحث عن منتج بالاسم أو الباركود…"
        aria-label="بحث سريع"
        className={cn(
          'h-9 w-full rounded-xl border border-input bg-card/80 pr-9 pl-16 text-sm',
          'shadow-xs backdrop-blur-sm transition-all',
          'placeholder:text-muted-foreground/70',
          'hover:border-input-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary',
        )}
      />
      <kbd
        className={cn(
          'absolute inset-y-0 left-3 my-auto hidden h-5 items-center gap-0.5 rounded border border-border bg-muted/60 px-1.5 text-[10px] font-mono font-semibold text-muted-foreground',
          'sm:flex',
        )}
      >
        <Command className="size-2.5" />
        K
      </kbd>
    </form>
  )
}

/* ───────────────────────── POS CTA ───────────────────────── */

function PosCta() {
  return (
    <Link
      href="/pos"
      className={cn(
        'group relative inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-bold',
        'bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 text-white',
        'shadow-[0_2px_8px_-2px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.18)]',
        'ring-1 ring-brand-400/30',
        'transition-all duration-base ease-out',
        'hover:shadow-[0_4px_14px_-2px_rgba(16,185,129,0.55),inset_0_1px_0_rgba(255,255,255,0.22)]',
        'hover:-translate-y-px active:translate-y-0 active:scale-[0.98]',
      )}
      title="نقطة البيع"
    >
      <span className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 via-white/0 to-white/15 pointer-events-none" />
      <ShoppingCart className="relative size-4 shrink-0 transition-transform group-hover:scale-105" strokeWidth={2.4} />
      <span className="relative hidden sm:inline">نقطة بيع</span>
    </Link>
  )
}

/* ───────────────────────── UserPill ───────────────────────── */

interface UserLike {
  name?: string | null
  email?: string | null
  role?: string | null
}

function UserPill({ user }: { user: UserLike | null }) {
  const name = user?.name?.trim() || 'مستخدم'
  // Initial: first letter of the first word (or fallback)
  const initial = name.charAt(0)

  return (
    <Link
      href="/settings"
      className={cn(
        'group flex items-center gap-2.5 rounded-xl border border-border bg-card/80 px-2.5 py-1.5',
        'shadow-xs backdrop-blur-sm transition-all duration-base',
        'hover:bg-card hover:border-primary/30 hover:shadow-sm',
      )}
      title="الملف الشخصي والإعدادات"
    >
      {/* Avatar */}
      <span
        className={cn(
          'relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg',
          'bg-gradient-to-br from-brand-500 to-brand-700',
          'ring-1 ring-brand-400/30',
        )}
      >
        <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/0 to-white/20" />
        <span className="relative text-[11px] font-bold text-white">{initial}</span>
      </span>
      {/* Name + role */}
      <div className="hidden min-w-0 leading-tight sm:block">
        <p className="max-w-[120px] truncate text-[12px] font-bold text-foreground" title={name}>
          {name}
        </p>
        <div className="mt-0.5">
          <RoleBadge role={user?.role as any} />
        </div>
      </div>
    </Link>
  )
}

/* ───────────────────────── Mobile search ───────────────────────── */

function MobileSearchButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      // Focus on next tick
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Esc closes
  React.useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = value.trim()
    setOpen(false)
    if (!q) {
      router.push('/products')
      return
    }
    router.push(`/products?search=${encodeURIComponent(q)}`)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="بحث سريع"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="size-[18px]" />
      </button>
    )
  }

  // Full-width overlay search row (replaces the top bar contents)
  return (
    <form
      onSubmit={submit}
      className="absolute inset-0 z-50 flex items-center gap-2 bg-card px-3"
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="إغلاق البحث"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
      >
        <X className="size-5" />
      </button>
      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
          <Search className="size-4" />
        </div>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ابحث عن منتج…"
          aria-label="بحث"
          className="h-9 w-full rounded-xl border border-input bg-background pr-9 pl-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <button
        type="submit"
        className="h-9 shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95"
      >
        بحث
      </button>
    </form>
  )
}

/* ───────────────────────── Brand mark (mobile) ───────────────────────── */

function MobileBrandMark() {
  return (
    <Link
      href="/dashboard"
      aria-label="الرئيسية — لوحة المعلومات"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-xl',
        'bg-gradient-to-br from-brand-600 to-brand-800 text-white',
        'shadow-sm ring-1 ring-brand-500/20',
        'transition-transform active:scale-90',
      )}
    >
      <Home className="size-[18px]" strokeWidth={1.9} />
    </Link>
  )
}

/* ───────────────────────── Divider ───────────────────────── */

function Divider() {
  return <div className="header-divider" />
}

/* ───────────────────────── Desktop topbar ───────────────────────── */

export interface TopbarProps {
  user: UserLike | null
  timeZone: string
}

export function DesktopTopbar({ user, timeZone }: TopbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 hidden h-16 shrink-0 items-center gap-3 lg:flex',
        'border-b border-border bg-card/70 backdrop-blur-xl px-6',
        'shadow-[0_1px_0_0_rgba(15,23,42,0.04)]',
      )}
    >
      {/* Right (RTL start): Quick search */}
      <QuickSearch />

      {/* Center: Live clock */}
      <div className="flex-1 flex justify-center">
        <LiveClock timeZone={timeZone || 'Africa/Cairo'} />
      </div>

      {/* Left (RTL end): actions */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Divider />
        <NotificationBell />
        <Divider />
        <PosCta />
        <Divider />
        <UserPill user={user} />
      </div>
    </header>
  )
}

/* ───────────────────────── Mobile topbar ───────────────────────── */

export interface MobileTopbarProps {
  user: UserLike | null
  onMenuOpen: () => void
}

export function MobileTopbar({ user, onMenuOpen }: MobileTopbarProps) {
  return (
    <header
      className={cn(
        'relative z-30 flex h-14 shrink-0 items-center justify-between gap-2',
        'border-b border-border bg-card/80 backdrop-blur-xl px-3',
        'pt-[env(safe-area-inset-top)] shadow-sm lg:hidden',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onMenuOpen}
          aria-label="فتح القائمة"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Menu className="size-5" />
        </button>
        <MobileBrandMark />
        <Divider />
        <MobileSearchButton />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <Divider />
        <NotificationBell />
        <Divider />
        <RoleBadge role={user?.role as any} />
      </div>
    </header>
  )
}
