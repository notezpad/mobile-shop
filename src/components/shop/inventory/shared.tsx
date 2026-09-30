'use client'

/**
 * مكوّنات بصرية مشتركة لصفحة المخزون وتبويباتها.
 * نفس لغة تصميم صفحة المصروفات: StatTile ملوّنة، شرائح فلترة دائرية،
 * قوائم مجمّعة باليوم، وحالات فارغة موحّدة.
 */

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ───────────── أدوات تنسيق ───────────── */

export const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** مفتاح اليوم المحلي (YYYY-MM-DD) من تاريخ ISO */
export function dayKeyOf(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'unknown'
  return toISODate(d)
}

/** عنوان اليوم: اليوم / أمس / تاريخ كامل */
export function dayLabel(key: string): string {
  if (key === 'unknown') return 'بدون تاريخ'
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (key === toISODate(today)) return 'اليوم'
  if (key === toISODate(yesterday)) return 'أمس'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export const timeLabel = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

export const fullDateLabel = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** تجميع عناصر مرتّبة حسب اليوم مع الحفاظ على الترتيب الأصلي */
export function groupByDay<T>(items: T[], getIso: (item: T) => string) {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = dayKeyOf(getIso(it))
    const arr = map.get(k)
    if (arr) arr.push(it)
    else map.set(k, [it])
  }
  return Array.from(map.entries()).map(([key, list]) => ({ key, items: list }))
}

export const countWord = (n: number, one: string, few: string) =>
  n > 2 && n < 11 ? few : one

/* ───────────── StatTile ───────────── */

export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  foot,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  foot?: React.ReactNode
  accent: string
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border p-4 shadow-xs transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-md"
      style={{
        borderColor: `${accent}33`,
        background: `linear-gradient(135deg, ${accent}1f 0%, transparent 70%)`,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -22,
          left: -22,
          opacity: 0.08,
          color: accent,
          pointerEvents: 'none',
        }}
      >
        <Icon style={{ width: 96, height: 96 }} strokeWidth={1.5} />
      </div>
      <span
        className="absolute inset-x-4 top-0 h-0.5 rounded-b-full"
        style={{ backgroundColor: accent }}
      />

      <div className="relative flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}26`, color: accent }}
        >
          <Icon className="size-[18px]" />
        </div>
      </div>

      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span className="truncate text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl">
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>

      {foot && <div className="relative mt-2.5 text-[11px]">{foot}</div>}
    </div>
  )
}

/* ───────────── FilterChip ───────────── */

export function FilterChip({
  active,
  onClick,
  label,
  color,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
            active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/* ───────────── TintIcon (أيقونة داخل مربع ملوّن) ───────────── */

export function TintIcon({
  icon: Icon,
  color,
  size = 'md',
}: {
  icon: LucideIcon
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const box =
    size === 'lg' ? 'size-12 rounded-2xl' : size === 'sm' ? 'size-8 rounded-lg' : 'size-10 rounded-xl'
  const ic = size === 'lg' ? 'size-6' : size === 'sm' ? 'size-4' : 'size-5'
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center', box)}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <Icon className={ic} />
    </div>
  )
}

/* ───────────── عنوان مجموعة اليوم ───────────── */

export function DayHeading({
  label,
  count,
  right,
}: {
  label: string
  count: number
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        {label}
        <span className="text-xs font-normal text-muted-foreground">
          · {count} {countWord(count, 'عملية', 'عمليات')}
        </span>
      </h3>
      {right}
    </div>
  )
}

/* ───────────── حالة فارغة ───────────── */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
        <Icon className="size-8" />
      </div>
      <div>
        <p className="text-base font-semibold">{title}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/* ───────────── رأس بطاقة النموذج ───────────── */

export function PanelTitle({
  icon: Icon,
  title,
  hint,
  accent = '#10b981',
  right,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  accent?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <TintIcon icon={Icon} color={accent} />
        <div>
          <h2 className="text-base font-bold leading-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}
