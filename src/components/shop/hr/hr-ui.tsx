'use client'

/**
 * hr-ui — أدوات مشتركة لشاشات الموارد البشرية (واجهة فقط).
 * فلسفة التصميم: بسيط — شاشة واحدة لكل مهمة، ألفاظ صاحب المحل (سلفة/خصم/حافز).
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

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

/**
 * كتابة مباشرة (بدون طابور أوفلاين) — الفلوس والحضور لازم يتنفذوا فعلاً وأونلاين،
 * وبنبعت Idempotency-Key عشان الضغط المزدوج/إعادة المحاولة ما تكرّرش العملية.
 */
export async function hrSend<T = any>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `hr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method === 'POST' ? { 'Idempotency-Key': key } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('مفيش اتصال بالإنترنت — الحضور والرواتب محتاجين اتصال')
  }
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!res.ok) throw new Error(data?.error || `طلب فاشل (${res.status})`)
  return data as T
}

export function PageHead({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: React.ReactNode }) {
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

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  slate: 'bg-muted text-muted-foreground',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
} as const
export type Tone = keyof typeof TONES

export function Stat({
  label, value, hint, tone = 'slate',
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className={cn('mb-2 inline-flex rounded-lg px-2 py-0.5 text-xs font-bold', TONES[tone])}>{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', TONES[tone])}>{children}</span>
}

export function EmptyState({
  title, hint, action,
}: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <p className="text-base font-bold">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl p-3 sm:p-6">{children}</div>
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
