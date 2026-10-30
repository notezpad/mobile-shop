'use client'

/**
 * hr-ui — نظام واجهة الموارد البشرية (الإصدار الثالث — "غرفة عمليات الفريق").
 * ──────────────────────────────────────────────────────────────────────
 * لغة تصميم مستقلة تمامًا عن باقي صفحات النظام:
 *   • Aurora Hero — هيرو بشبكة أورورا متعددة الطبقات بلون هوية الشاشة،
 *     نقشة نقطية دقيقة، أيقونة مائية عملاقة، وشريط أرقام زجاجي مدمج.
 *   • Module Dock — شريط تنقل أفقي بين وحدات الموارد البشرية يخلي
 *     الشاشات السبعة مجموعة واحدة مش صفحات متفرقة.
 *   • عدادات حقيقية: Ring (حلقة SVG متحركة)، Meter (مسطرة بعلامات)،
 *     useCountUp (رقم بيتصاعد)، Reveal (ظهور متدرّج بحركة ناعمة).
 * هوية كل شاشة ثابتة:
 *   الرئيسية زمرد · الموظفين سماوي · الحضور كهرمان · الإجازات فوشيا
 *   التقييمات بنفسجي · السلف مرجاني · الرواتب تركواز.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Award, CalendarDays, Fingerprint, HandCoins, HeartHandshake, Users, Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { KioskAutoFlush } from './KioskQueueBanner'

export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export const PAY_METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'نقدي (الدرج)' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'إنستاباي' },
  { value: 'fawry', label: 'فوري' },
  { value: 'bank', label: 'بنك / تحويل' },
]

export const money = (n: number | null | undefined) =>
  `${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} جنيه`

/** رقم مفصول فقط — للعرض جنب وحدة "جنيه" */
export const num = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('ar-EG-u-nu-latn', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function dayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}

/** GET عبر طبقة api() (كاش/أوفلاين للقراءة فقط) */
export const hrGet = <T,>(url: string) => api<T>(url)

/** كتابة مباشرة (بدون طابور الأوفلاين العام) — التفاصيل في src/lib/hr-client.ts */
export { hrSend } from '@/lib/hr-client'

/* ═══════════════════════ هوية الشاشات (لون + تدرّجات) ═══════════════════════ */

export type HrThemeKey =
  | 'home' | 'employees' | 'attendance' | 'leaves' | 'evaluations' | 'advances' | 'payroll'

export interface HrTheme {
  /** لون الهوية الأساسي (hex) — للتدرجات عبر color-mix */
  hex: string
  /** متغير اللون (للأصناف الثابتة زي bg-primary) */
  varName: string
  solid: string
  solidFg: string
  subtle: string
  dot: string
}

export const HR_THEMES: Record<HrThemeKey, HrTheme> = {
  home: {
    hex: '#10b981', varName: 'var(--primary)',
    solid: 'bg-primary', solidFg: 'text-primary-foreground',
    subtle: 'bg-primary-subtle text-primary-subtle-foreground', dot: 'bg-primary',
  },
  employees: {
    hex: '#0ea5e9', varName: 'var(--info)',
    solid: 'bg-info', solidFg: 'text-info-foreground',
    subtle: 'bg-info-subtle text-info-subtle-foreground', dot: 'bg-info',
  },
  attendance: {
    hex: '#f59e0b', varName: 'var(--warning)',
    solid: 'bg-warning', solidFg: 'text-warning-foreground',
    subtle: 'bg-warning-subtle text-warning-subtle-foreground', dot: 'bg-warning',
  },
  leaves: {
    hex: '#ec4899', varName: 'var(--chart-5)',
    solid: 'bg-pink-500', solidFg: 'text-white',
    subtle: 'bg-pink-500/10 text-pink-700 dark:text-pink-300', dot: 'bg-pink-500',
  },
  evaluations: {
    hex: '#8b5cf6', varName: 'var(--chart-4)',
    solid: 'bg-chart-4', solidFg: 'text-white',
    subtle: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-chart-4',
  },
  advances: {
    hex: '#f43f5e', varName: 'var(--danger)',
    solid: 'bg-danger', solidFg: 'text-danger-foreground',
    subtle: 'bg-danger-subtle text-danger-subtle-foreground', dot: 'bg-danger',
  },
  payroll: {
    hex: '#0d9488', varName: 'var(--stocktake)',
    solid: 'bg-stocktake', solidFg: 'text-stocktake-foreground',
    subtle: 'bg-stocktake-soft text-stocktake-strong', dot: 'bg-stocktake',
  },
}

/** لون نصّي من hex — يقعد مقروء في الفاتح والغامق */
export const ink = (hex: string, strength = 72) =>
  `color-mix(in srgb, ${hex} ${strength}%, var(--foreground))`

/** خلفية شفافة من hex */
export const tint = (hex: string, strength = 12) =>
  `color-mix(in srgb, ${hex} ${strength}%, transparent)`

/* ═══════════════════════ Dock التنقل بين الوحدات ═══════════════════════ */

const DOCK_ITEMS: { href: string; label: string; icon: React.ElementType; theme: HrThemeKey }[] = [
  { href: '/hr', label: 'نظرة عامة', icon: HeartHandshake, theme: 'home' },
  { href: '/hr/employees', label: 'الموظفين', icon: Users, theme: 'employees' },
  { href: '/hr/attendance', label: 'الحضور', icon: Fingerprint, theme: 'attendance' },
  { href: '/hr/leaves', label: 'الإجازات', icon: CalendarDays, theme: 'leaves' },
  { href: '/hr/evaluations', label: 'التقييمات', icon: Award, theme: 'evaluations' },
  { href: '/hr/advances', label: 'السلف', icon: HandCoins, theme: 'advances' },
  { href: '/hr/payroll', label: 'الرواتب', icon: Wallet, theme: 'payroll' },
]

/** شريط تنقل الوحدات — بيخلي صفحات HR جناح واحد متكامل */
export function ModuleDock({ exclude }: { exclude?: HrThemeKey }) {
  const pathname = usePathname()
  const items = DOCK_ITEMS.filter((i) => i.theme !== exclude)
  return (
    <nav
      aria-label="وحدات الموارد البشرية"
      className="relative z-10 mb-4 flex gap-1 overflow-x-auto rounded-2xl border bg-card/80 p-1.5 shadow-sm backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mb-5"
    >
      {items.map((i) => {
        const active = pathname === i.href
        const t = HR_THEMES[i.theme]
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              'group flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold transition-all',
              active ? 'shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={active ? { background: tint(t.hex, 14), color: ink(t.hex, 80) } : undefined}
          >
            <span
              className="grid size-6 place-items-center rounded-lg transition-transform group-hover:scale-110"
              style={{ background: active ? t.hex : tint(t.hex, 14), color: active ? '#fff' : ink(t.hex, 85) }}
            >
              <i.icon className="size-3.5" strokeWidth={2.4} />
            </span>
            {i.label}
          </Link>
        )
      })}
    </nav>
  )
}

/* ═══════════════════════ Aurora Hero ═══════════════════════ */

/**
 * هيرو الأورورا: طبقات ضباب ملوّنة + نقشة نقطية + أيقونة مائية عملاقة.
 * children = شريط الأرقام الزجاجي اللي بيتحط جوه الهيرو نفسه.
 */
export function HrHero({
  theme, icon: Icon, kicker, title, subtitle, actions, children,
}: {
  theme: HrThemeKey
  icon: React.ElementType
  kicker?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const t = HR_THEMES[theme]
  return (
    <section
      className="hr-reveal relative mb-4 overflow-hidden rounded-[28px] border bg-card text-card-foreground shadow-sm sm:mb-5"
    >
      {/* ── طبقات الأورورا ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-32 start-[12%] size-[420px] rounded-full opacity-[0.16] blur-3xl dark:opacity-[0.25]"
          style={{ background: t.hex }}
        />
        <div
          className="absolute -bottom-40 -start-20 size-[340px] rounded-full opacity-[0.10] blur-3xl dark:opacity-[0.16]"
          style={{ background: t.hex }}
        />
        <div
          className="absolute -top-20 end-[8%] size-[220px] rounded-full opacity-[0.08] blur-2xl dark:opacity-[0.12]"
          style={{ background: t.hex }}
        />
        {/* نقشة نقطية دقيقة بتتلاشى لتحت */}
        <div
          className="absolute inset-x-0 top-0 h-40 opacity-[0.5] dark:opacity-[0.35]"
          style={{
            backgroundImage: `radial-gradient(${tint(t.hex, 30)} 1.1px, transparent 1.1px)`,
            backgroundSize: '16px 16px',
            maskImage: 'linear-gradient(to bottom, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
          }}
        />
        {/* خط هوية سفلي */}
        <div
          className="absolute inset-x-0 bottom-0 h-[3px]"
          style={{ background: `linear-gradient(to left, ${t.hex}, ${tint(t.hex, 25)} 55%, transparent)` }}
        />
      </div>

      {/* ── أيقونة مائية عملاقة ── */}
      <Icon
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -start-5 size-48 rotate-6 opacity-[0.05] dark:opacity-[0.07]"
        strokeWidth={0.9}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg ring-1 ring-black/10 sm:size-[52px]"
            style={{ background: `linear-gradient(140deg, ${t.hex}, color-mix(in srgb, ${t.hex} 68%, black))` }}
          >
            <Icon className="size-6" strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            {kicker && (
              <p
                className="mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: tint(t.hex, 12), color: ink(t.hex, 78) }}
              >
                <span className="size-1.5 rounded-full" style={{ background: t.hex }} />
                {kicker}
              </p>
            )}
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="relative z-10 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children && (
        <div className="relative px-3 pb-3 sm:px-5 sm:pb-5">{children}</div>
      )}
    </section>
  )
}

/* ═══════════════════════ الشريط الزجاجي للأرقام داخل الهيرو ═══════════════════════ */

/** شريط زجاجي بيقسم نفسه على عدد الخلايا — بيتركّب جوه HrHero children */
export function GlassRail({ children, className }: { children: React.ReactNode; className?: string }) {
  const n = React.Children.count(children)
  return (
    <div
      className={cn(
        'grid grid-cols-2 divide-x divide-y divide-white/15 overflow-hidden rounded-2xl border border-white/25 bg-white/45 shadow-inner backdrop-blur-md dark:border-white/10 dark:bg-white/[0.055] sm:grid-cols-4 sm:divide-y-0',
        n === 3 && 'sm:grid-cols-3',
        n === 2 && 'sm:grid-cols-2',
        className,
      )}
      style={{ direction: 'rtl' }}
    >
      {children}
    </div>
  )
}

export function GlassStat({
  label, value, foot, loading, className, valueClass,
}: {
  label: React.ReactNode
  value: React.ReactNode
  foot?: React.ReactNode
  loading?: boolean
  className?: string
  valueClass?: string
}) {
  return (
    <div className={cn('min-w-0 px-3.5 py-3 sm:px-4 sm:py-3.5', className)}>
      <p className="truncate text-[11px] font-bold text-muted-foreground sm:text-xs">{label}</p>
      {loading ? (
        <div className="mt-1.5 h-7 w-24 animate-pulse rounded-lg bg-muted/70" />
      ) : (
        <p className={cn('mt-1 break-words text-lg font-black leading-tight tabular-nums tracking-tight sm:text-xl', valueClass)}>
          {value}
        </p>
      )}
      {foot && <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground sm:text-[11px]">{foot}</div>}
    </div>
  )
}

/* ═══════════════════════ عدّاد الأرقام المتحرك ═══════════════════════ */

/** رقم بيتصاعد من صفر لقيمته بحركة ناعمة (rAF) */
export function CountUp({
  value, decimals = 0, duration = 850, className,
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = React.useState(0)
  const fromRef = React.useRef(0)
  React.useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (value - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return (
    <span className={cn('tabular-nums', className)}>
      {display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  )
}

/* ═══════════════════════ Ring — حلقة متحركة ═══════════════════════ */

export function Ring({
  value, size = 128, stroke = 11, hex, children, delay = 150,
}: {
  /** نسبة 0-100 */
  value: number
  size?: number
  stroke?: number
  hex: string
  children?: React.ReactNode
  delay?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const [shown, setShown] = React.useState(0)
  React.useEffect(() => {
    const id = setTimeout(() => setShown(pct), delay)
    return () => clearTimeout(id)
  }, [pct, delay])
  const gid = React.useId()
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={hex} />
            <stop offset="100%" stopColor={`color-mix(in srgb, ${hex} 55%, white)`} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/* ═══════════════════════ Meter — مسطرة بعلامات قياس ═══════════════════════ */

/** مسطرة تقدم بعلامات تقسيم — للسلف بالأقساط وغيرها */
export function Meter({
  pct, hex, ticks = 0, className, height = 10,
}: {
  pct: number
  hex: string
  ticks?: number
  className?: string
  height?: number
}) {
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-full bg-muted', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${v}%`, background: `linear-gradient(to left, ${hex}, color-mix(in srgb, ${hex} 60%, white))` }}
      />
      {ticks > 1 && (
        <div aria-hidden className="absolute inset-0 flex">
          {Array.from({ length: ticks - 1 }).map((_, i) => (
            <div key={i} className="flex-1 border-e-2 border-background/70 last:border-0" />
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ Reveal — ظهور متدرّج (CSS خالص) ═══════════════════════ */

export function Reveal({
  children, delay = 0, className,
}: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div className={cn('hr-reveal', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}

/* ═══════════════════════ عناصر مشتركة ═══════════════════════ */

/** بطاقة محتوى موحّدة */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-3xl border bg-card shadow-sm', className)}>{children}</div>
}

export function PanelTitle({
  icon: Icon, title, action, className, hex,
}: {
  icon?: React.ElementType
  title: React.ReactNode
  action?: React.ReactNode
  className?: string
  hex?: string
}) {
  return (
    <div className={cn('mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5', className)}>
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        {Icon && (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg"
            style={{ background: tint(hex ?? '#10b981', 13), color: ink(hex ?? '#10b981', 80) }}
          >
            <Icon className="size-4" strokeWidth={2.4} />
          </span>
        )}
        {title}
      </h2>
      {action}
    </div>
  )
}

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  slate: 'bg-muted text-muted-foreground',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  pink: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
  teal: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
} as const
export type Tone = keyof typeof TONES

const TONE_DOTS: Record<Tone, string> = {
  emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
  sky: 'bg-sky-500', slate: 'bg-muted-foreground/60', violet: 'bg-violet-500',
  pink: 'bg-pink-500', teal: 'bg-teal-500',
}

export function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', TONES[tone])}>{children}</span>
}

export function StatusChip({
  children, tone = 'slate', className,
}: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold', TONES[tone], className)}>
      <span className={cn('size-1.5 rounded-full', TONE_DOTS[tone])} />
      {children}
    </span>
  )
}

export function EmptyState({
  title, hint, action, icon: Icon, theme = 'home',
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  icon?: React.ElementType
  theme?: HrThemeKey
}) {
  const t = HR_THEMES[theme]
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-dashed bg-card/60 px-6 py-14 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(460px 180px at 50% 0%, ${tint(t.hex, 9)}, transparent)` }}
      />
      {Icon && (
        <span
          className="relative mx-auto mb-4 grid size-16 place-items-center rounded-[20px] text-white shadow-lg"
          style={{ background: `linear-gradient(140deg, ${t.hex}, color-mix(in srgb, ${t.hex} 65%, black))` }}
        >
          <Icon className="size-8" strokeWidth={1.8} />
        </span>
      )}
      <p className="relative text-lg font-black">{title}</p>
      {hint && <p className="relative mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="relative mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl p-3 sm:p-6">
      <KioskAutoFlush />
      {children}
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      <div className="h-24 animate-pulse rounded-[28px] bg-muted/60" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/50" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}
