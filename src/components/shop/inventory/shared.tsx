'use client'

/**
 * أدوات مشتركة لصفحات المخزون.
 * كل صفحة لها هوية بصرية مستقلة (انظر ACCENT)، وهنا فقط الأدوات العامة:
 * تنسيق، تجميع بالأيام، عدّاد كمية، مفتاح تبديل، حالة فارغة، كروت التنقّل
 * بين الصفحات، كارت KPI، وحركات CSS.
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
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/* ───────────── ألوان هوية كل جزء ───────────── */

export const ACCENT = {
  stock: '#10b981',
  movements: '#0ea5e9',
  transfers: '#f59e0b',
  stocktake: '#0f766e',
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
 * كروت التنقّل بين صفحات المخزون — كل كارت Link لصفحة مستقلة،
 * والكارت النشط بياخد حدود وخلفية بلون هوية صفحته.
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

/* 🛡️ 2026-10-07 (v16): دالة التنسيق الوحيدة لكل صفحات المخزون الأربعة.
   قبل كده كانت `n.toLocaleString(...)` مباشرة — لو وصلها undefined/null/string
   من أي API (حواف الشبكة، رد غير متوقع، Decimal متسلسل كنص...) كان بيقصف
   "Cannot read properties of undefined (reading 'toLocaleString')" ويسقط الصفحة
   كلها بعد ثواني من فتحها (شاشة الخطأ/السوداء في صفحة الحركات).
   دلوقتي بتحوّل أي قيمة لرقم آمن: أي حاجة غير رقم مفهوم بترجع 0 بدل ما تكسّر الصفحة. */
export const num = (n: number | string | null | undefined) => {
  const v = typeof n === 'number' ? n : Number(n)
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

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

/* ───────────── حركات CSS ───────────── */

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
  step,
  decimal,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  size?: 'md' | 'lg'
  accent?: string
  /** 🥬 2026-10-12: خطوة الأزرار — 0.5 لمنتجات البيع بالوزن (كيلو بكسور) */
  step?: number
  /** 🥬 2026-10-12: قبول كسور في الحقل (الجرد/التحويل بالكيلو) */
  decimal?: boolean
}) {
  const box = size === 'lg' ? 'size-11' : 'size-9'
  const input = size === 'lg' ? 'h-11 w-20 text-xl' : 'h-9 w-16 text-base'
  const st = step ?? 1
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, v))
  const clean = (v: number) =>
    decimal ? Math.round(Math.max(0, v) * 1000) / 1000 : v
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border bg-background" dir="ltr">
      <button
        type="button"
        aria-label="إنقاص"
        onClick={() => onChange(clamp(clean(value - st)))}
        disabled={value <= min}
        className={cn(box, 'flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30')}
      >
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        min={min}
        max={max}
        step={decimal ? (step ?? 0.5) : undefined}
        value={value}
        onChange={(e) =>
          onChange(
            clamp(
              decimal
                ? Math.round((Number(e.target.value) || min) * 1000) / 1000
                : parseInt(e.target.value, 10) || min,
            ),
          )
        }
        className={cn(
          input,
          'border-x bg-transparent text-center font-extrabold tabular-nums outline-none focus:bg-muted/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
        )}
        style={accent ? { color: accent } : undefined}
      />
      <button
        type="button"
        aria-label="زيادة"
        onClick={() => onChange(clamp(clean(value + st)))}
        disabled={max !== undefined && value >= max}
        className={cn(box, 'flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30')}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

/* ───────────── رقم بإشارة ───────────── */

export function Signed({ value, className }: { value: number | string | null | undefined; className?: string }) {
  // 🛡️ v16: توحيد آمن — أي قيمة ناقصة/غريبة بتتعامل كصفر بدل ما تكسر الرندر
  const v = typeof value === 'number' ? value : Number(value ?? 0)
  const safe = Number.isFinite(v) ? v : 0
  const sign = safe > 0 ? '+' : safe < 0 ? '-' : ''
  return (
    <span dir="ltr" className={cn('inline-flex items-baseline tabular-nums', className)}>
      {sign && <span>{sign}</span>}
      <span>{num(Math.abs(safe))}</span>
    </span>
  )
}

/* ───────────── حرس قسم (Error Boundary مصغّر) ─────────────
   🛡️ 2026-10-07 (v14): لو حصل كراش في جزء معين من الصفحة (مثلًا الدفتر)،
   الجزء ده بس بيتبدل برسالة ودودة وزر إعادة محاولة — بدل ما الصفحة كلها
   تفضى (شاشة سوداء). الصفحات الكبيرة بتلف أقسامها الحساسة بيه. */

export class SectionBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { err: Error | null }
> {
  state = { err: null as Error | null }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  componentDidCatch(err: Error) {
    console.error('[section-boundary]', err)
  }

  render() {
    if (this.state.err) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-6" />
          </div>
          <div>
            <p className="text-base font-bold">{this.props.label ?? 'الجزء ده حصل فيه خطأ'}</p>
            <p className="mt-1 text-sm text-muted-foreground">جرّب تعيد المحاولة، ولو استمرت المشكلة حدّث الصفحة</p>
          </div>
          <Button variant="outline" onClick={() => this.setState({ err: null })}>
            إعادة المحاولة
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

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

/* ───────────── بانر فشل التحميل (🛡️ v17) ─────────────
   قبل v17 أي فشل في جلب البيانات كان يتحول بهدوء لقائمة فاضية — فالمستخدم
   يظن بياناته «اتمسحت» والمشكلة في الحقيقة شبكة/سيرفر/صلاحية. البانر ده
   بيعرض سبب الفشل الحقيقي (رمز HTTP / شبكة / رد غير متوقع) + زر إعادة
   محاولة، عشان الفرق بين «فاضي فعلاً» و«فشل التحميل» يبقى واضح دايمًا. */

export function LoadErrorBanner({
  message,
  onRetry,
  label = 'تعذّر تحميل البيانات',
}: {
  message: string
  onRetry?: () => void
  label?: string
}) {
  return (
    <div
      role="alert"
      className="animate-in-up flex flex-wrap items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
        <AlertTriangle className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-rose-600/90 dark:text-rose-400/90 [overflow-wrap:anywhere]">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="h-8 shrink-0 border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
        >
          إعادة المحاولة
        </Button>
      )}
    </div>
  )
}

/* ───────────── كارت إحصائي (KPI Tile) ─────────────
   📱 على الجوال: كارت بعرض كامل (بيتحدد من الأب `grid-cols-1`)
   🖥️ من sm+ وفوق: 2×2، ومن lg: 4×1
   العنوان والنص الفرعي يستحملوا لحد سطرين (line-clamp-2) عشان مايتقطعوش. */

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
    <div className="relative min-w-0 overflow-hidden rounded-2xl border bg-card p-3.5 sm:p-4">
      {/* شريط جانبي ملوّن بهوية الإحصائية */}
      <span
        aria-hidden
        className="absolute inset-y-3 start-0 w-1 rounded-e-full"
        style={{ backgroundColor: accent }}
      />

      {/* 📱 الصف العلوي: العنوان (لحد سطرين) + الأيقونة */}
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 min-w-0 flex-1 text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">
          {label}
        </p>
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="size-3.5 sm:size-4" />
        </span>
      </div>

      {/* الرقم — truncate يحمي أرقام الملايين */}
      <p className="mt-2 flex min-w-0 items-baseline gap-1">
        <span className="min-w-0 truncate text-xl font-extrabold leading-none tabular-nums sm:text-2xl">
          {value}
        </span>
        {unit && (
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">
            {unit}
          </span>
        )}
      </p>

      {/* 📱 النص الفرعي — سطرين على الجوال، سطر على الكبير */}
      {foot && (
        <p className="mt-1.5 line-clamp-2 min-w-0 text-[11px] leading-snug text-muted-foreground sm:line-clamp-1">
          {foot}
        </p>
      )}
    </div>
  )
}