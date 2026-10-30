'use client'

/**
 * hr-ui — نظام واجهة الموارد البشرية (الإصدار الثاني).
 * ──────────────────────────────────────────────────────────────────────
 * نفس لغة لوحة التحكم الرئيسية بس أغنى: هيرو بخط هوية وحلقات زخرفية
 * وتدرّج قوي بلون كل شاشة، شريط أرقام بيقيس عدد الخلايا، وحالات فارغة
 * ملوّنة بهوية الشاشة. لكل شاشة شخصية لونية ثابتة:
 *   الموظفين أزرق · الحضور كهرمان · الإجازات زيتي · التقييمات بنفسجي
 *   السلف أحمر · الرواتب والرئيسية أخضر (العلامة).
 */

import * as React from 'react'
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

/* ─────────────────────── هوية الشاشات (لون + تدرّج) ─────────────────────── */

export type HrThemeKey =
  | 'home' | 'employees' | 'attendance' | 'leaves' | 'evaluations' | 'advances' | 'payroll'

export interface HrTheme {
  /** متغير اللون الأساسي للهوية (للتدرّجات عبر color-mix) */
  varName: string
  /** خلفية صلبة للأيقونة/النقطة */
  solid: string
  /** لون نصّي للأيقونة فوق الصلب */
  solidFg: string
  /** شارة خفيفة بنفس اللون */
  subtle: string
  /** نقطة ملوّنة لشريط الأرقام */
  dot: string
}

export const HR_THEMES: Record<HrThemeKey, HrTheme> = {
  home: {
    varName: 'var(--primary)',
    solid: 'bg-primary', solidFg: 'text-primary-foreground',
    subtle: 'bg-primary-subtle text-primary-subtle-foreground', dot: 'bg-primary',
  },
  employees: {
    varName: 'var(--info)',
    solid: 'bg-info', solidFg: 'text-info-foreground',
    subtle: 'bg-info-subtle text-info-subtle-foreground', dot: 'bg-info',
  },
  attendance: {
    varName: 'var(--warning)',
    solid: 'bg-warning', solidFg: 'text-warning-foreground',
    subtle: 'bg-warning-subtle text-warning-subtle-foreground', dot: 'bg-warning',
  },
  leaves: {
    varName: 'var(--stocktake)',
    solid: 'bg-stocktake', solidFg: 'text-stocktake-foreground',
    subtle: 'bg-stocktake-soft text-stocktake-strong', dot: 'bg-stocktake',
  },
  evaluations: {
    varName: 'var(--chart-4)',
    solid: 'bg-chart-4', solidFg: 'text-white',
    subtle: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-chart-4',
  },
  advances: {
    varName: 'var(--danger)',
    solid: 'bg-danger', solidFg: 'text-danger-foreground',
    subtle: 'bg-danger-subtle text-danger-subtle-foreground', dot: 'bg-danger',
  },
  payroll: {
    varName: 'var(--primary)',
    solid: 'bg-primary', solidFg: 'text-primary-foreground',
    subtle: 'bg-primary-subtle text-primary-subtle-foreground', dot: 'bg-primary',
  },
}

/* ─────────────────────── الهيرو — رأس الصفحة بهوية الشاشة ─────────────────────── */

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
    <section className="relative mb-4 overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm sm:mb-5">
      {/* خط الهوية العلوي */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: `linear-gradient(to left, color-mix(in srgb, ${t.varName} 85%, transparent), color-mix(in srgb, ${t.varName} 28%, transparent) 60%, transparent)`,
        }}
      />
      {/* حلقات زخرفية خفيفة في الزاوية */}
      <div
        aria-hidden
        className="pointer-events-none absolute -end-12 -top-16 size-44 rounded-full border-[12px] opacity-[0.05]"
        style={{ borderColor: t.varName }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-24 -top-24 size-72 rounded-full border-[16px] opacity-[0.035]"
        style={{ borderColor: t.varName }}
      />
      <div
        className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4 sm:p-6"
        style={{ background: `radial-gradient(620px 240px at 100% 0%, color-mix(in srgb, ${t.varName} 14%, transparent), transparent)` }}
      >
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-2xl shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] sm:size-12',
              t.solid, t.solidFg,
            )}
          >
            <Icon className="size-5 sm:size-6" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            {kicker && (
              <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', t.dot)} />
                {kicker}
              </p>
            )}
            <h1 className="text-xl font-extrabold tracking-tight sm:text-[26px]">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/* ─────────────────────── شريط الأرقام الموحّد (زي الداشبورد) ─────────────────────── */

export function StatStrip({
  children, className,
}: { children: React.ReactNode; className?: string }) {
  const n = React.Children.count(children)
  return (
    <div className={cn('overflow-hidden rounded-3xl border bg-card shadow-sm', className)}>
      <div
        className={cn(
          'grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0',
          n === 3 && 'lg:grid-cols-3',
          n >= 4 && 'lg:grid-cols-4',
        )}
        data-cols={n}
      >
        {children}
      </div>
    </div>
  )
}

export function StatCell({
  label, value, foot, dot, loading, className,
}: {
  label: string
  value: React.ReactNode
  foot?: React.ReactNode
  dot?: string
  loading?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0 p-3.5 transition-colors hover:bg-muted/40 sm:p-5', className)}>
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
        {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} />}
        <span className="truncate">{label}</span>
      </p>
      {loading ? (
        <div className="mt-2 h-7 w-28 animate-pulse rounded-lg bg-muted/70" />
      ) : (
        <p className="mt-1.5 break-words text-[17px] font-extrabold leading-snug tracking-tight tabular-nums text-foreground min-[400px]:text-xl sm:text-2xl">
          {value}
        </p>
      )}
      {foot && <div className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{foot}</div>}
    </div>
  )
}

/* ─────────────────────── عنوان قسم موحّد ─────────────────────── */

export function PanelTitle({
  icon: Icon, title, action, className,
}: {
  icon?: React.ElementType
  title: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5', className)}>
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" strokeWidth={2.4} />
          </span>
        )}
        {title}
      </h2>
      {action}
    </div>
  )
}

/* ─────────────────────── شارات وشارات حالة ─────────────────────── */

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  slate: 'bg-muted text-muted-foreground',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
} as const
export type Tone = keyof typeof TONES

export function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', TONES[tone])}>{children}</span>
}

/** شارة بنقطة حالة — زي شارات الداشبورد */
export function StatusChip({
  children, tone = 'slate', className,
}: { children: React.ReactNode; tone?: Tone; className?: string }) {
  const dotCls: Record<Tone, string> = {
    emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
    sky: 'bg-sky-500', slate: 'bg-muted-foreground/60', violet: 'bg-violet-500',
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold', TONES[tone], className)}>
      <span className={cn('size-1.5 rounded-full', dotCls[tone])} />
      {children}
    </span>
  )
}

/* ─────────────────────── حالات فارغة وهياكل ─────────────────────── */

/** حالة فارغة بهوية الشاشة — أيقونة صلبة ملوّنة وتدرّج هادي */
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
    <div className="relative overflow-hidden rounded-3xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(420px 170px at 50% 0%, color-mix(in srgb, ${t.varName} 9%, transparent), transparent)` }}
      />
      {Icon && (
        <span className={cn('relative mx-auto mb-3 grid size-14 place-items-center rounded-2xl shadow-sm', t.solid, t.solidFg)}>
          <Icon className="size-7" strokeWidth={2} />
        </span>
      )}
      <p className="relative text-base font-bold">{title}</p>
      {hint && <p className="relative mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="relative mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** بطاقة محتوى موحّدة (قوائم/جداول/أقسام) */
export function Panel({
  children, className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-3xl border bg-card shadow-sm', className)}>
      {children}
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
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
      ))}
    </div>
  )
}

/* ─────────────────────── (توافق قديم) PageHead/Stat ─────────────────────── */

export function PageHead({
  title, subtitle, actions,
}: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const STAT_DOTS: Record<Tone, string> = {
  emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
  sky: 'bg-sky-500', slate: 'bg-muted-foreground/60', violet: 'bg-violet-500',
}

/** (توافق قديم) بطاقة رقم واحدة — الشاشات الجديدة بتستخدم StatStrip + StatCell */
export function Stat({
  label, value, hint, tone = 'slate',
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn('size-2 shrink-0 rounded-full', STAT_DOTS[tone])} />
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
