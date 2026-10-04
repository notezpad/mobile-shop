'use client'

/**
 * stock-dialog-ui — مكوّنات دايلوجات المخزون.
 * هوية المخزون: «المستودع» — أخضر (ACCENT.stock) للوارد، وردي للصادر، كهرماني للهالك.
 * هيدر ملوّن بشريط «باليت» مائل خفيف. مفيش أي منطق أعمال هنا.
 */

import * as React from 'react'
import { X } from 'lucide-react'
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type StockTone = 'in' | 'out' | 'damage' | 'swap'

export const TONE = {
  in: { bg: 'bg-emerald-700', soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', btn: 'bg-emerald-700 text-white hover:bg-emerald-800' },
  out: { bg: 'bg-rose-700', soft: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', ring: 'ring-rose-500/30', text: 'text-rose-700 dark:text-rose-300', btn: 'bg-rose-700 text-white hover:bg-rose-800' },
  damage: { bg: 'bg-amber-600', soft: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', ring: 'ring-amber-500/30', text: 'text-amber-700 dark:text-amber-300', btn: 'bg-amber-600 text-white hover:bg-amber-700' },
  swap: { bg: 'bg-emerald-800', soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', btn: 'bg-emerald-700 text-white hover:bg-emerald-800' },
} as const

export function StockHero({
  tone,
  icon: Icon,
  title,
  subtitle,
}: {
  tone: StockTone
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
}) {
  return (
    <DialogHeader className={cn('relative shrink-0 gap-0 overflow-hidden px-4 pb-4 pt-4 text-start text-white sm:px-6 sm:pt-5', TONE[tone].bg)}>
      {/* شريط المستودع: خطوط رفوف خفيفة */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background:repeating-linear-gradient(135deg,#fff_0_2px,transparent_2px_14px)]"
      />
      <div className="relative flex items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-lg font-extrabold leading-tight text-white">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="mt-1 truncate text-xs font-medium text-white/80">{subtitle}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>
        <DialogClose className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <X className="size-4" />
          <span className="sr-only">إغلاق</span>
        </DialogClose>
      </div>
    </DialogHeader>
  )
}

export const STOCK_FIELD =
  'h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-emerald-600 focus:ring-[3px] focus:ring-emerald-500/15'

export const STOCK_RING = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-500/30'

export function SecLabel({ children, aside, required }: { children: React.ReactNode; aside?: React.ReactNode; required?: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-extrabold text-foreground/80">
        {children}
        {required && <span className="ms-1 text-destructive">*</span>}
      </h3>
      {aside}
    </div>
  )
}

export function Pill({ active, onClick, children, tone = 'in' }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: StockTone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-xs font-bold transition-colors',
        STOCK_RING,
        active ? cn('border-transparent', TONE[tone].btn) : 'bg-background text-foreground/80 hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}
