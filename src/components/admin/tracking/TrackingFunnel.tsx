'use client'

/**
 * 📊 القمع التحليلي — Visitors → Registrations → Trials → Checkouts → Purchases
 * يعتمد على TrackingEvent + UserAttribution الموجودين — قراءة فقط.
 */

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { TrendingUp, ArrowDown } from 'lucide-react'
import { FilterBar, RangeFilterState, initialRange, rangeParams, fetchJson, fmtNum, fmtPct, StatChip, EmptyHint } from './shared'

interface FunnelData {
  visitors: number
  registrations: number
  trials: number
  checkouts: number
  purchases: number
  steps: { key: string; label: string; count: number; fromPrev: number | null }[]
  overallFromVisitors: number | null
  overallFromRegistrations: number | null
}

const STAGE_COLORS: Record<string, string> = {
  visitors: 'bg-sky-500/80',
  registrations: 'bg-indigo-500/80',
  trials: 'bg-violet-500/80',
  checkouts: 'bg-amber-500/80',
  purchases: 'bg-emerald-500/80',
}

export function TrackingFunnel() {
  const [filters, setFilters] = React.useState<RangeFilterState>(initialRange)
  const [data, setData] = React.useState<FunnelData | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const qs = rangeParams(filters)
      setData(await fetchJson<FunnelData>(`/api/admin/tracking/funnel?${qs.toString()}`))
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل القمع')
    } finally {
      setLoading(false)
    }
  }, [filters])

  React.useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const max = data?.steps?.[0]?.count ?? 0

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <FilterBar value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      {/* نسب التحويل الكلية */}
      {data && (
        <div className="flex flex-wrap gap-2">
          <StatChip label="التحويل الكلي (زائر → دفع)" value={fmtPct(data.overallFromVisitors)} tone="primary" />
          <StatChip label="التحويل (تسجيل → دفع)" value={fmtPct(data.overallFromRegistrations)} tone="success" />
          <StatChip label="تجربة → دفع" value={data.trials > 0 ? `${((data.purchases / data.trials) * 100).toFixed(1)}%` : '—'} />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-primary" /> رحلة العميل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {loading && !data ? (
            <div className="space-y-3 py-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data || data.visitors === 0 && data.registrations === 0 && data.purchases === 0 ? (
            <EmptyHint>
              لا توجد بيانات في هذه الفترة.
              <br />
              <span className="text-xs">ملاحظة: احتساب الزوار يبدأ من تفعيل الميزة (تسجيل الجلسات داخلياً) — التسجيلات والمدفوعات تُقرأ من أحداث التتبع الحقيقية.</span>
            </EmptyHint>
          ) : (
            data.steps.map((s, i) => (
              <div key={s.key}>
                {i > 0 && (
                  <div className="flex items-center gap-1.5 py-0.5 pr-6 text-[11px] text-muted-foreground">
                    <ArrowDown className="size-3" />
                    تحويل من المرحلة السابقة: <b className={s.fromPrev != null && s.fromPrev < 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>{fmtPct(s.fromPrev)}</b>
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="font-mono text-sm font-bold tabular-nums">{fmtNum(s.count)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${STAGE_COLORS[s.key] ?? 'bg-primary/70'}`}
                        style={{ width: max > 0 ? `${Math.max((s.count / max) * 100, s.count > 0 ? 2 : 0)}%` : '0%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {data && (
            <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
              كل مرحلة تُحسب من أحداث التتبع الحقيقية بمعرفات فريدة (بدون تكرار المزودين) — والزوار من جلسات التصفح الداخلية.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
