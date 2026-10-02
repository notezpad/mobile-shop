'use client'

/**
 * مكوّنات مشتركة لدايلوجات المبيعات (مرتجع عميل حالياً).
 * نفس تركيبة purchase-dialog-ui بالظبط، لكن بهوية صفحة المبيعات:
 * حبر فحمي + أصفر ماركر («دفتر الفواتير الكربون»)، والأحمر للمرتجع فقط.
 * ما فيش أي منطق أعمال هنا — واجهة فقط.
 */

import * as React from 'react'
import { Minus, Plus, X } from 'lucide-react'
import {
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/* ───────────── طرق الدفع (نفس تسميات صفحة المبيعات) ───────────── */

export const PAY_METHODS = [
  { value: 'cash', label: 'كاش' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'انستاباي' },
  { value: 'fawry', label: 'فوري' },
] as const

/* ───────────── أدوات صغيرة ───────────── */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
/** يحوّل الأرقام العربية (٠-٩) والفاصلة العشرية العربية لأرقام إنجليزي */
export const normalizeDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, '.')

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const ring = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-400/50'

/* ───────────── رأس الدايلوج ───────────── */

export function DialogHero({
  icon: Icon,
  title,
  chip,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  chip?: string
  subtitle?: string
}) {
  return (
    <DialogHeader className="relative shrink-0 gap-0 bg-zinc-900 px-4 pb-5 pt-4 text-start text-zinc-50 sm:px-6 sm:pt-5">
      <div className="flex items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-300 text-zinc-900 shadow-sm">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold leading-tight text-zinc-50">
            {title}
            {chip && (
              <span
                dir="ltr"
                className="rounded-lg bg-zinc-800 px-2 py-0.5 text-xs font-bold tracking-wide tabular-nums text-yellow-200 ring-1 ring-zinc-700"
              >
                {chip}
              </span>
            )}
          </DialogTitle>
          {subtitle ? (
            <DialogDescription className="mt-1 text-xs font-medium leading-relaxed text-zinc-300">
              {subtitle}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>
        <DialogClose className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300">
          <X className="size-4" />
          <span className="sr-only">إغلاق</span>
        </DialogClose>
      </div>
      {/* خط التقطيع الأصفر — بصمة كعب الفاتورة (نفس الخط المتقطع بين الكعب والكارت) */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1 bg-[repeating-linear-gradient(90deg,rgb(253_224_71/0.85)_0_10px,transparent_10px_16px)]"
      />
    </DialogHeader>
  )
}

/* ───────────── عنوان قسم برقم ───────────── */

export function SectionTitle({
  n,
  children,
  aside,
}: {
  n: number
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-extrabold">
        <span className="flex size-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-extrabold text-yellow-300 dark:bg-yellow-300 dark:text-zinc-900">
          {n}
        </span>
        {children}
      </h3>
      {aside}
    </div>
  )
}

/* ───────────── عدّاد الكمية (− 0 +) ───────────── */

export function Stepper({
  value,
  min = 0,
  max,
  onChange,
  label,
}: {
  value: number
  min?: number
  max?: number
  onChange: (n: number) => void
  label: string
}) {
  const [focus, setFocus] = React.useState(false)
  const [text, setText] = React.useState('')
  const clamp = (n: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n))
  const btn = cn(
    'flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground/80 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background',
    ring
  )

  return (
    <div className="inline-flex items-center gap-1.5" dir="ltr" role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="تقليل الكمية"
      >
        <Minus className="size-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={focus ? text : String(value)}
        onFocus={(e) => {
          setFocus(true)
          setText(String(value))
          e.currentTarget.select()
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          const raw = normalizeDigits(e.target.value).replace(/[^0-9]/g, '')
          if (raw === '') {
            setText('')
            return
          }
          const n = clamp(parseInt(raw, 10))
          setText(String(n))
          onChange(n)
        }}
        className="h-10 w-14 rounded-xl border bg-background text-center text-base font-extrabold tabular-nums outline-none transition-shadow focus:border-yellow-500 focus:ring-[3px] focus:ring-yellow-400/30"
      />
      <button
        type="button"
        className={btn}
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== undefined && value >= max}
        aria-label="زيادة الكمية"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

/* ───────────── حقل مبلغ (يقبل الكسور والأرقام العربي) ───────────── */

export function DecimalInput({
  value,
  onChange,
  min = 0,
  id,
  label,
  suffix,
  invalid,
  disabled,
  className,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  id?: string
  label?: string
  suffix?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}) {
  const [focus, setFocus] = React.useState(false)
  const [text, setText] = React.useState('')

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        dir="ltr"
        inputMode="decimal"
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={focus ? text : String(r2(value))}
        onFocus={(e) => {
          setFocus(true)
          setText(String(r2(value)))
          e.currentTarget.select()
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          let raw = normalizeDigits(e.target.value).replace(/[^0-9.]/g, '')
          const dot = raw.indexOf('.')
          if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '')
          setText(raw)
          const n = parseFloat(raw)
          onChange(Number.isFinite(n) ? Math.max(min, n) : 0)
        }}
        className={cn(
          'h-11 w-full rounded-xl border bg-background text-left text-base font-extrabold tabular-nums outline-none transition-shadow focus:border-yellow-500 focus:ring-[3px] focus:ring-yellow-400/30 disabled:cursor-not-allowed disabled:opacity-60',
          suffix ? 'pl-3 pr-14' : 'px-3',
          invalid && 'border-rose-500 ring-[3px] ring-rose-500/20 focus:border-rose-500 focus:ring-rose-500/20'
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-foreground/55">
          {suffix}
        </span>
      )}
    </div>
  )
}

/* ───────────── اختيار طريقة الدفع ───────────── */

export function MethodPills({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {PAY_METHODS.map((m) => {
        const on = value === m.value
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.value)}
            className={cn(
              'flex h-11 items-center justify-center rounded-xl border px-2 text-center text-xs font-bold leading-tight transition-colors',
              ring,
              on
                ? 'border-zinc-900 bg-zinc-900 text-yellow-300 shadow-sm dark:border-yellow-300 dark:bg-yellow-300 dark:text-zinc-900'
                : 'bg-background text-foreground/75 hover:bg-muted'
            )}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
