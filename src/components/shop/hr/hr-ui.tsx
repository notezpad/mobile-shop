'use client'

/**
 * hr-ui — نظام واجهة الموارد البشرية (الإصدار الثالث).
 * ──────────────────────────────────────────────────────────────────────
 * نفس لغة لوحة التحكم الرئيسية بس أغنى: هيرو بخط هوية وحلقات زخرفية
 * وتدرّج قوي بلون كل شاشة، شريط أرقام بيقيس عدد الخلايا، وحالات فارغة
 * ملوّنة بهوية الشاشة. لكل شاشة شخصية لونية ثابتة:
 *   الموظفين أزرق · الحضور كهرمان · الإجازات زيتي · التقييمات بنفسجي
 *   السلف أحمر · الرواتب والرئيسية أخضر (العلامة).
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Award, CalendarDays, ChevronLeft, ChevronRight, Fingerprint, HandCoins, LayoutDashboard, Search, Users, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
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

export interface HeroMetric {
  label: string
  value: React.ReactNode
  unit?: string
  foot?: React.ReactNode
  loading?: boolean
}

/**
 * الهيرو الجديد — بنفس لغة الخزنة والموردين: تدرّج بلون الشاشة بعرض الصفحة كلها،
 * علامة مائية كبيرة، رقم رئيسي ضخم، منطقة رسم (viz)، وكروت KPI جوّه الهيرو نفسه.
 */
export function HrHero({
  theme, icon: Icon, kicker, title, subtitle, actions, metric, viz, kpis, children,
}: {
  theme: HrThemeKey
  icon: React.ElementType
  kicker?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  metric?: HeroMetric
  viz?: React.ReactNode
  kpis?: React.ReactNode
  children?: React.ReactNode
}) {
  const t = HR_THEMES[theme]
  const v = t.varName
  return (
    <section
      className="animate-in-up motion-reduce:animate-none relative overflow-hidden rounded-3xl border shadow-sm"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${v} 16%, var(--card)) 0%, var(--card) 52%, color-mix(in srgb, ${v} 7%, var(--card)) 100%)`,
        borderColor: `color-mix(in srgb, ${v} 22%, var(--border))`,
      }}
    >
      {/* شريط الهوية العلوي */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(to left, ${v}, color-mix(in srgb, ${v} 30%, transparent) 70%, transparent)` }}
      />
      {/* علامة مائية كبيرة */}
      <Icon
        aria-hidden
        strokeWidth={1}
        className="pointer-events-none absolute -bottom-10 -start-8 size-64 opacity-[0.06] sm:size-72"
        style={{ color: v }}
      />
      {/* نقاط ناعمة */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: `radial-gradient(color-mix(in srgb, ${v} 22%, transparent) 1px, transparent 1.3px)`,
          backgroundSize: '18px 18px',
          maskImage: 'linear-gradient(to left, black, transparent 55%)',
          WebkitMaskImage: 'linear-gradient(to left, black, transparent 55%)',
        }}
      />
      {/* هالة لونية */}
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-24 size-72 rounded-full opacity-25 blur-3xl dark:opacity-30"
        style={{ backgroundColor: v }}
      />

      <div className="relative p-4 sm:p-6 lg:p-7">
        {/* الصف الأول: الهوية + الأزرار */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-[300px] items-start gap-3.5">
            <span
              className={cn(
                'grid size-12 shrink-0 place-items-center rounded-2xl shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.08] sm:size-14',
                t.solid, t.solidFg,
              )}
            >
              <Icon className="size-6 sm:size-7" strokeWidth={2.1} />
            </span>
            <div className="min-w-0">
              {kicker && (
                <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full', t.dot)} />
                  {kicker}
                </p>
              )}
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:flex-nowrap">{actions}</div>}
        </div>

        {/* الصف الثاني: الرقم الرئيسي + الرسم */}
        {(metric || viz) && (
          <div className={cn('mt-5 grid items-center gap-5 sm:mt-6 lg:gap-8', metric && viz && 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]')}>
            {metric && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground sm:text-sm">{metric.label}</p>
                {metric.loading ? (
                  <div className="mt-2 h-14 w-56 animate-pulse rounded-xl bg-muted/70" />
                ) : (
                  <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-2">
                    <span
                      className="min-w-0 break-words text-4xl font-extrabold leading-none tracking-tight tabular-nums sm:text-5xl md:text-6xl"
                      style={{ color: `color-mix(in srgb, ${v} 80%, var(--foreground))` }}
                    >
                      {metric.value}
                    </span>
                    {metric.unit && <span className="shrink-0 text-base font-semibold text-muted-foreground sm:text-lg">{metric.unit}</span>}
                  </div>
                )}
                {metric.foot && <div className="mt-2 text-xs text-muted-foreground sm:text-[13px]">{metric.foot}</div>}
              </div>
            )}
            {viz && <div className="min-w-0">{viz}</div>}
          </div>
        )}

        {kpis && <div className="mt-5 sm:mt-6">{kpis}</div>}
        {children}
      </div>
    </section>
  )
}

/* ─────────────────────── كروت KPI (زي الخزنة) ─────────────────────── */

const KPI_TONES = {
  emerald: { card: 'from-emerald-50 to-white dark:from-emerald-950/30 dark:to-card border-t-emerald-500', tile: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', track: 'bg-emerald-500/15', wm: 'text-emerald-500' },
  rose: { card: 'from-rose-50 to-white dark:from-rose-950/30 dark:to-card border-t-rose-500', tile: 'bg-rose-500/15 text-rose-600 dark:text-rose-400', text: 'text-rose-700 dark:text-rose-400', bar: 'bg-rose-500', track: 'bg-rose-500/15', wm: 'text-rose-500' },
  sky: { card: 'from-sky-50 to-white dark:from-sky-950/30 dark:to-card border-t-sky-500', tile: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', text: 'text-sky-700 dark:text-sky-400', bar: 'bg-sky-500', track: 'bg-sky-500/15', wm: 'text-sky-500' },
  amber: { card: 'from-amber-50 to-white dark:from-amber-950/30 dark:to-card border-t-amber-500', tile: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500', track: 'bg-amber-500/15', wm: 'text-amber-500' },
  violet: { card: 'from-violet-50 to-white dark:from-violet-950/30 dark:to-card border-t-violet-500', tile: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', text: 'text-violet-700 dark:text-violet-400', bar: 'bg-violet-500', track: 'bg-violet-500/15', wm: 'text-violet-500' },
  slate: { card: 'from-slate-50 to-white dark:from-slate-900/40 dark:to-card border-t-slate-400', tile: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', text: 'text-slate-700 dark:text-slate-300', bar: 'bg-slate-400', track: 'bg-slate-500/15', wm: 'text-slate-500' },
} as const
export type KpiTone = keyof typeof KPI_TONES

export function HrKpi({
  tone, icon: Icon, label, value, sub, progress, progressLabel, loading, className,
}: {
  tone: KpiTone
  icon: React.ElementType
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  progress?: number
  progressLabel?: string
  loading?: boolean
  className?: string
}) {
  const t = KPI_TONES[tone]
  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-2xl border border-t-2 bg-gradient-to-br p-3 transition-shadow hover:shadow-md sm:p-4', t.card, className)}>
      <Icon className={cn('pointer-events-none absolute -bottom-4 -start-3 size-20 opacity-[0.07] sm:size-24', t.wm)} strokeWidth={1.25} />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-sm">{label}</p>
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-xl sm:size-9', t.tile)}>
            <Icon className="size-3.5 sm:size-4" />
          </span>
        </div>
        {loading ? (
          <div className="mt-3 h-7 w-28 animate-pulse rounded-lg bg-muted/70" />
        ) : (
          <p className="mt-2 min-w-0 break-words text-xl font-extrabold tabular-nums sm:text-2xl">{value}</p>
        )}
        {sub && <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{sub}</p>}
        {progress !== undefined && (
          <div className="mt-3 flex items-center gap-2">
            <div className={cn('h-1.5 flex-1 overflow-hidden rounded-full', t.track)}>
              <div className={cn('h-full rounded-full transition-[width] duration-slow', t.bar)} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
            <span className={cn('shrink-0 text-[11px] font-bold tabular-nums', t.text)}>{progressLabel ?? `${Math.round(progress)}%`}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function KpiGrid({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2.5 sm:gap-3',
        cols === 3 && 'lg:grid-cols-3',
        cols === 4 && 'lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ─────────────────────── رسومات صغيرة ─────────────────────── */

const SEG_BG: Record<KpiTone, string> = {
  emerald: 'bg-emerald-500', rose: 'bg-rose-500', sky: 'bg-sky-500',
  amber: 'bg-amber-500', violet: 'bg-violet-500', slate: 'bg-slate-400',
}
const RING_STROKE: Record<KpiTone, string> = {
  emerald: 'stroke-emerald-500', rose: 'stroke-rose-500', sky: 'stroke-sky-500',
  amber: 'stroke-amber-500', violet: 'stroke-violet-500', slate: 'stroke-slate-400',
}

/** شريط مقسّم بنسب (توزيع الحالات) + وسيلة إيضاح */
export function SegBar({
  segments, title, empty = 'لا توجد بيانات',
}: {
  segments: { label: string; value: number; tone: KpiTone; display?: string }[]
  title?: string
  empty?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div className="min-w-0 rounded-2xl border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
      {title && <p className="mb-2.5 text-xs font-bold text-muted-foreground">{title}</p>}
      <div className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full bg-muted/70">
        {total > 0 ? (
          segments.filter((s) => s.value > 0).map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${s.display ?? s.value}`}
              className={cn('h-full rounded-full transition-[width] duration-slow', SEG_BG[s.tone])}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ))
        ) : null}
      </div>
      {total === 0 && <p className="mt-2 text-xs text-muted-foreground">{empty}</p>}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(110px,1fr))]">
        {segments.map((s) => (
          <div key={s.label} className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className={cn('size-2.5 shrink-0 rounded-full', SEG_BG[s.tone])} />
            <b className="tabular-nums">{s.display ?? s.value}</b>
            <span className="truncate text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** حلقة نسبة مئوية */
export function Ring({
  value, tone = 'emerald', size = 64, stroke = 8, children, className,
}: {
  value: number
  tone?: KpiTone
  size?: number
  stroke?: number
  children?: React.ReactNode
  className?: string
}) {
  const r = (100 - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={cn('transition-[stroke-dashoffset] duration-slow', RING_STROKE[tone])}
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** أعمدة صغيرة (توزيع على أيام الأسبوع مثلًا) */
export function MiniBars({
  data, title, highlight, tone = 'sky',
}: {
  data: { label: string; value: number }[]
  title?: string
  highlight?: number
  tone?: KpiTone
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="min-w-0 rounded-2xl border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
      {title && <p className="mb-2 text-xs font-bold text-muted-foreground">{title}</p>}
      <div className="flex h-24 items-end gap-1.5 sm:gap-2">
        {data.map((d, i) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.value}`}>
            <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{d.value || ''}</span>
            <div
              className={cn('w-full max-w-7 rounded-t-md transition-[height] duration-slow', d.value === 0 ? 'bg-muted' : SEG_BG[tone], highlight === i && 'ring-2 ring-foreground/30')}
              style={{ height: `${Math.max(6, (d.value / max) * 62)}%` }}
            />
            <span className={cn('truncate text-[10px]', highlight === i ? 'font-bold text-foreground' : 'text-muted-foreground')}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** شريط تقدّم بسيط */
export function Bar({
  value, tone = 'emerald', className,
}: { value: number; tone?: KpiTone; className?: string }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-slow', SEG_BG[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/* ─────────────────────── أفاتار بحروف الاسم ─────────────────────── */

const AVATAR_TONES = [
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
]

export function Avatar({ name, className }: { name: string; className?: string }) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl text-base font-extrabold', AVATAR_TONES[h % AVATAR_TONES.length], className)}>
      {name.trim().charAt(0) || '؟'}
    </span>
  )
}

/* ─────────────────────── شريط الأدوات والفلاتر ─────────────────────── */

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:p-3.5', className)}>
      {children}
    </div>
  )
}

export function SearchBox({
  value, onChange, placeholder, className,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative w-full min-w-0 sm:min-w-[220px] sm:flex-1', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 rounded-xl ps-9" />
    </div>
  )
}

export function FilterPill({
  active, onClick, children, count, dot,
}: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-all sm:text-[13px]',
        active ? 'border-transparent bg-foreground text-background shadow-sm' : 'bg-background text-foreground/70 hover:bg-muted',
      )}
    >
      {dot && <span className={cn('size-2 rounded-full', dot)} />}
      {children}
      {count !== undefined && (
        <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-background/20' : 'bg-muted text-muted-foreground')}>{count}</span>
      )}
    </button>
  )
}

/** مبدّل الشهر — جوّه الهيرو */
export function MonthSwitcher({
  label, onPrev, onNext, prevDisabled, nextDisabled,
}: { label: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean }) {
  return (
    <div className="flex w-full items-center gap-1 rounded-2xl border bg-background/70 p-1 shadow-sm backdrop-blur-sm sm:w-auto">
      <button type="button" aria-label="السابق" disabled={prevDisabled} onClick={onPrev} className="grid size-9 place-items-center rounded-xl transition-colors hover:bg-muted disabled:opacity-40">
        <ChevronRight className="size-4" />
      </button>
      <span className="min-w-[8.5rem] flex-1 text-center text-sm font-extrabold sm:flex-none">{label}</span>
      <button type="button" aria-label="التالي" disabled={nextDisabled} onClick={onNext} className="grid size-9 place-items-center rounded-xl transition-colors hover:bg-muted disabled:opacity-40">
        <ChevronLeft className="size-4" />
      </button>
    </div>
  )
}

/** شبكة كروت متجاوبة تملا الشاشة */
export function CardGrid({ children, min = 300, className }: { children: React.ReactNode; min?: number; className?: string }) {
  return (
    <div
      className={cn('grid gap-3 sm:gap-4', className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))` }}
    >
      {children}
    </div>
  )
}

/** كارت عنصر بشريط لوني جانبي وحركة رفع عند الـ hover */
export function ItemCard({
  accent, children, className, dim,
}: { accent?: string; children: React.ReactNode; className?: string; dim?: boolean }) {
  return (
    <div
      className={cn(
        'animate-in-up motion-reduce:animate-none group relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-base ease-out hover:-translate-y-1 hover:shadow-lg',
        dim && 'opacity-60',
        className,
      )}
    >
      {accent && <span aria-hidden className={cn('absolute inset-y-0 start-0 w-1', accent)} />}
      {children}
    </div>
  )
}

/* ─────────────────────── شريط الأرقام الموحّد (قديم — للتوافق) ─────────────────────── */

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

/* ─────────────────────── ملاحة الموارد البشرية (مشتركة) ─────────────────────── */

const HR_NAV: { href: string; label: string; icon: React.ElementType; theme: HrThemeKey }[] = [
  { href: '/hr', label: 'نظرة عامة', icon: LayoutDashboard, theme: 'home' },
  { href: '/hr/employees', label: 'الموظفين', icon: Users, theme: 'employees' },
  { href: '/hr/attendance', label: 'الحضور', icon: Fingerprint, theme: 'attendance' },
  { href: '/hr/leaves', label: 'الإجازات', icon: CalendarDays, theme: 'leaves' },
  { href: '/hr/evaluations', label: 'التقييمات', icon: Award, theme: 'evaluations' },
  { href: '/hr/advances', label: 'السلف', icon: HandCoins, theme: 'advances' },
  { href: '/hr/payroll', label: 'الرواتب', icon: Wallet, theme: 'payroll' },
]

export function HrNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="أقسام الموارد البشرية" className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      <ul className="flex min-w-max gap-1.5 rounded-2xl border bg-card p-1.5 shadow-sm sm:min-w-0 sm:flex-wrap">
        {HR_NAV.map((n) => {
          const active = pathname === n.href
          const t = HR_THEMES[n.theme]
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition-all',
                  active ? 'text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                style={active ? { background: `color-mix(in srgb, ${t.varName} 16%, var(--card))`, boxShadow: `inset 0 -2px 0 ${t.varName}` } : undefined}
              >
                <n.icon className="size-4" style={{ color: active ? t.varName : undefined }} />
                {n.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function PageShell({ children }: { children: React.ReactNode }) {
  // عرض كامل زي الخزنة والموردين — الـ layout هو اللي بيحط الـ padding
  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-5">
      <KioskAutoFlush />
      <HrNav />
      {children}
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <CardGrid>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-3xl bg-muted/60" />
      ))}
    </CardGrid>
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
