'use client'

/**
 * المشتريات — هوية "شريط الباركود".
 * خامة الصفحة: بترول/سماوي غامق + كربون (مفيش بنفسجي، ومفيش تكرار لألوان
 * العملاء/الموردين/المصروفات/الخزنة/الفروع).
 * العنصر المميّز: شريط باركود يومي — كل خط = مشتريات يوم، والضغط عليه يفلتر اليوم.
 */

import * as React from 'react'
import { ChevronDown, FileSpreadsheet, Plus, RotateCcw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PurchaseOrderDialog } from './PurchaseOrderDialog'
import { PurchaseReturnDialog } from './PurchaseReturnDialog'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

interface OrderItem {
  id: number
  name: string
  cost: number
  quantity: number
  returnedQty?: number
}
interface PurchaseOrder {
  id: number
  orderNo: string | null
  total: number
  paid: number
  paymentMethod?: string | null
  refunded?: number
  status: string
  createdAt: string
  userName?: string | null
  supplier: { name: string; phone?: string | null } | null
  items: OrderItem[]
}

// تاريخ بتوقيت جهاز المحل (مش UTC) — نفس منطق النسخة السابقة
const toISODate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })

const isReturned = (o: PurchaseOrder) => o.status === 'مرتجعة'

export function PurchaseOrdersView() {
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [day, setDay] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<number | null>(null)
  const [returnId, setReturnId] = React.useState<number | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async (f?: string, t?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f) params.set('from', f)
      if (t) params.set('to', t)
      const qs = params.toString()
      setOrders(await api<PurchaseOrder[]>(`/api/purchase-orders${qs ? `?${qs}` : ''}`))
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المشتريات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDataRefresh(['purchase-orders'], () => load(from, to))

  const applyRange = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    setDay(null)
    load(f, t)
  }
  const quick = (daysBack: number | 'month') => {
    const end = new Date()
    const start = new Date()
    if (daysBack === 'month') start.setDate(1)
    else start.setDate(start.getDate() - daysBack)
    applyRange(toISODate(start), toISODate(end))
  }

  // ── البيانات المشتقة ──
  const byQuery = React.useMemo(() => {
    const q = query.trim()
    return q ? orders.filter((o) => (o.orderNo ?? String(o.id)).includes(q)) : orders
  }, [orders, query])

  const filtered = day ? byQuery.filter((o) => toISODate(new Date(o.createdAt)) === day) : byQuery

  const strip = React.useMemo(() => {
    const m = new Map<string, number>()
    byQuery.forEach((o) => {
      if (isReturned(o)) return
      const k = toISODate(new Date(o.createdAt))
      m.set(k, (m.get(k) ?? 0) + o.total)
    })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-32)
  }, [byQuery])
  const stripMax = Math.max(1, ...strip.map(([, v]) => v))

  const live = filtered.filter((o) => !isReturned(o))
  const sumTotal = live.reduce((s, o) => s + o.total, 0)
  const sumPaid = live.reduce((s, o) => s + o.paid, 0)
  const sumDue = Math.max(0, sumTotal - sumPaid)
  const paidPct = sumTotal > 0 ? Math.min(100, (sumPaid / sumTotal) * 100) : 0

  const groups = React.useMemo(() => {
    const m = new Map<string, PurchaseOrder[]>()
    filtered.forEach((o) => {
      const k = toISODate(new Date(o.createdAt))
      m.set(k, [...(m.get(k) ?? []), o])
    })
    return [...m.entries()]
  }, [filtered])

  const returnOrder = returnId !== null ? orders.find((o) => o.id === returnId) ?? null : null

  const exportExcel = () => {
    if (filtered.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('سجل-المشتريات'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل أوامر الشراء',
      sheetName: 'أوامر الشراء',
      columns: [
        { header: 'رقم الأمر', key: 'orderNo', format: 'text' },
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'المورد', key: 'supplier', format: 'text' },
        { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
        { header: 'الإجمالي', key: 'total', format: 'currency' },
        { header: 'المدفوع', key: 'paid', format: 'currency' },
        { header: 'الحالة', key: 'status', format: 'text' },
        { header: 'بواسطة', key: 'userName', format: 'text' },
      ],
      rows: filtered.map((o) => ({
        orderNo: o.orderNo || `#${o.id}`,
        date: new Date(o.createdAt).toLocaleString('ar-EG'),
        supplier: o.supplier?.name || '-',
        itemsCount: o.items.length,
        total: o.total,
        paid: o.paid,
        status: o.status,
        userName: o.userName || '-',
      })),
      totals: {
        orderNo: 'الإجمالي',
        total: filtered.reduce((s, o) => s + o.total, 0),
        paid: filtered.reduce((s, o) => s + o.paid, 0),
      },
    })
  }

  const chip =
    'h-8 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-cyan-600/10 hover:text-cyan-800 dark:hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40'

  return (
    <div className="space-y-5">
      {/* العنوان + الإجراءات */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">المشتريات</h1>
          <p className="text-sm text-muted-foreground">أوامر الشراء من الموردين، كاش أو آجل</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet className="size-4" />
            تصدير Excel
          </Button>
          <Button
            onClick={() => setNewOpen(true)}
            className="bg-cyan-700 text-white hover:bg-cyan-600 focus-visible:ring-cyan-600/40"
          >
            <Plus className="size-4" />
            أمر شراء جديد
          </Button>
        </div>
      </div>

      {/* اللوح الداكن: الأرقام + شريط الباركود */}
      <section className="overflow-hidden rounded-3xl bg-cyan-950 text-cyan-50 shadow-lg ring-1 ring-cyan-900">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="min-w-0">
            <p className="text-sm text-cyan-200/80">
              {day ? `مشتريات ${dayLabel(day)}` : 'إجمالي المشتريات'}
            </p>
            <p className="mt-1 text-5xl font-extrabold leading-none tracking-tight tabular-nums">
              {loading ? '…' : sumTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              <span className="ms-2 text-base font-semibold text-cyan-200/70">جنيه</span>
            </p>

            {/* مدفوع / آجل */}
            <div className="mt-6">
              <div
                className="flex h-2.5 overflow-hidden rounded-full bg-cyan-900"
                role="img"
                aria-label={`المدفوع ${Math.round(paidPct)}٪ من الإجمالي`}
              >
                <div className="bg-cyan-300 transition-[width] duration-500" style={{ width: `${paidPct}%` }} />
                <div className="flex-1 bg-[repeating-linear-gradient(-45deg,transparent_0_4px,rgba(251,191,36,.55)_4px_8px)]" />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <p>
                  <span className="text-cyan-200/70">مدفوع </span>
                  <b className="tabular-nums">{formatCurrency(sumPaid)}</b>
                </p>
                <p>
                  <span className="text-amber-300/90">آجل للموردين </span>
                  <b className="tabular-nums">{formatCurrency(sumDue)}</b>
                </p>
                <p>
                  <span className="text-cyan-200/70">الأوامر </span>
                  <b className="tabular-nums">{live.length}</b>
                </p>
              </div>
            </div>
          </div>

          {/* شريط الباركود اليومي */}
          <div className="min-w-0">
            <div className="flex items-center justify-between text-xs text-cyan-200/70">
              <span>{strip.length > 0 ? `آخر ${strip.length} يوم فيه مشتريات` : 'مفيش مشتريات في الفترة دي'}</span>
              {day && (
                <button
                  onClick={() => setDay(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-cyan-900 px-2.5 py-1 text-cyan-50 hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <X className="size-3" />
                  عرض كل الأيام
                </button>
              )}
            </div>
            <div className="mt-3 flex h-28 items-end gap-[3px] overflow-x-auto" role="group" aria-label="المشتريات اليومية">
              {strip.map(([k, v]) => {
                const active = day === k
                return (
                  <button
                    key={k}
                    onClick={() => setDay(active ? null : k)}
                    title={`${dayLabel(k)}: ${formatCurrency(v)}`}
                    aria-pressed={active}
                    className="group flex h-full min-w-[7px] flex-1 items-end focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        'block w-full rounded-[2px] transition-colors group-focus-visible:ring-2 group-focus-visible:ring-cyan-300',
                        active
                          ? 'bg-amber-300'
                          : day
                            ? 'bg-cyan-800 group-hover:bg-cyan-500'
                            : 'bg-cyan-300/90 group-hover:bg-white'
                      )}
                      style={{ height: `${Math.max(8, (v / stripMax) * 100)}%` }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* الفلاتر */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[230px]">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="رقم أمر الشراء"
            aria-label="بحث برقم أمر الشراء"
            className="pr-9"
          />
        </div>
        <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
        <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
        <Button variant="outline" onClick={() => applyRange(from, to)}>
          تصفية
        </Button>
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          <button className={chip} onClick={() => quick(0)}>اليوم</button>
          <button className={chip} onClick={() => quick(6)}>آخر 7 أيام</button>
          <button className={chip} onClick={() => quick('month')}>هذا الشهر</button>
          {(from || to) && (
            <button className={chip} onClick={() => applyRange('', '')}>
              مسح
            </button>
          )}
        </div>
      </div>

      {/* السجل مجمّع باليوم */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed py-14 text-center">
          <p className="font-semibold">مفيش أوامر شراء هنا</p>
          <p className="mt-1 text-sm text-muted-foreground">غيّر الفلتر أو سجّل أول أمر شراء.</p>
          <Button onClick={() => setNewOpen(true)} className="mt-4 bg-cyan-700 text-white hover:bg-cyan-600">
            <Plus className="size-4" />
            أمر شراء جديد
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([k, list]) => {
            const dayTotal = list.filter((o) => !isReturned(o)).reduce((s, o) => s + o.total, 0)
            return (
              <section key={k} className="relative ps-6">
                <span aria-hidden className="absolute inset-y-2 start-[7px] w-px bg-cyan-700/25" />
                <header className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-bold">{dayLabel(k)}</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">{formatCurrency(dayTotal)}</span>
                </header>

                <ul className="space-y-2">
                  {list.map((o) => {
                    const returned = isReturned(o)
                    const due = Math.max(0, o.total - o.paid)
                    const pct = o.total > 0 ? Math.min(100, (o.paid / o.total) * 100) : 100
                    const open = openId === o.id
                    const qty = o.items.reduce((s, it) => s + it.quantity, 0)
                    return (
                      <li key={o.id} className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            'absolute -start-[21px] top-6 size-3 rounded-full border-2 border-background',
                            returned ? 'bg-slate-400' : due > 0 ? 'bg-amber-500' : 'bg-cyan-600'
                          )}
                        />
                        <div className={cn('rounded-2xl border bg-card transition-shadow', open && 'shadow-md', returned && 'opacity-65')}>
                          <div className="flex items-stretch">
                            <button
                              onClick={() => setOpenId(open ? null : o.id)}
                              aria-expanded={open}
                              className="grid min-w-0 flex-1 gap-x-6 gap-y-3 rounded-2xl p-4 text-start focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                            >
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2">
                                  <b className="font-extrabold tabular-nums">{o.orderNo ?? `#${o.id}`}</b>
                                  {returned && (
                                    <span className="rounded-md bg-slate-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      مرتجعة
                                    </span>
                                  )}
                                </p>
                                <p className="mt-0.5 truncate text-sm">
                                  {o.supplier?.name ?? <span className="text-muted-foreground">بدون مورد</span>}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {timeLabel(o.createdAt)}
                                  {o.userName ? ` — ${o.userName}` : ''}
                                  {` — ${qty} قطعة`}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className={cn('text-lg font-extrabold tabular-nums', returned && 'line-through')}>
                                  {formatCurrency(o.total)}
                                </p>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-500/25">
                                  <div className="h-full rounded-full bg-cyan-600" style={{ width: `${pct}%` }} />
                                </div>
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                  {due > 0 && !returned ? (
                                    <>
                                      متبقي للمورد <b className="tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(due)}</b>
                                    </>
                                  ) : (
                                    'مدفوع بالكامل'
                                  )}
                                </p>
                              </div>
                            </button>

                            <div className="flex flex-col items-center justify-between gap-1 border-s px-2 py-3">
                              <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
                              {!returned && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setReturnId(o.id)}
                                  title="مرتجع للمورد"
                                  aria-label="مرتجع للمورد"
                                >
                                  <RotateCcw className="size-4" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {open && (
                            <div className="border-t bg-cyan-600/[0.04] px-4 py-3">
                              <ul className="divide-y divide-border/60 text-sm">
                                {o.items.map((it) => (
                                  <li key={it.id} className="flex items-baseline justify-between gap-3 py-1.5">
                                    <span className="min-w-0 truncate">
                                      {it.name}
                                      {!!it.returnedQty && (
                                        <span className="ms-2 text-xs text-destructive">مرتجع {it.returnedQty}</span>
                                      )}
                                    </span>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                      {it.quantity} × {formatCurrency(it.cost)}
                                    </span>
                                    <b className="w-28 shrink-0 text-end tabular-nums">{formatCurrency(it.quantity * it.cost)}</b>
                                  </li>
                                ))}
                              </ul>
                              {o.paymentMethod && (
                                <p className="mt-2 text-xs text-muted-foreground">طريقة الدفع: {o.paymentMethod}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <PurchaseReturnDialog
        open={returnId !== null}
        onOpenChange={(o) => {
          if (!o) setReturnId(null)
        }}
        order={returnOrder}
        hasSupplier={!!returnOrder?.supplier}
        onDone={() => load(from, to)}
      />

      <PurchaseOrderDialog open={newOpen} onOpenChange={setNewOpen} onSaved={() => load(from, to)} />
    </div>
  )
}
