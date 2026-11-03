'use client'

/**
 * 💰 2026-11-01 (التحديث الثالث عشر) — كارت «عمولتي» في الداشبورد.
 *
 * البائع بيشوف عمولته هو بس (السيشن هو مصدر الهوية — مفيش اختيار مستخدم):
 * مبيعات الشهر، التارجت ومدى التقدم، والعمولة التقديرية حتى الآن + حالة
 * التسوية. الكارت بيختفي تماماً لو الميزة مقفولة أو المستخدم مش بائع.
 * الأرقام من /api/commissions/my — بتتحسب على السيرفر.
 */

import * as React from 'react'
import { CheckCircle2, HandCoins } from 'lucide-react'
import { api } from '@/lib/api'
import { useDataRefresh } from '@/lib/offline/data-events'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Chip, Icon3D, Meter, PANEL } from './dashboard-ui'

interface MyCommissionData {
  enabled: boolean
  isSeller: boolean
  target: number | null
  invoices: number
  salesTotal: number
  returnsTotal: number
  netBase: number
  commission: number
  targetMet: boolean
  payout: { amount: number; viaPayroll: boolean; paidAt: string } | null
}

export function MyCommissionCard() {
  const [data, setData] = React.useState<MyCommissionData | null>(null)
  const [loading, setLoading] = React.useState(true)

  const aliveRef = React.useRef(true)
  const load = React.useCallback(() => {
    api<MyCommissionData>('/api/commissions/my')
      .then((d) => {
        if (aliveRef.current) setData(d)
      })
      .catch(() => null)
      .finally(() => {
        if (aliveRef.current) setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    aliveRef.current = true
    load()
    return () => {
      aliveRef.current = false
    }
  }, [load])

  // 🔄 كل بيعة بتزوّد عمولة البائع — الكارت يتحدث لحظياً
  useDataRefresh(['commissions'], load)

  // 🛡️ 2026-11-03: أثناء التحميل منرسمش null — بنحجز مكان الكارت بسكيليتون بنفس
  // التصميم، عشان لما الرد يوصل الداشبورد ميقفزش لتحت (كان بيعمل layout-shift).
  if (loading) {
    return (
      <section
        className={cn(
          PANEL,
          'relative overflow-hidden border-emerald-500/20 bg-gradient-to-bl from-emerald-500/[0.07] via-card to-card p-4 sm:p-5',
        )}
        aria-label="عمولتي هذا الشهر"
        aria-busy="true"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -end-12 -top-12 size-40 rounded-full bg-emerald-400/15 blur-3xl"
        />
        <header className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-11 rounded-xl" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>
        </header>
        <div className="relative mt-4 rounded-2xl border bg-background/60 p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-3.5 w-40 rounded-md" />
          </div>
          <Skeleton className="h-2.5 w-full rounded-full" />
        </div>
      </section>
    )
  }
  // 🛡️ الميزة مقفولة أو المستخدم مش بائع → الكارت مش بيظهر خالص (سلوك مقصود بعد التحميل)
  if (!data || !data.enabled || !data.isSeller) return null

  const targetPct = data.target && data.target > 0 ? Math.min(100, Math.round((data.netBase / data.target) * 100)) : null

  return (
    <section
      className={cn(
        PANEL,
        'relative overflow-hidden border-emerald-500/20 bg-gradient-to-bl from-emerald-500/[0.07] via-card to-card p-4 sm:p-5',
      )}
      aria-label="عمولتي هذا الشهر"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -end-12 -top-12 size-40 rounded-full bg-emerald-400/15 blur-3xl"
      />
      <header className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon3D icon={HandCoins} tone="emerald" />
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold leading-tight">عمولتي هذا الشهر</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.invoices} فاتورة · مبيعات {formatCurrency(data.salesTotal)}
              {data.returnsTotal > 0 ? ` · مرتجعات ${formatCurrency(data.returnsTotal)}` : ''}
            </p>
          </div>
        </div>
        <div className="text-end">
          <p
            className={cn(
              'text-2xl font-black tabular-nums leading-tight sm:text-3xl',
              data.commission < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-300',
            )}
          >
            {formatCurrency(data.commission)}
          </p>
          <Chip tone="neutral" className="mt-1 px-2 py-0.5 text-[10px]">تقديري حتى الآن</Chip>
        </div>
      </header>

      {data.target != null && targetPct != null && (
        <div className="relative mt-4 rounded-2xl border bg-background/60 p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold">
            <span className={data.targetMet ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
              {data.targetMet ? '✓ حققت التارجت' : 'لسه ما حققتش التارجت'}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatCurrency(data.netBase)} من {formatCurrency(data.target)} · {targetPct}%
            </span>
          </div>
          <Meter pct={targetPct} tone={data.targetMet ? 'emerald' : 'amber'} />
          {!data.targetMet && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              لما تحقق التارجت عمولتك بتتحسب على مبيعات الشهر كلها.
            </p>
          )}
        </div>
      )}

      {data.payout && (
        <p className="relative mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0" />
          تم صرف {formatCurrency(data.payout.amount)} {data.payout.viaPayroll ? '(مع الراتب)' : ''}
        </p>
      )}
    </section>
  )
}
