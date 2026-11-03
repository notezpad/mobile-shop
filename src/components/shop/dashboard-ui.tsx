'use client'

/**
 * 🎨 2026-11-03 — هوية كروت الداشبورد (هادئة ومريحة للعين + أيقونات 3D).
 *
 * نفس لغة صفحات العمولات والموارد البشرية: أيقونة 3D (تدرّج + لمعة علوية + ظل ملوّن
 * خفيف)، أسطح بيضاء بحدود رفيعة وظل ناعم، وألوان tint هادية بدل الألوان الصلبة.
 * الملف ده بس عناصر عرض — مفيش منطق بيانات.
 */

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export type Tone3D = 'emerald' | 'teal' | 'sky' | 'amber' | 'rose' | 'violet' | 'slate'

export const TONE3D: Record<Tone3D, { grad: string; glow: string; wash: string; soft: string }> = {
  emerald: {
    grad: 'from-emerald-400 to-emerald-600',
    glow: 'shadow-emerald-500/25',
    wash: 'from-emerald-400/20 to-emerald-500/0',
    soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  teal: {
    grad: 'from-teal-400 to-teal-600',
    glow: 'shadow-teal-500/25',
    wash: 'from-teal-400/20 to-teal-500/0',
    soft: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
  sky: {
    grad: 'from-sky-400 to-sky-600',
    glow: 'shadow-sky-500/25',
    wash: 'from-sky-400/20 to-sky-500/0',
    soft: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  amber: {
    grad: 'from-amber-400 to-amber-600',
    glow: 'shadow-amber-500/25',
    wash: 'from-amber-400/20 to-amber-500/0',
    soft: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  rose: {
    grad: 'from-rose-400 to-rose-600',
    glow: 'shadow-rose-500/25',
    wash: 'from-rose-400/20 to-rose-500/0',
    soft: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  violet: {
    grad: 'from-violet-400 to-violet-600',
    glow: 'shadow-violet-500/25',
    wash: 'from-violet-400/20 to-violet-500/0',
    soft: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  slate: {
    grad: 'from-slate-400 to-slate-600',
    glow: 'shadow-slate-500/25',
    wash: 'from-slate-400/20 to-slate-500/0',
    soft: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  },
}

const ICON_SIZES = {
  sm: 'size-9 rounded-xl [&_svg]:size-4',
  md: 'size-11 rounded-xl [&_svg]:size-5',
  lg: 'size-14 rounded-2xl [&_svg]:size-6',
} as const

/** أيقونة 3D: تدرّج + لمعة علوية + حلقة داخلية + ظل ملوّن خفيف */
export function Icon3D({
  icon: Icon,
  tone = 'emerald',
  size = 'md',
  className,
}: {
  icon: React.ElementType
  tone?: Tone3D
  size?: keyof typeof ICON_SIZES
  className?: string
}) {
  const t = TONE3D[tone]
  return (
    <span
      aria-hidden
      className={cn(
        'relative isolate grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/25',
        ICON_SIZES[size],
        t.grad,
        t.glow,
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
      <Icon className="relative" strokeWidth={2.3} />
    </span>
  )
}

/** سطح الكارت: أبيض/كارد، حد رفيع، لمعة داخلية علوية، ظل ناعم عميق */
export const PANEL =
  'rounded-3xl border bg-card text-card-foreground ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_14px_34px_-22px_rgba(15,23,42,0.28)] ' +
  'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_34px_-22px_rgba(0,0,0,0.7)]'

/** رأس كارت: أيقونة 3D + عنوان + سطر فرعي + إجراء */
export function PanelHeader({
  icon,
  tone = 'emerald',
  title,
  subtitle,
  action,
  className,
}: {
  icon: React.ElementType
  tone?: Tone3D
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Icon3D icon={icon} tone={tone} size="sm" />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-extrabold leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/** رابط «عرض الكل» كبسولة هادية */
export function SoftLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border bg-card px-3 text-xs font-bold text-foreground/80 shadow-[0_2px_0_rgba(15,23,42,0.05)] transition-all hover:border-primary/40 hover:bg-primary-subtle hover:text-primary-subtle-foreground active:translate-y-px active:shadow-none"
    >
      {children}
      <ArrowUpLeft className="size-3.5" />
    </Link>
  )
}

export type ChipTone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral'
const CHIP: Record<ChipTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  primary: 'bg-primary-subtle text-primary-subtle-foreground',
  neutral: 'bg-muted text-muted-foreground',
}
const CHIP_DOT: Record<ChipTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  primary: 'bg-primary',
  neutral: 'bg-muted-foreground/60',
}

/** شارة حالة هادية (tint + نقطة اختيارية) */
export function Chip({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: ChipTone
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold', CHIP[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full', CHIP_DOT[tone])} />}
      {children}
    </span>
  )
}

/** حالة فاضية بأيقونة 3D */
export function EmptyState({
  icon,
  tone = 'slate',
  title,
  hint,
  action,
}: {
  icon: React.ElementType
  tone?: Tone3D
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-9 text-center">
      <Icon3D icon={icon} tone={tone} size="lg" className="opacity-90" />
      <p className="mt-1 text-sm font-bold text-foreground/80">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  )
}

/** كارت مؤشر: أيقونة 3D + رقم كبير + سطر تحتي، مع هالة لون ناعمة في الركن */
export function KpiCard({
  label,
  value,
  foot,
  icon,
  tone,
  loading,
  className,
}: {
  label: string
  value: string
  foot?: React.ReactNode
  icon: React.ElementType
  tone: Tone3D
  loading?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        PANEL,
        'group relative min-w-0 overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5 sm:p-5',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('pointer-events-none absolute -bottom-16 -start-16 size-52 rounded-full bg-gradient-to-br', TONE3D[tone].wash)}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-muted-foreground sm:text-[13px]">{label}</p>
          {loading ? (
            <Skeleton className="mt-2.5 h-7 w-28" />
          ) : (
            <p className="mt-1.5 break-words text-xl font-black leading-tight tracking-tight tabular-nums sm:text-2xl">{value}</p>
          )}
        </div>
        <Icon3D icon={icon} tone={tone} />
      </div>
      {foot && <div className="relative mt-3 text-[11px] font-medium text-muted-foreground sm:text-xs">{foot}</div>}
    </div>
  )
}

/** درجات أهدى من أيقونات الـ 3D — الأشرطة مساحتها أكبر فلازم تكون مريحة للعين */
const METER_GRAD: Record<Tone3D, string> = {
  emerald: 'from-emerald-300 to-emerald-500',
  teal: 'from-teal-300 to-teal-500',
  sky: 'from-sky-300 to-sky-500',
  amber: 'from-amber-300 to-amber-500',
  rose: 'from-rose-300 to-rose-500',
  violet: 'from-violet-300 to-violet-500',
  slate: 'from-slate-300 to-slate-400',
}

/** تقدّم 3D: مسار غائر + تعبئة بتدرّج */
export function Meter({
  pct,
  tone = 'emerald',
  className,
}: {
  pct: number
  tone?: Tone3D
  className?: string
}) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted shadow-inner', className)}>
      <div
        className={cn('h-full rounded-full bg-gradient-to-l transition-all duration-700', METER_GRAD[tone])}
        style={{ width: `${w}%` }}
      />
    </div>
  )
}

/* ───────── شريط المؤشرات (2026-11-03 إعادة تصميم) ─────────
   سطح واحد بخطوط فاصلة رفيعة بدل 5 كروت منفصلة: كل خلية = أيقونة مسطّحة صغيرة
   + عنوان، الرقم بوحدته على نفس السطر (من غير ما الوحدة تنزل لسطر لوحدها)،
   وسطر تحتي ثابت. الخلية كلها لينك لو فيها href. */

export function StatStrip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn(PANEL, 'grid gap-px overflow-hidden bg-border', className)}>{children}</div>
}

export function StatCell({
  label,
  value,
  unit,
  icon: Icon,
  tone,
  foot,
  href,
  loading,
  className,
}: {
  label: string
  value: string
  unit?: string
  icon: React.ElementType
  tone: Tone3D
  foot?: React.ReactNode
  href?: string
  loading?: boolean
  className?: string
}) {
  const body = (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4', TONE3D[tone].soft)}>
          <Icon strokeWidth={2.2} />
        </span>
        <p className="truncate text-[13px] font-bold text-muted-foreground">{label}</p>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-xl font-black leading-none tracking-tight tabular-nums xl:text-2xl">{value}</span>
          {unit && <span className="text-xs font-bold text-muted-foreground">{unit}</span>}
        </p>
      )}
      {foot && <div className="mt-auto flex items-center gap-1 text-xs font-medium text-muted-foreground">{foot}</div>}
    </div>
  )
  const cls = cn('block min-w-0 bg-card', className)
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors hover:bg-muted/40')}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}