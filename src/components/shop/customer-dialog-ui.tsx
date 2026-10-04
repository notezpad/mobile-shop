'use client'

/**
 * مكوّنات مشتركة لدايلوجات العملاء (دفعة عميل حالياً).
 * نفس تركيبة purchase-dialog-ui بهوية صفحة العملاء: سماوي غامق + شريط نيلي مائل.
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

/* ───────────── طرق الدفع (بنفس تسميات باقي المشروع) ───────────── */

export const PAY_METHODS = [
  { value: 'cash', label: 'كاش' },
  { value: 'vodafone_cash', label: 'محافظ إلكترونية' },
  { value: 'instapay', label: 'انستاباي' },
  { value: 'fawry', label: 'محفظة إلكترونية' },
] as const

export type PayTone = 'light' | 'dark'

/* ───────────── أدوات صغيرة ───────────── */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
/** يحوّل الأرقام العربية (٠-٩) والفاصلة العشرية العربية لأرقام إنجليزي */
export const normalizeDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, '.')

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

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
    <DialogHeader className="relative shrink-0 gap-0 bg-sky-950 px-4 pb-5 pt-4 text-start text-sky-50 sm:px-6 sm:pt-5">
      <div className="flex items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-800/70 ring-1 ring-sky-700/60">
          <Icon className="size-5 text-sky-100" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold leading-tight text-sky-50">
            {title}
            {chip && (
              <span className="rounded-lg bg-sky-900 px-2 py-0.5 text-xs font-bold tracking-wide tabular-nums text-sky-100 ring-1 ring-sky-700/60">
                {chip}
              </span>
            )}
          </DialogTitle>
          {subtitle ? (
            <DialogDescription className="mt-1 text-xs font-medium leading-relaxed text-sky-200/80">
              {subtitle}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>
        <DialogClose className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-900/70 text-sky-100 transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
          <X className="size-4" />
          <span className="sr-only">إغلاق</span>
        </DialogClose>
      </div>
      {/* خط الكهرماني المائل — نفس بصمة "المتبقي" في الصفحة */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1 bg-[repeating-linear-gradient(-45deg,rgba(129,140,248,.7)_0_6px,transparent_6px_12px)]"
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
        <span className="flex size-6 items-center justify-center rounded-full bg-sky-950 text-xs font-extrabold text-sky-50 dark:bg-sky-700">
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
  size = 'md',
}: {
  value: number
  min?: number
  max?: number
  onChange: (n: number) => void
  label: string
  size?: 'md' | 'sm'
}) {
  const [focus, setFocus] = React.useState(false)
  const [text, setText] = React.useState('')
  const clamp = (n: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n))
  const h = size === 'sm' ? 'h-9' : 'h-10'
  const btn = cn(
    'flex shrink-0 items-center justify-center rounded-xl border bg-background text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-600/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background',
    size === 'sm' ? 'size-9' : 'size-10'
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
        className={cn(
          'w-14 rounded-xl border bg-background text-center text-base font-extrabold tabular-nums outline-none transition-shadow focus:border-sky-600 focus:ring-[3px] focus:ring-sky-600/25',
          h
        )}
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
  tone = 'light',
  size = 'md',
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
  tone?: PayTone
  size?: 'md' | 'sm'
  invalid?: boolean
  disabled?: boolean
  className?: string
}) {
  const [focus, setFocus] = React.useState(false)
  const [text, setText] = React.useState('')
  const dark = tone === 'dark'

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
          'w-full rounded-xl border text-left font-extrabold tabular-nums outline-none transition-shadow disabled:cursor-not-allowed disabled:opacity-60',
          size === 'sm' ? 'h-10 text-sm' : 'h-11 text-base',
          suffix ? 'pl-3 pr-14' : 'px-3',
          dark
            ? 'border-sky-700 bg-sky-900/60 text-white focus:border-sky-300 focus:ring-[3px] focus:ring-sky-300/25'
            : 'bg-background focus:border-sky-600 focus:ring-[3px] focus:ring-sky-600/25',
          invalid && 'border-rose-500 ring-[3px] ring-rose-500/20'
        )}
      />
      {suffix && (
        <span
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold',
            dark ? 'text-sky-200/70' : 'text-foreground/55'
          )}
        >
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
  tone = 'light',
  methods,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  tone?: PayTone
  /** تقييد الطرق المعروضة (القيم من PAY_METHODS). الافتراضي: كلها */
  methods?: readonly string[]
}) {
  const dark = tone === 'dark'
  const list = methods ? PAY_METHODS.filter((m) => methods.includes(m.value)) : PAY_METHODS
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {list.map((m) => {
        const on = value === m.value
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.value)}
            className={cn(
              'flex h-11 items-center justify-center rounded-xl border px-2 text-center text-xs font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-[3px]',
              dark
                ? on
                  ? 'border-sky-300 bg-sky-300 text-sky-950 focus-visible:ring-sky-300/40'
                  : 'border-sky-700 bg-sky-900/50 text-sky-100/85 hover:bg-sky-800 focus-visible:ring-sky-300/40'
                : on
                  ? 'border-sky-700 bg-sky-700 text-white shadow-sm focus-visible:ring-sky-600/40'
                  : 'bg-background text-foreground/75 hover:bg-muted focus-visible:ring-sky-600/40'
            )}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
