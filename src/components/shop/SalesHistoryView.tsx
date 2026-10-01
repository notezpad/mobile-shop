'use client'

import * as React from 'react'
import {
  ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Printer, ReceiptText,
  RotateCcw, Search, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatArabicDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { printSale, exportSalePdf } from '@/lib/print-client'
import { useShopStore } from '@/lib/store'
import { SaleReturnDialog } from './SaleReturnDialog'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { getLocalDateStr } from '@/lib/dateUtils'
import { useDataRefresh } from '@/lib/offline/data-events'

/* ════════════════════════════════════════════════════════════════════
   سجل المبيعات — هوية «دفتر الفواتير الكربون»
   حبر رمادي فحمي + أصفر ماركر (النسخة الصفراء من الدفتر).
   القايمة = كعوب الفواتير مجمّعة باليوم، واللوحة الجانبية = الإيصال نفسه.
   ألوان الحالة (نجاح/خطر) من توكنز النظام، والذهبي للهوية فقط.
   ════════════════════════════════════════════════════════════════════ */

interface SaleItem {
  id: number
  name: string
  price: number
  quantity: number
  cost: number
  unitLabel?: string | null
  unitQuantity?: number | null
}
interface Sale {
  id: number
  invoiceNo: string | null
  total: number
  paid: number
  status: string
  createdAt: string
  userName?: string | null
  refunded?: number
  customer: ({ id: number; name: string; phone?: string | null }) | null
  items: SaleItem[]
}

const PAGE_SIZE = 50
const isReturned = (s: Sale) => s.status === 'مرتجعة'
const invNo = (s: Sale) => s.invoiceNo ?? `#${s.id}`
const qtyOf = (s: Sale) => s.items.reduce((n, it) => n + it.quantity, 0)

const timeOf = (iso: string) =>
  new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace('AM', 'ص')
    .replace('PM', 'م')

/** بنفس تحويل الـ POS: السعر/الكمية مخزنين بالقطعة، فلو اتباع بوحدة جملة نعرض الوحدة وسعرها الكامل */
function displayLine(it: SaleItem) {
  const hasUnit = it.unitQuantity != null && it.unitQuantity > 0
  const qty = hasUnit ? it.unitQuantity! : it.quantity
  const price = hasUnit ? (it.price * it.quantity) / it.unitQuantity! : it.price
  return { qty, price, unit: it.unitLabel ?? null }
}

export function SalesHistoryView() {
  const [sales, setSales] = React.useState<Sale[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [preset, setPreset] = React.useState<'today' | 'week' | 'month' | ''>('')
  const [partialReturnSale, setPartialReturnSale] = React.useState<Sale | null>(null)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal] = React.useState(0)

  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async (f?: string, t?: string, p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f) params.set('from', f)
      if (t) params.set('to', t)
      params.set('page', String(p))
      params.set('limit', String(PAGE_SIZE))
      const res = await api<{ data: Sale[]; total: number; totalPages: number }>(`/api/sales?${params.toString()}`)
      setSales(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(p)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المبيعات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🛡️ تحديث لحظي — راجع data-events.ts
  useDataRefresh(['sales'], () => load(from, to, page))

  const applyRange = (f: string, t: string, p: typeof preset = '') => {
    setFrom(f); setTo(t); setPreset(p)
    load(f, t, 1)
  }
  // الأزرار بتملأ التواريخ باقتراح مبدئي؛ الفلترة الفعلية بتوقيت *المحل* على السيرفر (tenantTime.ts)
  const quickToday = () => { const d = getLocalDateStr(new Date()); applyRange(d, d, 'today') }
  const quickWeek = () => {
    const s = new Date(); s.setDate(s.getDate() - 6)
    applyRange(getLocalDateStr(s), getLocalDateStr(new Date()), 'week')
  }
  const quickMonth = () => {
    const n = new Date()
    applyRange(getLocalDateStr(new Date(n.getFullYear(), n.getMonth(), 1)), getLocalDateStr(n), 'month')
  }

  const q = query.trim()
  const filtered = q
    ? sales.filter((s) => invNo(s).includes(q) || (s.customer?.name ?? '').includes(q))
    : sales

  /* ── ملخص المعروض (المرتجع بالكامل ما بيدخلش الإجماليات — M12) ── */
  const live = filtered.filter((s) => !isReturned(s))
  const net = live.reduce((n, s) => n + s.total, 0)
  const collected = live.reduce((n, s) => n + s.paid, 0)
  const outstanding = live.reduce((n, s) => n + Math.max(s.total - s.paid, 0), 0)

  /* ── تجميع باليوم ── */
  const days = React.useMemo(() => {
    const map = new Map<string, { key: string; list: Sale[]; sum: number }>()
    for (const s of filtered) {
      const key = getLocalDateStr(new Date(s.createdAt))
      const g = map.get(key) ?? { key, list: [], sum: 0 }
      g.list.push(s)
      if (!isReturned(s)) g.sum += s.total
      map.set(key, g)
    }
    return Array.from(map.values())
  }, [filtered])
  const maxDay = Math.max(1, ...days.map((d) => d.sum))

  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null

  /* ── طباعة / PDF / Excel ── */
  const toPrintable = (s: Sale) => ({
    id: s.id, invoiceNo: s.invoiceNo, total: s.total, paid: s.paid, status: s.status, createdAt: s.createdAt,
    items: s.items.map((it) => {
      const l = displayLine(it)
      return { name: it.name + (l.unit ? ` (${l.qty} ${l.unit})` : ''), price: l.price, quantity: l.qty }
    }),
    customer: s.customer ? { name: s.customer.name, phone: s.customer.phone } : null,
  })
  const shopInfo = {
    name: shopName,
    phone: shopBranding.phone || undefined,
    address: shopBranding.address || undefined,
    logo: shopBranding.logoPath || undefined,
    invoicePrefix: shopBranding.invoicePrefix,
  }
  const reprint = (s: Sale) => printSale(toPrintable(s), shopInfo)
  const exportPdf = (s: Sale) => exportSalePdf(toPrintable(s), shopInfo)

  const exportExcel = () => {
    if (filtered.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('سجل-المبيعات'),
      shop: { name: shopName, phone: shopBranding.phone || undefined, address: shopBranding.address || undefined },
      documentTitle: 'سجل المبيعات',
      sheetName: 'الفواتير',
      columns: [
        { header: 'رقم الفاتورة', key: 'invoiceNo', format: 'text' },
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'العميل', key: 'customer', format: 'text' },
        { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
        { header: 'الإجمالي', key: 'total', format: 'currency' },
        { header: 'المدفوع', key: 'paid', format: 'currency' },
        { header: 'الحالة', key: 'status', format: 'text' },
        { header: 'الكاشير', key: 'userName', format: 'text' },
      ],
      rows: filtered.map((s) => ({
        invoiceNo: invNo(s),
        date: new Date(s.createdAt).toLocaleString('ar-EG'),
        customer: s.customer?.name || 'عميل نقدي',
        itemsCount: s.items.length,
        total: s.total,
        paid: s.paid,
        status: s.status,
        userName: s.userName || '-',
      })),
      totals: { invoiceNo: 'الإجمالي', total: net, paid: collected },
    })
  }

  const hasRange = !!(from || to)

  return (
    <div className="space-y-4">
      {/* ═════════ الشريط العلوي: عنوان + أرقام المعروض + أعمدة الأيام ═════════ */}
      <section className="animate-in-up overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-stretch">
          <div className="flex min-w-[230px] items-center gap-3 border-b border-dashed p-4 sm:border-b-0 sm:border-e">
            <span className="flex size-10 items-center justify-center rounded-lg bg-yellow-300 text-zinc-900 shadow-sm dark:bg-yellow-300/90">
              <ReceiptText className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold leading-tight">سجل المبيعات</h1>
              <p className="text-[11px] text-muted-foreground">
                {loading ? 'جارٍ التحميل…' : `${total} فاتورة${hasRange ? ' في الفترة' : ''}`}
              </p>
            </div>
          </div>

          <dl className="grid flex-1 grid-cols-3 divide-x divide-dashed divide-border rtl:divide-x-reverse">
            <Figure label="صافي المبيعات" value={net} mark />
            <Figure label="المحصّل" value={collected} />
            <Figure label="لسه مستحق" value={outstanding} danger={outstanding > 0} />
          </dl>

          {days.length > 1 && (
            <div className="hidden w-44 items-end gap-1 border-s border-dashed p-4 xl:flex" aria-hidden>
              {[...days].reverse().slice(-14).map((d) => (
                <span
                  key={d.key}
                  title={`${formatArabicDate(new Date(`${d.key}T12:00:00`))} — ${formatCurrency(d.sum)}`}
                  className="flex-1 rounded-t-sm bg-yellow-300/80 dark:bg-yellow-300/60"
                  style={{ height: `${Math.max(8, (d.sum / maxDay) * 52)}px` }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═════════ شريط الفلاتر ═════════ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="رقم الفاتورة أو اسم العميل"
            className="h-9 w-full rounded-lg border bg-background pe-9 ps-3 text-sm outline-none transition focus-visible:border-yellow-400 focus-visible:ring-2 focus-visible:ring-yellow-300/50"
          />
        </div>

        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
          {([['today', 'اليوم', quickToday], ['week', '7 أيام', quickWeek], ['month', 'الشهر', quickMonth]] as const).map(
            ([k, label, fn]) => (
              <button
                key={k}
                onClick={fn}
                className={cn(
                  'rounded-md px-3 py-1.5 transition',
                  preset === k ? 'bg-yellow-300 text-zinc-900 shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="date" value={from} aria-label="من تاريخ"
            onChange={(e) => { setFrom(e.target.value); setPreset('') }}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/50"
          />
          <span>إلى</span>
          <input
            type="date" value={to} aria-label="إلى تاريخ"
            onChange={(e) => { setTo(e.target.value); setPreset('') }}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/50"
          />
          <Button variant="outline" size="sm" className="h-9" onClick={() => load(from, to)}>تصفية</Button>
          {hasRange && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => applyRange('', '')}>
              <X className="size-3.5" /> مسح
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" className="ms-auto h-9" onClick={exportExcel} disabled={filtered.length === 0}>
          <FileSpreadsheet className="size-4" /> تصدير Excel
        </Button>
      </div>

      {/* ═════════ الدفتر: كعوب الفواتير + الإيصال ═════════ */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
              <ReceiptText className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">مفيش فواتير في النتيجة دي</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasRange || q ? 'جرّب فترة أوسع أو امسح البحث.' : 'أول فاتورة بيع هتظهر هنا.'}
              </p>
              {(hasRange || q) && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setQuery(''); applyRange('', '') }}>
                  عرض كل الفواتير
                </Button>
              )}
            </div>
          ) : (
            days.map((d) => (
              <section key={d.key}>
                <header className="sticky top-0 z-10 -mx-1 mb-2 flex items-baseline justify-between bg-background/90 px-1 py-1.5 backdrop-blur">
                  <h2 className="text-sm font-bold">{formatArabicDate(new Date(`${d.key}T12:00:00`))}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {d.list.length} فاتورة · <b className="font-semibold text-foreground">{formatCurrency(d.sum)}</b>
                  </span>
                </header>

                <ul className="space-y-2">
                  {d.list.map((s) => {
                    const due = s.total - s.paid
                    const ret = isReturned(s)
                    const active = selected?.id === s.id
                    const open = selectedId === s.id
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => setSelectedId(open && !window.matchMedia('(min-width:1024px)').matches ? null : s.id)}
                          aria-pressed={active}
                          className={cn(
                            'group relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 overflow-hidden rounded-xl border bg-card py-3 ps-5 pe-4 text-start transition',
                            'hover:border-yellow-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/60',
                            active && 'border-yellow-400 bg-yellow-50/60 shadow-sm dark:bg-yellow-300/[0.06]',
                            ret && 'opacity-70'
                          )}
                        >
                          {/* كعب الدفتر: شريط ذهبي على الجنب + ثقبين */}
                          <span aria-hidden className={cn('absolute inset-y-0 start-0 w-1.5 transition', active ? 'bg-yellow-300' : 'bg-border group-hover:bg-yellow-300/60')} />

                          <span className="text-center leading-tight">
                            <span className="block text-[11px] text-muted-foreground tabular-nums">{timeOf(s.createdAt)}</span>
                            <span className="block text-sm font-bold tabular-nums">{invNo(s)}</span>
                          </span>

                          <span className="min-w-0">
                            <span className={cn('block truncate text-sm font-semibold', ret && 'line-through decoration-destructive/60')}>
                              {s.customer?.name ?? 'عميل نقدي'}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                              <span>{qtyOf(s)} قطعة</span>
                              {s.userName && <span>· {s.userName}</span>}
                              {ret ? (
                                <span className="font-semibold text-destructive">مرتجعة</span>
                              ) : due > 0 ? (
                                <span className="font-semibold text-destructive">باقي {formatCurrency(due)}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-success">
                                  <span className="size-1.5 rounded-full bg-success" /> مدفوعة
                                </span>
                              )}
                            </span>
                          </span>

                          <span className="text-end">
                            <span className="block text-base font-extrabold tabular-nums">{formatCurrency(s.total)}</span>
                          </span>
                        </button>

                        {/* موبايل/تابلت: الإيصال يفتح تحت الكعب */}
                        {open && (
                          <div className="mt-2 lg:hidden">
                            <Receipt
                              sale={s} shopName={shopName}
                              onPrint={() => reprint(s)} onPdf={() => exportPdf(s)} onReturn={() => setPartialReturnSale(s)}
                            />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}

          {/* ترقيم الصفحات */}
          {!loading && totalPages > 1 && (
            <nav className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
              <p className="text-xs text-muted-foreground">صفحة {page} من {totalPages} — {total} فاتورة</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => load(from, to, page - 1)} aria-label="السابقة">
                  <ChevronRight className="size-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const span = Math.min(5, totalPages)
                  const start = Math.max(1, Math.min(page - Math.floor(span / 2), totalPages - span + 1))
                  return start + i
                }).map((p) => (
                  <button
                    key={p}
                    onClick={() => load(from, to, p)}
                    className={cn(
                      'size-8 rounded-lg text-xs font-semibold tabular-nums transition',
                      p === page ? 'bg-yellow-300 text-zinc-900' : 'border hover:bg-muted'
                    )}
                  >
                    {p}
                  </button>
                ))}
                <Button variant="outline" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => load(from, to, page + 1)} aria-label="التالية">
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </nav>
          )}
        </div>

        {/* لوحة الإيصال — ديسكتوب فقط، ثابتة أثناء التمرير */}
        <aside className="sticky top-4 hidden lg:block">
          {selected && !loading ? (
            <Receipt
              key={selected.id}
              sale={selected} shopName={shopName}
              onPrint={() => reprint(selected)} onPdf={() => exportPdf(selected)} onReturn={() => setPartialReturnSale(selected)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              اختار فاتورة من القايمة عشان تشوف إيصالها
            </div>
          )}
        </aside>
      </div>

      {partialReturnSale && (
        <SaleReturnDialog
          open
          onOpenChange={(o) => !o && setPartialReturnSale(null)}
          sale={{
            id: partialReturnSale.id,
            invoiceNo: partialReturnSale.invoiceNo,
            customerId: partialReturnSale.customer?.id ?? null,
            customerName: partialReturnSale.customer?.name ?? null,
            paid: partialReturnSale.paid,
            refunded: partialReturnSale.refunded ?? 0,
            paymentMethod: (partialReturnSale as any).paymentMethod ?? null,
          }}
          items={partialReturnSale.items.map((it) => ({
            id: it.id,
            productId: (it as any).productId ?? null,
            name: it.name + (it.unitLabel ? ` (${it.unitQuantity}× ${it.unitLabel})` : ''),
            price: it.price,
            quantity: it.quantity,
            returnedQty: (it as any).returnedQty ?? 0,
          }))}
          onDone={() => load(from, to, page)}
        />
      )}
    </div>
  )
}

/* ───────── رقم في الشريط العلوي (الماركر الأصفر تحت صافي المبيعات) ───────── */
function Figure({ label, value, mark, danger }: { label: string; value: number; mark?: boolean; danger?: boolean }) {
  return (
    <div className="flex flex-col justify-center px-4 py-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-xl font-extrabold tabular-nums leading-none sm:text-2xl', danger && 'text-destructive')}>
        <span className={cn(mark && 'bg-gradient-to-t from-yellow-300/80 from-35% to-transparent to-35% px-0.5')}>
          {formatCurrency(value).replace(' جنيه', '')}
        </span>
        <span className="ms-1 text-xs font-semibold text-muted-foreground">جنيه</span>
      </dd>
    </div>
  )
}

/* ───────── الإيصال: ورقة بحافة ممزقة + ختم المرتجع + أزرار الإجراءات ───────── */
function Receipt({
  sale: s, shopName, onPrint, onPdf, onReturn,
}: {
  sale: Sale
  shopName: string
  onPrint: () => void
  onPdf: () => void
  onReturn: () => void
}) {
  const ret = isReturned(s)
  const due = s.total - s.paid
  const d = new Date(s.createdAt)

  return (
    <div className="animate-in-up">
      <div
        className="relative bg-yellow-50 px-5 pb-8 pt-5 text-zinc-900 shadow-md dark:bg-zinc-900 dark:text-zinc-100"
        style={{
          WebkitMask: 'conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/14px 100%',
          mask: 'conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/14px 100%',
          borderTop: '4px solid rgb(253 224 71)',
        }}
      >
        <div className="text-center">
          <p className="text-sm font-extrabold">{shopName}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            فاتورة {invNo(s)} · {formatArabicDate(d)} · {timeOf(s.createdAt)}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-y border-dashed border-zinc-300 py-2 text-xs dark:border-zinc-700">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">العميل</span>
            <p className="font-semibold">{s.customer?.name ?? 'عميل نقدي'}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">البائع</span>
            <p className="font-semibold">{s.userName ?? '—'}</p>
          </div>
        </div>

        <ul className={cn('mt-3 max-h-[260px] space-y-2 overflow-y-auto pe-1', ret && 'opacity-60')}>
          {s.items.map((it) => {
            const l = displayLine(it)
            return (
              <li key={it.id} className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.name}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {l.qty}{l.unit ? ` ${l.unit}` : ''} × {formatCurrency(l.price)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatCurrency(l.price * l.qty)}</span>
              </li>
            )
          })}
        </ul>

        <dl className="mt-3 space-y-1 border-t border-dashed border-zinc-300 pt-3 text-sm dark:border-zinc-700">
          <div className="flex justify-between text-base font-extrabold">
            <dt>الإجمالي</dt>
            <dd className="tabular-nums"><span className="bg-gradient-to-t from-yellow-300/80 from-35% to-transparent to-35%">{formatCurrency(s.total)}</span></dd>
          </div>
          <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
            <dt>المدفوع</dt><dd className="tabular-nums">{formatCurrency(s.paid)}</dd>
          </div>
          {!ret && due !== 0 && (
            <div className="flex justify-between font-semibold text-destructive">
              <dt>الباقي</dt><dd className="tabular-nums">{formatCurrency(due)}</dd>
            </div>
          )}
          {(s.refunded ?? 0) > 0 && (
            <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
              <dt>اتردّ للعميل</dt><dd className="tabular-nums">{formatCurrency(s.refunded!)}</dd>
            </div>
          )}
        </dl>

        {ret && (
          <span
            aria-label="فاتورة مرتجعة"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-md border-4 border-destructive px-4 py-1 text-2xl font-black text-destructive/80"
          >
            مرتجعة
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button className="flex-1 bg-yellow-300 text-zinc-900 hover:bg-yellow-400" onClick={onPrint}>
          <Printer className="size-4" /> طباعة
        </Button>
        <Button variant="outline" onClick={onPdf} aria-label="حفظ PDF" title="حفظ PDF">
          <FileDown className="size-4" />
        </Button>
        {!ret && (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={onReturn}
            title="مرتجع (جزئي أو كلي)"
          >
            <RotateCcw className="size-4" /> مرتجع
          </Button>
        )}
      </div>
    </div>
  )
}
