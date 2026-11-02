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
import { HandCoins } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

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

  React.useEffect(() => {
    let alive = true
    api<MyCommissionData>('/api/commissions/my')
      .then((d) => {
        if (!alive) return
        setData(d)
      })
      .catch(() => null)
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // ⚡ أثناء التحميل ما نرسمش أي حاجة: الكارت أصلاً بيختفي لأغلب المستخدمين (مدير/كاشير مش بائع)،
  // ولو رسمنا placeholder هيظهر 3 ثواني وبعدين المحتوى كله يقفز لفوق (layout shift).
  if (loading) return null
  // 🛡️ الميزة مقفولة أو المستخدم مش بائع → الكارت مش بيظهر خالص
  if (!data || !data.enabled || !data.isSeller) return null

  const targetPct = data.target && data.target > 0 ? Math.min(100, Math.round((data.netBase / data.target) * 100)) : null

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-bl from-emerald-500/10 via-card to-card p-4 shadow-sm" aria-label="عمولتي هذا الشهر">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <HandCoins className="size-[18px]" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold">عمولتي هذا الشهر</h2>
            <p className="text-[11px] text-muted-foreground">
              {data.invoices} فاتورة · مبيعات {formatCurrency(data.salesTotal)}
              {data.returnsTotal > 0 ? ` · مرتجعات ${formatCurrency(data.returnsTotal)}` : ''}
            </p>
          </div>
        </div>
        <div className="text-end">
          <p className={cn('text-xl font-extrabold tabular-nums', data.commission < 0 && 'text-rose-600 dark:text-rose-400')}>
            {formatCurrency(data.commission)}
          </p>
          <p className="text-[10px] font-bold text-muted-foreground">تقديري حتى الآن</p>
        </div>
      </header>

      {data.target != null && targetPct != null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
            <span className={data.targetMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
              {data.targetMet ? '✓ حققت التارجت' : `التارجت: ${formatCurrency(data.target)}`}
            </span>
            <span className="tabular-nums text-muted-foreground">{targetPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', data.targetMet ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${targetPct}%` }}
            />
          </div>
          {!data.targetMet && (
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              أوصل {formatCurrency(data.netBase)} من {formatCurrency(data.target)} — لما تحقق التارجت عمولتك بتتحسب على مبيعات الشهر كلها.
            </p>
          )}
        </div>
      )}

      {data.payout && (
        <p className="mt-3 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
          ✓ تم صرف {formatCurrency(data.payout.amount)} {data.payout.viaPayroll ? '(مع الراتب)' : ''}
        </p>
      )}
    </section>
  )
}
