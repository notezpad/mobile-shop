'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  PlanChangeLogPanel — سجل تغييرات الباقات + المستحقات (2026-10-10)
 * ═══════════════════════════════════════════════════════════════════════
 *  لوحة تحكم كاملة لصاحب المنصة:
 *   - كل تبديل/تعيين/تجديد/إصدار باقة في مكان واحد (سجل تدقيق)
 *   - فرق الترقيات النسبية (proration) غير المحصّلة — مع زر تحصيل
 *   - ملخص: إجمالي المستحقات المفتوحة + إجمالي فروق محصّلة
 *
 *  مكوّن معزول تماماً (بيجيب بياناته بنفسه من /api/admin/billing-history)
 *  — يُدمج في AdminSubscriptionsView بسطر واحد بدون أي تأثير على باقي
 *  منطق الصفحة.
 */

import * as React from 'react'
import {
  History,
  RefreshCw,
  Banknote,
  RotateCcw,
  ArrowLeftRight,
  UserCog,
  Repeat,
  ReceiptText,
  FlaskConical,
  CircleAlert,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { formatShortDate } from '@/lib/format'
import { toast } from 'sonner'

interface LogRow {
  id: number
  createdAt: string
  tenantId: string
  shopName: string
  changeType: string
  period: string | null
  fromPlanCode: string | null
  fromPlanName: string | null
  toPlanCode: string | null
  toPlanName: string | null
  amountPaid: number
  amountDue: number
  dueSettled: boolean
  settledAt: string | null
  settledMethod: string | null
  creditValue: number
  creditDays: number
  remainingDays: number
  note: string | null
  actor: string | null
}

interface Summary {
  outstandingDue: number
  outstandingCount: number
  collectedDue: number
}

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

type TypeMeta = { label: string; cls: string; icon: LucideIcon }

const TYPE_META: Record<string, TypeMeta> = {
  switch: {
    label: 'تبديل ذاتي',
    cls: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    icon: ArrowLeftRight,
  },
  assign: {
    label: 'تعيين أدمن',
    cls: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    icon: UserCog,
  },
  renew: {
    label: 'تجديد',
    cls: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: Repeat,
  },
  manual: {
    label: 'إصدار يدوي',
    cls: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
    icon: ReceiptText,
  },
  trial: {
    label: 'تجربة',
    cls: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: FlaskConical,
  },
}

const typeMeta = (t: string): TypeMeta =>
  TYPE_META[t] ?? { label: t, cls: 'border-border/60 bg-muted/60 text-muted-foreground', icon: History }

export function PlanChangeLogPanel() {
  const [loading, setLoading] = React.useState(true)
  const [rows, setRows] = React.useState<LogRow[]>([])
  const [summary, setSummary] = React.useState<Summary>({
    outstandingDue: 0,
    outstandingCount: 0,
    collectedDue: 0,
  })
  const [dueOnly, setDueOnly] = React.useState(false)
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [settlingId, setSettlingId] = React.useState<number | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (silent) setLoading((v) => v) // keep table mounted during refresh
    else setLoading(true)
    try {
      const params = new URLSearchParams({ take: '80' })
      if (dueOnly) params.set('due', '1')
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const data = await api<{ items: LogRow[]; summary: Summary }>(
        `/api/admin/billing-history?${params.toString()}`
      )
      setRows(Array.isArray(data?.items) ? data.items : [])
      if (data?.summary) setSummary(data.summary)
    } catch (e: any) {
      const msg = e?.message || 'فشل تحميل سجل تغييرات الباقات'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [dueOnly, typeFilter])

  React.useEffect(() => {
    load()
  }, [load])

  const settle = async (row: LogRow, settled: boolean) => {
    setSettlingId(row.id)
    try {
      await api('/api/admin/billing-history', {
        method: 'PATCH',
        body: { id: row.id, settled, method: settled ? 'manual' : undefined },
      })
      toast.success(
        settled
          ? `تم تسجيل تحصيل ${num(row.amountDue)} جنيه من «${row.shopName}»`
          : 'تم إعادة فتح المستحق'
      )
      await load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحديث حالة التحصيل')
    } finally {
      setSettlingId(null)
    }
  }

  const hasFilters = dueOnly || typeFilter !== 'all'

  return (
    <section className="animate-in-up stagger-1 relative">
      <div className="rounded-2xl border bg-card shadow-sm">
        {/* ═══ رأس اللوحة + الملخص ═══ */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
              <History className="size-[18px]" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-sm font-extrabold leading-tight">سجل تغييرات الباقات</h2>
              <p className="text-[11px] text-muted-foreground">
                كل تبديل وترقية وتجديد — موثّق بالفرق المحسوب بالتناسب
              </p>
            </div>
          </div>

          {/* شرائح الملخص */}
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDueOnly((v) => !v)}
              aria-pressed={dueOnly}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition-colors',
                dueOnly
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-800 dark:text-amber-200'
                  : summary.outstandingDue > 0
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
                    : 'border-border/60 bg-muted/60 text-muted-foreground'
              )}
              title="فلترة: المستحقات غير المحصّلة فقط"
            >
              <CircleAlert className="size-3" />
              مستحقات غير محصّلة: {num(summary.outstandingDue)} جـ ({summary.outstandingCount})
            </button>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300">
              <Banknote className="size-3" />
              فروق محصّلة: {num(summary.collectedDue)} جـ
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => load(true)}
              className="h-7 gap-1 rounded-full px-2 text-[11px]"
            >
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
              تحديث
            </Button>
          </div>
        </div>

        {/* ═══ الجدول ═══ */}
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <History className="mx-auto size-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm font-bold">
              {hasFilters ? 'لا توجد عمليات مطابقة للفلترة' : 'لا توجد تغييرات مسجّلة بعد'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasFilters
                ? 'جرّب إلغاء الفلاتر أو انتظر عمليات جديدة'
                : 'أول تبديل أو تجديد أو ترقية هيظهر هنا تلقائياً'}
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="text-[11px]">التاريخ</TableHead>
                  <TableHead className="text-[11px]">المحل</TableHead>
                  <TableHead className="text-[11px]">التغيير</TableHead>
                  <TableHead className="text-[11px]">النوع</TableHead>
                  <TableHead className="text-[11px]">المال</TableHead>
                  <TableHead className="text-[11px]">الإجراء</TableHead>
                  <TableHead className="text-[11px]">تفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const meta = typeMeta(r.changeType)
                  const Icon = meta.icon
                  const hasDue = r.amountDue > 0
                  const hasCredit = r.creditDays > 0
                  return (
                    <TableRow key={r.id} className={cn(hasDue && !r.dueSettled && 'bg-amber-500/[0.06]')}>
                      <TableCell className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatShortDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-[12px] font-bold" title={r.shopName}>
                        {r.shopName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px]">
                        {r.fromPlanName ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-muted-foreground">{r.fromPlanName}</span>
                            <span className="text-muted-foreground/50">←</span>
                            <span className="font-extrabold">{r.toPlanName ?? '—'}</span>
                          </span>
                        ) : (
                          <span className="font-extrabold">{r.toPlanName ?? '—'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold leading-4',
                            meta.cls
                          )}
                        >
                          <Icon className="size-3" />
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px]">
                        {r.amountPaid > 0 && (
                          <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                            محصّل {num(r.amountPaid)} جـ
                          </span>
                        )}
                        {hasDue && (
                          <span
                            className={cn(
                              'font-extrabold tabular-nums',
                              r.dueSettled
                                ? 'text-muted-foreground line-through decoration-1'
                                : 'text-amber-700 dark:text-amber-400'
                            )}
                          >
                            {r.amountPaid > 0 && <span className="mx-1">·</span>}
                            {r.dueSettled ? 'فرق ' : 'مستحق '}
                            {num(r.amountDue)} جـ
                          </span>
                        )}
                        {r.amountPaid <= 0 && !hasDue && hasCredit && (
                          <span className="font-bold tabular-nums text-sky-600 dark:text-sky-400">
                            +{r.creditDays} يوم مجاناً
                          </span>
                        )}
                        {r.amountPaid <= 0 && !hasDue && !hasCredit && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasDue ? (
                          r.dueSettled ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={settlingId === r.id}
                              onClick={() => settle(r, false)}
                              className="h-7 gap-1 rounded-full px-2 text-[11px] text-muted-foreground hover:text-foreground"
                              title={
                                r.settledAt
                                  ? `حُصِّل ${formatShortDate(r.settledAt)}${r.settledMethod ? ` (${r.settledMethod})` : ''} — اضغط للإلغاء`
                                  : 'إلغاء التحصيل'
                              }
                            >
                              <RotateCcw className="size-3" />
                              إلغاء التحصيل
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={settlingId === r.id}
                              onClick={() => settle(r, true)}
                              className="h-7 gap-1 rounded-full bg-gradient-to-l from-emerald-600 to-teal-600 px-2.5 text-[11px] font-bold text-white shadow-sm hover:from-emerald-500 hover:to-teal-500"
                            >
                              <Banknote className="size-3" />
                              {settlingId === r.id ? '...' : `تحصيل ${num(r.amountDue)} جـ`}
                            </Button>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate text-[11px] text-muted-foreground" title={r.note ?? undefined}>
                          {r.creditDays > 0 && !hasDue ? `تعويض ${num(r.creditValue)} جـ · ` : ''}
                          {r.remainingDays > 0 ? `متبقي ${r.remainingDays} يوم · ` : ''}
                          {r.actor === 'self' ? 'بواسطة المحل' : r.actor ? r.actor : ''}
                          {r.note ? (r.actor || r.remainingDays > 0 || r.creditDays > 0 ? ' · ' : '') + r.note : ''}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  )
}
