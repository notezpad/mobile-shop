'use client'

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
  ArrowUpRight,
  ArrowDownRight,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/api'
import { useDataRefresh } from '@/lib/offline/data-events'
import { Button } from '@/components/ui/button'

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

// ألوان وأيقونات الحالة (مطابق، عجز، زيادة) — تصميم 2026
const KIND: Record<Kind, { 
  label: string; 
  icon: LucideIcon; 
  tile: string; 
  pill: string; 
  text: string; 
  bar: string;
  cardBorder: string;
}> = {
  match: {
    label: 'مطابق',
    icon: CheckCircle2,
    tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-400',
    cardBorder: 'border-slate-200 dark:border-slate-800',
  },
  short: {
    label: 'عجز',
    icon: AlertTriangle,
    tile: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400',
    pill: 'bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
    text: 'text-rose-600 dark:text-rose-400',
    bar: 'bg-rose-500',
    cardBorder: 'border-rose-100 dark:border-rose-900/30',
  },
  over: {
    label: 'زيادة',
    icon: TrendingUp,
    tile: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400',
    pill: 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
    text: 'text-sky-600 dark:text-sky-400',
    bar: 'bg-sky-500',
    cardBorder: 'border-sky-100 dark:border-sky-900/30',
  },
}

function Stat({ label, value, tone, className, icon: Icon }: { label: string; value: React.ReactNode; tone?: string; className?: string; icon?: LucideIcon }) {
  return (
    <div className={cn('flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-800/50', className)}>
      <div className="flex items-center justify-between">
        <p className="truncate text-xs font-bold text-slate-500">{label}</p>
        {Icon && <Icon className="size-3.5 text-slate-400" />}
      </div>
      <p className={cn('mt-2 truncate text-base font-black tabular-nums', tone)}>{value}</p>
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
    <div className="w-full space-y-4" dir="rtl">
      
      {/* ───── الهيدر (زجاجي حديث) ───── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-md">
            <ClipboardCheck className="size-6" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">إغلاقات الورديات</h3>
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Lock className="size-3" /> للمدير فقط
              </span>
              {summary.shortCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                  <AlertTriangle className="size-3" /> {summary.shortCount} عجز
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">الجرد الأعمى — اللي عدّاه الكاشير مقابل المتوقع لحظة الإغلاق</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summary.total > 0 && summary.total !== summary.match && (
            <button
              type="button"
              onClick={() => setOnlyIssues((v) => !v)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-xs font-bold transition-all border shadow-sm',
                onlyIssues
                  ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:text-slate-900 dark:border-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
              )}
            >
              الفروقات فقط
            </button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => void load()}
            className="size-9 rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {loading ? <Loader2 className="size-4 animate-spin text-slate-500" /> : <RotateCcw className="size-4 text-slate-500" />}
          </Button>
        </div>
      </div>

      {/* ───── الإحصائيات (Bento Stats) ───── */}
      {summary.total > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* عدد الإغلاقات */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-0.5">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-500">عدد الإغلاقات</span>
              <span className="text-2xl font-black mt-1 text-slate-800 dark:text-slate-100">{summary.total}</span>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <ClipboardCheck className="size-5" />
            </span>
          </div>

          {/* مطابقة تماماً */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-0.5">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-500">مطابقة تماماً</span>
              <span className="text-2xl font-black text-slate-700 mt-1 dark:text-slate-300">{summary.match}</span>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
            </span>
          </div>

          {/* إجمالي العجز */}
          <div className={cn(
            "rounded-2xl border p-4 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-0.5",
            summary.shortTotal > 0 
              ? "bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/30" 
              : "bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800"
          )}>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-500">إجمالي العجز</span>
              <span className={cn("text-2xl font-black mt-1 tabular-nums", summary.shortTotal > 0 ? "text-rose-600" : "text-slate-300 dark:text-slate-700")}>
                {summary.shortTotal > 0 ? `-${formatCurrency(summary.shortTotal)}` : '—'}
              </span>
            </div>
            <span className={cn(
              "grid size-10 place-items-center rounded-xl",
              summary.shortTotal > 0 ? "bg-rose-100 text-rose-600 dark:bg-rose-900/50" : "bg-slate-50 text-slate-300 dark:bg-slate-800 dark:text-slate-700"
            )}>
              <ArrowDownRight className="size-5" />
            </span>
          </div>

          {/* إجمالي الزيادة */}
          <div className={cn(
            "rounded-2xl border p-4 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-0.5",
            summary.overTotal > 0 
              ? "bg-sky-50/50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-900/30" 
              : "bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800"
          )}>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-500">إجمالي الزيادة</span>
              <span className={cn("text-2xl font-black mt-1 tabular-nums", summary.overTotal > 0 ? "text-sky-600" : "text-slate-300 dark:text-slate-700")}>
                {summary.overTotal > 0 ? `+${formatCurrency(summary.overTotal)}` : '—'}
              </span>
            </div>
            <span className={cn(
              "grid size-10 place-items-center rounded-xl",
              summary.overTotal > 0 ? "bg-sky-100 text-sky-600 dark:bg-sky-900/50" : "bg-slate-50 text-slate-300 dark:bg-slate-800 dark:text-slate-700"
            )}>
              <ArrowUpRight className="size-5" />
            </span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/20">
          {error}
        </p>
      )}

      {loading && !closures && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {!error && closures && closures.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300 py-16 dark:border-slate-800">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-sky-50 text-sky-500 dark:bg-sky-950/30">
            <ClipboardCheck className="size-8" />
          </span>
          <div className="text-center">
            <p className="text-lg font-black text-slate-700 dark:text-slate-300">مفيش إغلاقات ورديات لسه</p>
            <p className="mt-1 text-sm text-slate-500">أول ما الكاشير يغلق وردية هتظهر هنا</p>
          </div>
        </div>
      )}

      {closures && closures.length > 0 && filtered.length === 0 && (
        <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/50 py-10 text-center dark:border-emerald-900/50 dark:bg-emerald-950/10">
          <CheckCircle2 className="size-10 text-emerald-500 mx-auto mb-2 opacity-50" />
          <p className="text-base font-black text-emerald-600">كل الإغلاقات مطابقة — مفيش فروقات 👌</p>
        </div>
      )}

      {/* ───── قائمة الكروت (Smart Cards) ───── */}
      <div className="space-y-3">
        {visible.map((c) => {
          const open = openId === c.id
          const v = c.variance
          const kind = kindOf(v)
          const K = KIND[kind]
          const KI = K.icon

          return (
            <div
              key={c.id}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-slate-900 transition-all duration-300",
                "border shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]",
                K.cardBorder
              )}
            >
              {/* شريط لون جانبي عريض */}
              <div className={cn("absolute top-0 bottom-0 right-0 w-1.5", K.bar)} />

              <button
                type="button"
                onClick={() => setOpenId(open ? null : c.id)}
                className={cn(
                  "flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 pl-5 text-start transition-colors",
                  open && "bg-slate-50/80 dark:bg-slate-800/30"
                )}
              >
                {/* الأيقونة */}
                <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl shadow-sm", K.tile)}>
                  <KI className="size-6" />
                </span>

                {/* بيانات الوردية */}
                <div className="flex-1 min-w-[150px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-base text-slate-800 dark:text-slate-100">{c.shiftName ?? '—'}</span>
                    {c.branchName && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {c.branchName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1.5"><User className="size-3.5" /> {c.userName ?? '—'}</span>
                    <span className="tabular-nums flex items-center gap-1.5">{fmtWhen(c.createdAt)}</span>
                  </div>
                </div>

                {/* المبلغ والسهم */}
                <div className="flex items-center gap-2 ml-auto sm:ml-0">
                  <span className={cn("inline-flex items-center rounded-xl px-3 py-1.5 text-base font-black tabular-nums shadow-sm", K.pill)}>
                    {v > 0 ? '+' : ''}{formatCurrency(v)}
                  </span>
                  <div className="grid size-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200 dark:bg-slate-800 dark:group-hover:bg-slate-700">
                    <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
                  </div>
                </div>
              </button>

              {/* التفاصيل عند التوسيع (الجزء اللي اتظبط) */}
              {open && (
                <div className="border-t border-slate-100 dark:border-slate-800 bg-white px-4 py-5 space-y-4 rounded-b-3xl">
                  
                  {/* شبكة العد والمتوقع (Bento محسن) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Stat 
                      label="عدّى الكاشير" 
                      value={formatCurrency(c.counted)} 
                      icon={User}
                    />
                    <Stat 
                      label="المتوقع (رصيد الكاش)" 
                      value={formatCurrency(c.expected)} 
                      icon={ClipboardCheck}
                    />
                    <Stat
                      label={kind === 'match' ? 'مطابق تماماً ✅' : kind === 'over' ? 'زيادة فوق المتوقع' : 'عجز في الدرج'}
                      value={`${v > 0 ? '+' : ''}${formatCurrency(v)}`}
                      tone={K.text}
                      icon={kind === 'match' ? CheckCircle2 : kind === 'over' ? TrendingUp : AlertTriangle}
                      className={cn(
                        "border-transparent shadow-sm",
                        K.tile
                      )}
                    />
                  </div>

                  {/* سجل المسؤولية (Session) */}
                  {c.session ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-4 dark:border-sky-900/30 dark:bg-sky-950/20">
                      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-200/50 text-sky-600 dark:bg-sky-900/50 dark:text-sky-400">
                        <Link2 className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-sky-900 dark:text-sky-300">
                          اتحسبت على وردية مفتوحة بجلسة رسمية — المسؤولية كاملة
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-sky-800/80 dark:text-sky-400/80">
                          فتحها <b className="font-bold text-sky-900 dark:text-sky-300">{c.session.openedBy ?? '—'}</b>
                          {c.session.openedAt ? ` · ${fmtWhen(c.session.openedAt)}` : ''}
                          {' · '}العهدة الافتتاحية:{' '}
                          <b className="font-bold text-sky-900 dark:text-sky-300">
                            {c.session.openingFloat != null
                              ? formatCurrency(c.session.openingFloat)
                              : 'آخر إغلاق للفرع'}
                          </b>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
                      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-200 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                        <AlertTriangle className="size-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-amber-900 dark:text-amber-300 mb-1">لا توجد جلسة فتح رسمية</p>
                        <p className="text-xs font-medium leading-relaxed text-amber-800/80 dark:text-amber-400/80">
                          الإغلاق ده اتحسب على رصيد الدرج الكامل (بيورث رصيد الإغلاق اللي قبله).
                          شغّل «فتح الوردية» من نقطة البيع عشان المسؤولية تتحسب على كل وردية لوحدها.
                        </p>
                      </div>
                    </div>
                  )}

                  {c.note && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <span className="font-bold text-slate-900 dark:text-white">ملاحظة:</span> {c.note}
                    </div>
                  )}

                  {/* شغل الوردية (Window) */}
                  {c.window ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-sm font-black text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                        <ClipboardCheck className="size-4 text-slate-500" />
                        {c.session
                          ? 'شغل الوردية — حركات الكاش من وقت الفتح لحد الإغلاق'
                          : 'نافذة الوردية — حركات الكاش بين الإغلاق ده واللي قبله'}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Stat label="داخل" value={formatCurrency(c.window.cashIn)} tone="text-emerald-600" />
                        <Stat label="خارج" value={formatCurrency(Math.abs(c.window.cashOut))} tone="text-rose-600" />
                        <Stat label="صافي" value={formatCurrency(c.window.net)} />
                        <Stat label="عدد الحركات" value={`${c.window.count} حركة`} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                        <Info className="size-4" /> نافذة الوردية غير متاحة
                      </div>
                      <span className="text-xs text-slate-400">مفيش إغلاق سابق مسجل للفرع ده</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {(hidden > 0 || (showAll && filtered.length > PREVIEW_COUNT)) && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {showAll ? 'عرض أقل' : `عرض كل الإغلاقات (${filtered.length})`}
          <ChevronDown className={cn('size-4 transition-transform duration-300', showAll && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}