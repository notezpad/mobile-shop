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
import { ChevronDown, Clock, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/api'

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
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

export function ShiftClosuresCard({ branchFilter }: { branchFilter: string }) {
  const [closures, setClosures] = React.useState<Closure[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<number | null>(null)

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
    void load()
  }, [load])

  return (
    <section className="mt-4 rounded-2xl border bg-card" aria-label="إغلاقات الورديات">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3.5 sm:p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <Clock className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold sm:text-base">إغلاقات الورديات — الجرد الأعمى</h3>
            <p className="truncate text-xs text-muted-foreground">
              اللي عدّاه الكاشير مقابل المتوقع لحظة الإغلاق — الأرقام دي لك انت بس
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="تحديث"
          className="flex size-8 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        </button>
      </header>

      {error && (
        <p role="alert" className="m-3.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
          {error}
        </p>
      )}

      {!error && closures && closures.length === 0 && !loading && (
        <p className="px-3.5 py-8 text-center text-sm font-medium text-foreground/60 sm:px-4">
          مفيش إغلاقات ورديات لسه — أول ما الكاشير يغلق وردية هتظهر هنا
        </p>
      )}

      {closures && closures.length > 0 && (
        <ul className="divide-y">
          {closures.map((c) => {
            const open = openId === c.id
            const v = c.variance
            const vTone =
              Math.abs(v) < 0.005
                ? 'text-muted-foreground'
                : v > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3 text-start transition-colors hover:bg-muted/50 sm:px-4"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                  />
                  <span className="w-28 shrink-0 text-xs font-bold tabular-nums text-foreground/80">
                    {fmtWhen(c.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {c.shiftName ?? '—'}
                    {c.branchName && (
                      <span className="ms-1.5 text-[11px] font-medium text-muted-foreground">· {c.branchName}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                    {c.userName ?? '—'}
                  </span>
                  <span className={cn('w-24 shrink-0 text-end text-sm font-extrabold tabular-nums', vTone)}>
                    {v > 0 ? '+' : ''}
                    {formatCurrency(v)}
                  </span>
                </button>

                {open && (
                  <div className="space-y-2.5 border-t bg-muted/20 px-3.5 py-3 sm:px-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-medium tabular-nums">
                      <span className="text-foreground/75">
                        عدّى <b className="font-extrabold text-foreground">{formatCurrency(c.counted)}</b>
                      </span>
                      <span className="text-foreground/75">
                        المتوقع <b className="font-extrabold text-foreground">{formatCurrency(c.expected)}</b>
                      </span>
                      <span className={cn('font-extrabold', vTone)}>
                        {Math.abs(v) < 0.005 ? 'مطابق تماماً ✅' : v > 0 ? 'زيادة فوق المتوقع' : 'عجز في الدرج'}
                      </span>
                    </div>
                    {c.note && (
                      <p className="rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-foreground/75">
                        ملاحظة: {c.note}
                      </p>
                    )}
                    {c.window ? (
                      <div className="rounded-xl border bg-card px-3 py-2.5">
                        <p className="text-[11px] font-bold text-foreground/70">
                          نافذة الوردية — حركات الكاش بين الإغلاق ده واللي قبله
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-medium tabular-nums">
                          <span className="text-emerald-700 dark:text-emerald-400">
                            داخل <b className="font-extrabold">{formatCurrency(c.window.cashIn)}</b>
                          </span>
                          <span className="text-rose-600 dark:text-rose-400">
                            خارج <b className="font-extrabold">{formatCurrency(Math.abs(c.window.cashOut))}</b>
                          </span>
                          <span className="text-foreground/75">
                            صافي <b className="font-extrabold text-foreground">{formatCurrency(c.window.net)}</b>
                          </span>
                          <span className="text-muted-foreground">({c.window.count} حركة)</span>
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
    </section>
  )
}
