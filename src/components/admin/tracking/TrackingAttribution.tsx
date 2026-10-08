'use client'

/**
 * 🎯 تقارير الإسناد — أي مصدر/حملة يجلب العملاء المدفوعين فعلياً.
 * First Touch / Last Touch + ترتيب حسب Purchases / Revenue / Trials / Conversion.
 */

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Target, ArrowUpDown } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  FilterBar, RangeFilterState, initialRange, rangeParams, fetchJson,
  fmtNum, fmtPct100, fmtMoney, EmptyHint,
} from './shared'

interface AttributionRow {
  source: string
  medium: string
  campaign: string
  registrations: number
  trials: number
  checkouts: number
  purchases: number
  trialToPaid: number | null
  revenue: number
}

type SortKey = 'purchases' | 'revenue' | 'trials' | 'conversion' | 'registrations'

/** رأس جدول قابل للترتيب — خارج المكون لتفادي إعادة الإنشاء عند كل render */
function SortTh({ k, sortBy, order, onSort, children }: {
  k: SortKey
  sortBy: SortKey
  order: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  children: React.ReactNode
}) {
  return (
    <TableHead>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${sortBy === k ? 'font-bold text-foreground' : ''}`}
      >
        {children}
        <ArrowUpDown className="size-3" />
        {sortBy === k && <span className="text-[9px]">{order === 'desc' ? '▼' : '▲'}</span>}
      </button>
    </TableHead>
  )
}

const SORT_LABELS: Record<SortKey, string> = {
  purchases: 'المدفوعات',
  revenue: 'الإيراد',
  trials: 'التجارب',
  conversion: 'نسبة التحويل',
  registrations: 'التسجيلات',
}

export function TrackingAttribution() {
  const [filters, setFilters] = React.useState<RangeFilterState>(initialRange)
  const [sortBy, setSortBy] = React.useState<SortKey>('purchases')
  const [order, setOrder] = React.useState<'asc' | 'desc'>('desc')
  const [rows, setRows] = React.useState<AttributionRow[] | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const qs = rangeParams(filters)
      qs.set('sortBy', sortBy)
      qs.set('order', order)
      const res = await fetchJson<{ rows: AttributionRow[] }>(`/api/admin/tracking/attribution?${qs.toString()}`)
      setRows(res.rows)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل تقرير الإسناد')
    } finally {
      setLoading(false)
    }
  }, [filters, sortBy, order])

  React.useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const changeSort = (key: SortKey) => {
    if (sortBy === key) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(key)
      setOrder('desc')
    }
  }

  const hasData = rows && rows.length > 0

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <FilterBar value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Target className="size-4 text-primary" /> المصادر والحملات
            </span>
            {hasData && <Badge variant="outline" className="text-[10px]">{fmtNum(rows!.length)} مجموعة</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !rows ? (
            <div className="space-y-2.5">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : !hasData ? (
            <EmptyHint>
              لا توجد بيانات إسناد في هذه الفترة بهذه الفلاتر.
              <br />
              <span className="text-xs">التسجيلات تأتي من أحداث CompleteRegistration الحقيقية، وتُصنف حسب First/Last Touch المحفوظ لكل مستخدم.</span>
            </EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المصدر</TableHead>
                    <TableHead>الوسيط</TableHead>
                    <TableHead>الحملة</TableHead>
                    <SortTh k="registrations" sortBy={sortBy} order={order} onSort={changeSort}>تسجيلات</SortTh>
                    <SortTh k="trials" sortBy={sortBy} order={order} onSort={changeSort}>تجارب</SortTh>
                    <TableHead>بدء دفع</TableHead>
                    <SortTh k="purchases" sortBy={sortBy} order={order} onSort={changeSort}>مدفوعات</SortTh>
                    <TableHead>تجربة→دفع</TableHead>
                    <SortTh k="revenue" sortBy={sortBy} order={order} onSort={changeSort}>الإيراد</SortTh>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows!.map((r, i) => (
                    <TableRow key={`${r.source}|${r.medium}|${r.campaign}|${i}`} className={i === 0 && sortBy !== 'registrations' ? 'bg-emerald-500/5' : ''}>
                      <TableCell className="font-medium" dir="ltr">{r.source}</TableCell>
                      <TableCell dir="ltr" className="text-muted-foreground">{r.medium}</TableCell>
                      <TableCell dir="ltr" className="max-w-[180px] truncate text-muted-foreground" title={r.campaign}>{r.campaign}</TableCell>
                      <TableCell className="tabular-nums">{fmtNum(r.registrations)}</TableCell>
                      <TableCell className="tabular-nums">{fmtNum(r.trials)}</TableCell>
                      <TableCell className="tabular-nums">{fmtNum(r.checkouts)}</TableCell>
                      <TableCell>
                        <span className={`tabular-nums font-bold ${r.purchases > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                          {fmtNum(r.purchases)}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{fmtPct100(r.trialToPaid)}</TableCell>
                      <TableCell className="tabular-nums font-bold">{fmtMoney(r.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            الترتيب الحالي: <b>{SORT_LABELS[sortBy]}</b> ({order === 'desc' ? 'تنازلي' : 'تصاعدي'}) — اضغط على رأس أي عمود لتغييره.
            الإيراد = مجموع المدفوع الفعلي للاشتراكات المرتبطة بعمليات Purchase المؤكدة.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
