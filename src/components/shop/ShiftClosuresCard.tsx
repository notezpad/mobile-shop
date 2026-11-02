'use client'

/**
 * 🕐 2026-10-31 (التحديث الثامن) — تقرير «إغلاقات الورديات» في صفحة الخزنة.
 *
 * دي رقابة المدير على الجرد الأعمى: كل إغلاق بورديه — اللي الكاشير عدّاه،
 * المتوقع (رصيد الكاش الورقي لحظة الإغلاق، محسوب في السيرفر)، والفارق
 * (عجز أحمر / زيادة أخضر). وكل صف بيتفتح يوريك «نافذة الوردية»: حركات
 * الكاش بين الإغلاق ده واللي قبله لنفس الفرع (داخل/خارج/صافي) — تقرير
 * الوردية كامل من دفتر الخزنة نفسه من غير أي كتابة جديدة.
 *
 * الفارق عمداً مكتوب كأرقام هنا فقط — الكاشير عمره ما بيشوف الصفحة دي
 * (موديول الخزنة) ولا أي رقم منها.
 */

import * as React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Link2,
  Loader2,
  Lock,
  RotateCcw,
  TrendingUp,
  User,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/api'
import { useDataRefresh } from '@/lib/offline/data-events'

interface ClosureWindow {
  from: string | null
  to: string
  cashIn: number
  cashOut: number
  net: number
  count: number
}

interface Closure {
  id: number
  branchId: number | null
  branchName: string | null
  shiftName: string | null
  userName: string | null
  counted: number
  expected: number
  variance: number
  note: string | null
  createdAt: string
  window: ClosureWindow | null
  // 🔗 (التحديث السادس عشر) جلسة الفتح المرتبطة — سجل المسؤولية الكامل
  session: {
    shiftName: string
    openedBy: string | null
    openedAt: string | null
    openingFloat: number | null
  } | null
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

const PREVIEW_COUNT = 5

type Kind = 'match' | 'short' | 'over'
const kindOf = (v: number): Kind => (Math.abs(v) < 0.005 ? 'match' : v > 0 ? 'over' : 'short')

const KIND: Record<Kind, { label: string; icon: LucideIcon; tile: string; pill: string; text: string; bar: string }> = {
  match: {
    label: 'مطابق',
    icon: CheckCircle2,
    tile: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
    pill: 'bg-muted text-muted-foreground',
    text: 'text-muted-foreground',
    bar: 'bg-slate-400/60',
  },
  short: {
    label: 'عجز',
    icon: AlertTriangle,
    tile: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
    text: 'text-rose-600 dark:text-rose-400',
    bar: 'bg-rose-500',
  },
  over: {
    label: 'زيادة',
    icon: TrendingUp,
    tile: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
  },
}

function Stat({
  label, value, tone, className,
}: { label: string; value: React.ReactNode; tone?: string; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl border bg-background/70 px-3 py-2', className)}>
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 truncate text-sm font-extrabold tabular-nums sm:text-base', tone)}>{value}</p>
    </div>
  )
}

export interface ShiftClosuresSummary {
  total: number
  shortCount: number
}

export function ShiftClosuresCard({
  branchFilter,
  onSummary,
}: {
  branchFilter: string
  /** بيبلّغ الأب بعدد الإغلاقات وحالات العجز (للشارة في التاب والهيرو) */
  onSummary?: (s: ShiftClosuresSummary) => void
}) {
  const [closures, setClosures] = React.useState<Closure[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<number | null>(null)
  const [onlyIssues, setOnlyIssues] = React.useState(false)
  const [showAll, setShowAll] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<{ closures: Closure[] }>(
        branchFilter === 'all' ? '/api/shifts/closures' : `/api/shifts/closures?branchId=${branchFilter}`,
      )
      setClosures(Array.isArray(res?.closures) ? res.closures : [])
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل الإغلاقات')
    } finally {
      setLoading(false)
    }
  }, [branchFilter])

  React.useEffect(() => {
    setOpenId(null)
    setShowAll(false)
    void load()
  }, [load])

  // 🔄 فتح/قفل وردية من أي شاشة → الكارت يتحدث لحظياً من غير ريفرش
  useDataRefresh(['shifts'], () => void load())

  const summary = React.useMemo(() => {
    const list = closures ?? []
    let match = 0, shortTotal = 0, overTotal = 0, shortCount = 0
    for (const c of list) {
      const k = kindOf(c.variance)
      if (k === 'match') match++
      else if (k === 'short') { shortTotal += Math.abs(c.variance); shortCount++ }
      else overTotal += c.variance
    }
    return { total: list.length, match, shortTotal, overTotal, shortCount }
  }, [closures])

  const reportRef = React.useRef(onSummary)
  React.useEffect(() => { reportRef.current = onSummary })
  React.useEffect(() => {
    if (closures) reportRef.current?.({ total: summary.total, shortCount: summary.shortCount })
  }, [closures, summary.total, summary.shortCount])

  const filtered = React.useMemo(
    () => (closures ?? []).filter((c) => !onlyIssues || kindOf(c.variance) !== 'match'),
    [closures, onlyIssues],
  )
  const visible = showAll ? filtered : filtered.slice(0, PREVIEW_COUNT)
  const hidden = filtered.length - visible.length

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      aria-label="إغلاقات الورديات"
    >
      {/* ───── الهيدر ───── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-l from-sky-500/[0.07] via-transparent to-transparent p-3.5 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 sm:size-11">
            <ClipboardCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-extrabold sm:text-base">إغلاقات الورديات</h3>
              <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                <Lock className="size-2.5" />
                للمدير فقط
              </span>
              {summary.shortCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-extrabold text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="size-2.5" />
                  {summary.shortCount} عجز
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              الجرد الأعمى — اللي عدّاه الكاشير مقابل المتوقع لحظة الإغلاق
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summary.total > 0 && summary.total !== summary.match && (
            <button
              type="button"
              onClick={() => setOnlyIssues((v) => !v)}
              aria-pressed={onlyIssues}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors sm:text-xs',
                onlyIssues
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              الفروقات فقط
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            aria-label="تحديث"
            className="flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          </button>
        </div>
      </header>

      {/* ───── الملخص ───── */}
      {summary.total > 0 && (
        <div className="grid grid-cols-2 gap-2 border-b bg-muted/20 p-3 sm:grid-cols-4 sm:p-4">
          <Stat label="عدد الإغلاقات" value={summary.total} />
          <Stat label="مطابقة تماماً" value={summary.match} tone={summary.match ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
          <Stat
            label="إجمالي العجز"
            value={summary.shortTotal > 0 ? `−${formatCurrency(summary.shortTotal)}` : '—'}
            tone={summary.shortTotal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}
          />
          <Stat
            label="إجمالي الزيادة"
            value={summary.overTotal > 0 ? `+${formatCurrency(summary.overTotal)}` : '—'}
            tone={summary.overTotal > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="m-3.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
          {error}
        </p>
      )}

      {loading && !closures && (
        <div className="space-y-2 p-3.5 sm:p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      )}

      {!error && closures && closures.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <ClipboardCheck className="size-6" />
          </span>
          <p className="text-sm font-semibold">مفيش إغلاقات ورديات لسه</p>
          <p className="text-xs text-muted-foreground">أول ما الكاشير يغلق وردية هتظهر هنا</p>
        </div>
      )}

      {closures && closures.length > 0 && filtered.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">كل الإغلاقات مطابقة — مفيش فروقات 👌</p>
      )}

      {/* ───── القائمة ───── */}
      {visible.length > 0 && (
        <ul className="divide-y">
          {visible.map((c) => {
            const open = openId === c.id
            const v = c.variance
            const kind = kindOf(v)
            const K = KIND[kind]
            const KI = K.icon
            return (
              <li key={c.id} className="relative">
                <span className={cn('absolute inset-y-3 start-0 w-1 rounded-e-full', K.bar)} />
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  aria-expanded={open}
                  className={cn(
                    'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 py-3 text-start transition-colors hover:bg-muted/40 sm:px-4 sm:py-3.5',
                    open && 'bg-muted/30',
                  )}
                >
                  <span className={cn('flex size-10 items-center justify-center rounded-xl', K.tile)}>
                    <KI className="size-5" />
                  </span>

                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-extrabold sm:text-[15px]">{c.shiftName ?? '—'}</span>
                      {c.branchName && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                          {c.branchName}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3 shrink-0" />
                        {c.userName ?? '—'}
                      </span>
                      <span className="tabular-nums">{fmtWhen(c.createdAt)}</span>
                    </span>
                  </span>

                  <span className="flex items-center gap-2">
                    <span className="text-end">
                      <span className={cn('inline-block rounded-lg px-2.5 py-1 text-sm font-black tabular-nums sm:text-base', K.pill)}>
                        {v > 0 ? '+' : ''}
                        {formatCurrency(v)}
                      </span>
                      <span className={cn('mt-0.5 block text-[10px] font-bold', K.text)}>{K.label}</span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                    />
                  </span>
                </button>

                {open && (
                  <div className="space-y-3 border-t bg-muted/20 px-3.5 py-3.5 sm:px-4">
                    {/* العدّ مقابل المتوقع */}
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="عدّى الكاشير" value={formatCurrency(c.counted)} />
                      <Stat label="المتوقع" value={formatCurrency(c.expected)} />
                      <Stat
                        label={kind === 'match' ? 'مطابق تماماً ✅' : kind === 'over' ? 'زيادة فوق المتوقع' : 'عجز في الدرج'}
                        value={`${v > 0 ? '+' : ''}${formatCurrency(v)}`}
                        tone={K.text}
                      />
                    </div>

                    {/* 🔗 سجل المسؤولية */}
                    {c.session ? (
                      <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5">
                        <Link2 className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-extrabold text-sky-700 dark:text-sky-300">
                            اتحسبت على وردية مفتوحة بجلسة رسمية — المسؤولية كاملة
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-sky-700/90 dark:text-sky-300/90">
                            فتحها <b className="font-extrabold">{c.session.openedBy ?? '—'}</b>
                            {c.session.openedAt ? ` · ${fmtWhen(c.session.openedAt)}` : ''}
                            {' · '}العهدة الافتتاحية:{' '}
                            <b className="font-extrabold">
                              {c.session.openingFloat != null
                                ? formatCurrency(c.session.openingFloat)
                                : 'آخر إغلاق للفرع (اللي الكاشير اللي فات عدّاه)'}
                            </b>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                        <span>
                          الإغلاق ده من غير جلسة فتح رسمية — اتحسب على رصيد الدرج الكامل (بيورث رصيد الإغلاق اللي قبله).
                          شغّل «فتح الوردية» من نقطة البيع عشان المسؤولية تتحسب على كل وردية لوحدها.
                        </span>
                      </p>
                    )}

                    {c.note && (
                      <p className="rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-foreground/75">
                        ملاحظة: {c.note}
                      </p>
                    )}

                    {/* شغل الوردية */}
                    {c.window ? (
                      <div className="rounded-xl border bg-card p-3">
                        <p className="text-[11px] font-bold text-foreground/70">
                          {c.session
                            ? 'شغل الوردية — حركات الكاش من وقت الفتح لحد الإغلاق'
                            : 'نافذة الوردية — حركات الكاش بين الإغلاق ده واللي قبله'}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Stat label="داخل" value={formatCurrency(c.window.cashIn)} tone="text-emerald-700 dark:text-emerald-400" />
                          <Stat label="خارج" value={formatCurrency(Math.abs(c.window.cashOut))} tone="text-rose-600 dark:text-rose-400" />
                          <Stat label="صافي" value={formatCurrency(c.window.net)} />
                          <Stat label="عدد الحركات" value={`${c.window.count} حركة`} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        نافذة الوردية غير متاحة — مفيش إغلاق سابق مسجّل للفرع ده
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {(hidden > 0 || (showAll && filtered.length > PREVIEW_COUNT)) && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t bg-muted/20 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {showAll ? 'عرض أقل' : `عرض كل الإغلاقات (${filtered.length})`}
          <ChevronDown className={cn('size-3.5 transition-transform', showAll && 'rotate-180')} />
        </button>
      )}
    </section>
  )
}
