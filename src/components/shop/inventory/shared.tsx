'use client'

/**
 * أدوات مشتركة لصفحات المخزون.
 * كل صفحة لها هوية بصرية مستقلة (انظر ACCENT)، وهنا فقط الأدوات العامة:
 * تنسيق، تجميع بالأيام، عدّاد كمية، مفتاح تبديل، حالة فارغة، كروت التنقّل
 * بين الصفحات، وحركات CSS.
 */

import * as React from 'react'
import Link from 'next/link'
import {
  Minus,
  Plus,
  Warehouse,
  ArrowUpDown,
  Truck,
  ScanLine,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ───────────── ألوان هوية كل جزء ───────────── */

export const ACCENT = {
  stock: '#10b981', // مستودع — أخضر
  movements: '#0ea5e9', // دفتر حركة — سماوي
  transfers: '#f59e0b', // لوجستيات — كهرماني
  stocktake: '#0f766e', // جرد — تركواز
  up: '#10b981',
  down: '#f43f5e',
} as const

/* ───────────── تسميات مشتركة (تصدير Excel / شارات) ───────────── */

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  in: 'وارد',
  out: 'صادر',
  adjust: 'تعديل يدوي',
  damage: 'هالك',
  sale: 'بيع',
  return: 'مرتجع',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  stocktake: 'تسوية جرد',
}

export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: 'معلّق',
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

export const STOCKTAKE_STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  committed: 'معتمد',
}

/* ───────────── صفحات المخزون + كروت التنقّل بينها ───────────── */

export type InventoryPageKey = 'stock' | 'movements' | 'transfers' | 'stocktake'

export const INVENTORY_PAGES: {
  key: InventoryPageKey
  href: string
  label: string
  desc: string
  icon: LucideIcon
  color: string
}[] = [
  { key: 'stock', href: '/inventory', label: 'المخزون', desc: 'الأصناف والكميات', icon: Warehouse, color: ACCENT.stock },
  { key: 'movements', href: '/inventory/movements', label: 'الحركات', desc: 'دفتر الوارد والصادر', icon: ArrowUpDown, color: ACCENT.movements },
  { key: 'transfers', href: '/inventory/transfers', label: 'التحويلات', desc: 'شحنات بين الفروع', icon: Truck, color: ACCENT.transfers },
  { key: 'stocktake', href: '/inventory/stocktake', label: 'الجرد', desc: 'عدّ وتسوية', icon: ScanLine, color: ACCENT.stocktake },
]

/**
 * كروت التنقّل بين صفحات المخزون — نفس شكل كروت التبويبات القديمة اللي
 * بانت للمستخدم، لكن كل كارت بقى Link لصفحة مستقلة، والكارت النشط
 * بياخد حدود وخلفية بلون هوية صفحته.
 */
export function InventoryCrossNav({
  active,
  counts,
}: {
  active: InventoryPageKey
  counts: Partial<Record<InventoryPageKey, { text?: string; alert?: boolean }>>
}) {
  return (
    <nav aria-label="صفحات المخزون" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {INVENTORY_PAGES.map((p) => {
        const isActive = p.key === active
        const c = counts[p.key]
        return (
          <Link
            key={p.key}
            href={p.href}
            aria-current={isActive ? 'page' : undefined}
            style={{ ['--tab' as string]: p.color }}
            className={cn(
              'group relative flex flex-row items-center justify-start gap-3 overflow-hidden rounded-2xl border bg-card px-3.5 py-3 text-start shadow-xs',
              'transition-all hover:-translate-y-0.5 hover:shadow-md',
              isActive
                ? 'border-[color:var(--tab)] bg-[color-mix(in_oklab,var(--tab)_9%,var(--card))] shadow-md dark:bg-[color-mix(in_oklab,var(--tab)_14%,var(--card))]'
                : 'hover:border-[color-mix(in_oklab,var(--tab)_45%,var(--border))]',
            )}
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                isActive
                  ? 'bg-[color:var(--tab)] text-white'
                  : 'bg-[color-mix(in_oklab,var(--tab)_14%,transparent)] text-[color:var(--tab)]',
              )}
            >
              <p.icon className="!size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold leading-tight text-foreground">{p.label}</span>
              <span
                className={cn(
                  'mt-0.5 flex items-center gap-1.5 text-xs font-medium',
                  c?.alert ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                )}
              >
                {c?.alert && <span className="inv-blink size-1.5 rounded-full bg-amber-500" />}
                {c?.text ?? p.desc}
              </span>
            </span>
            <span
              className={cn(
                'absolute inset-x-0 bottom-0 h-[3px] origin-center bg-[color:var(--tab)] transition-transform duration-base',
                isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50',
              )}
            />
          </Link>
        )
      })}
    </nav>
  )
}

/* ───────────── تنسيق ───────────── */

export const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function dayKeyOf(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'unknown'
  return toISODate(d)
}

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

export const shortDateLabel = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
}

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

/* ───────────── حركات CSS (مرة واحدة في الصفحة) ───────────── */

export function InventoryStyles() {
  return (
    <style>{`
      @keyframes inv-dash { to { stroke-dashoffset: 12; } }
      @keyframes inv-laser { 0% { left: 3%; } 50% { left: 97%; } 100% { left: 3%; } }
      @keyframes inv-pop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes inv-stamp { from { opacity: 0; transform: scale(1.7) rotate(-16deg); } to { opacity: .92; transform: scale(1) rotate(var(--r, -8deg)); } }
      @keyframes inv-cell { from { opacity: 0; transform: scale(.55); } to { opacity: 1; transform: none; } }
      @keyframes inv-blink { 50% { opacity: .25; } }
      .inv-dash { stroke-dasharray: 6 6; animation: inv-dash 900ms linear infinite; }
      .inv-laser { animation: inv-laser 2.6s ease-in-out infinite; }
      .inv-pop { animation: inv-pop 260ms var(--ease-out, ease-out) both; }
      .inv-stamp { animation: inv-stamp 420ms var(--ease-spring, ease-out) both; }
      .inv-cell { animation: inv-cell 380ms var(--ease-spring, ease-out) both; }
      .inv-blink { animation: inv-blink 1.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .inv-dash, .inv-laser, .inv-pop, .inv-stamp, .inv-cell, .inv-blink { animation: none !important; }
        .inv-stamp { opacity: .92; transform: rotate(var(--r, -8deg)); }
      }
    `}</style>
  )
}

/* ───────────── مفتاح تبديل (Segmented) ───────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  accent,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number; color?: string }[]
  accent: string
  className?: string
}) {
  return (
    <div
      role="group"
      className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-muted p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              active ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            style={active ? { color: accent } : undefined}
          >
            {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />}
            {o.label}
            {o.count !== undefined && (
              <span
                className="rounded-md px-1.5 text-[10px] tabular-nums"
                style={
                  active
                    ? { backgroundColor: `${accent}1f`, color: accent }
                    : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }
                }
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ───────────── عدّاد كمية + / − ───────────── */

export function QtyStepper({
  value,
  onChange,
  min = 0,
  max,
  size = 'md',
  accent,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  size?: 'md' | 'lg'
  accent?: string
}) {
  const box = size === 'lg' ? 'size-11' : 'size-9'
  const input = size === 'lg' ? 'h-11 w-20 text-xl' : 'h-9 w-16 text-base'
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, v))
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border bg-background" dir="ltr">
      <button
        type="button"
        aria-label="إنقاص"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className={cn(box, 'flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30')}
      >
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || min))}
        className={cn(
          input,
          'border-x bg-transparent text-center font-extrabold tabular-nums outline-none focus:bg-muted/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
        )}
        style={accent ? { color: accent } : undefined}
      />
      <button
        type="button"
        aria-label="زيادة"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== undefined && value >= max}
        className={cn(box, 'flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30')}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

/* ───────────── رقم بإشارة (آمن ضد لخبطة اتجاه النص) ───────────── */

export function Signed({ value, className }: { value: number; className?: string }) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return (
    <span dir="ltr" className={cn('inline-flex items-baseline tabular-nums', className)}>
      {sign && <span>{sign}</span>}
      <span>{num(Math.abs(value))}</span>
    </span>
  )
}

/* ───────────── حالة فارغة ───────────── */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  accent,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  accent: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed py-14 text-center">
      <div
        className="flex size-16 items-center justify-center rounded-3xl"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        <Icon className="size-8" />
      </div>
      <div>
        <p className="text-base font-bold">{title}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  )
}
