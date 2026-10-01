'use client'

import * as React from 'react'
import {
  Check, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Printer, ReceiptText,
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
/** رقم بدون كلمة «جنيه» — الوحدة بتتعرض صغيرة وخفيفة جنبه */
const money = (n: number) => formatCurrency(n).replace(/\s*جنيه$/, '')
/** INV-2026-00011 → السيريال الكبير (00011) + البادئة الصغيرة (INV-2026) زي دفاتر الفواتير */
const splitNo = (s: Sale) => {
  const m = invNo(s).match(/^(.*?)(\d+)$/)
  return m ? { prefix: m[1].replace(/-$/, ''), serial: m[2] } : { prefix: '', serial: invNo(s) }
}
const preview = (s: Sale) => {
  const names = s.items.map((i) => i.name)
  return names.slice(0, 2).join('، ') + (names.length > 2 ? ` +${names.length - 2}` : '')
}

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
            <div className="hidden w-56 items-end justify-center gap-2 border-s border-dashed px-5 py-3 xl:flex">
              {[...days].reverse().slice(-10).map((d) => (
                <button
                  key={d.key}
                  type="button"
                  title={`${formatArabicDate(new Date(`${d.key}T12:00:00`))} — ${formatCurrency(d.sum)}`}
                  onClick={() => document.getElementById(`day-${d.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="group flex max-w-[20px] flex-1 flex-col items-center gap-1"
                >
                  <span
                    className={cn('w-full rounded-t-[3px] transition', d.sum === maxDay ? 'bg-yellow-400' : 'bg-yellow-300/60 group-hover:bg-yellow-300')}
                    style={{ height: `${Math.max(6, (d.sum / maxDay) * 36)}px` }}
                  />
                  <span className="text-[9px] font-medium tabular-nums text-muted-foreground">{Number(d.key.slice(8))}</span>
                </button>
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
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="@container space-y-5">
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
              <section key={d.key} id={`day-${d.key}`} className="scroll-mt-2">
                <header className="sticky top-0 z-10 -mx-1 mb-2.5 flex items-baseline justify-between bg-background/95 px-1 pb-2 pt-1.5 backdrop-blur">
                  <h2 className="text-[15px] font-extrabold">{formatArabicDate(new Date(`${d.key}T12:00:00`))}</h2>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {d.list.length} فاتورة <span className="mx-1 opacity-40">|</span>
                    <b className="text-sm font-extrabold text-foreground">{money(d.sum)}</b> جنيه
                  </span>
                  <span aria-hidden className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-border">
                    <span className="block h-full rounded-full bg-yellow-400" style={{ width: `${(d.sum / maxDay) * 100}%` }} />
                  </span>
                </header>

                <ul className="space-y-2">
                  {d.list.map((s) => {
                    const ret = isReturned(s)
                    const active = selected?.id === s.id
                    const open = selectedId === s.id
                    const no = splitNo(s)
                    const named = !!s.customer
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => setSelectedId(open && !window.matchMedia('(min-width:1280px)').matches ? null : s.id)}
                          aria-pressed={active}
                          style={ret ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in oklab, currentColor 5%, transparent) 7px 8px)' } : undefined}
                          className={cn(
                            'group relative grid min-h-[84px] w-full overflow-hidden rounded-xl border bg-card text-start transition-all',
                            'grid-cols-[104px_minmax(0,1fr)_auto] @xl:grid-cols-[112px_minmax(0,1fr)_170px_136px]',
                            'hover:-translate-y-px hover:border-yellow-400/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/60',
                            active && 'border-yellow-400 shadow-[0_8px_24px_-12px_rgb(250_204_21/0.7)]',
                            ret && 'text-muted-foreground'
                          )}
                        >
                          {/* ① الكعب: الوقت + السيريال الكبير، بثقبين زي التذكرة */}
                          <span
                            className={cn(
                              'relative flex flex-col items-center justify-center gap-0.5 border-e border-dashed px-2 py-3 transition-colors',
                              active ? 'border-zinc-900/30 bg-yellow-300 text-zinc-900' : 'bg-muted/50'
                            )}
                          >
                            <i aria-hidden className="absolute -end-[7px] -top-[7px] size-3.5 rounded-full border bg-background" />
                            <i aria-hidden className="absolute -bottom-[7px] -end-[7px] size-3.5 rounded-full border bg-background" />
                            <span className="text-[11px] font-medium tabular-nums opacity-70">{timeOf(s.createdAt)}</span>
                            <span dir="ltr" className="text-xl font-extrabold leading-none tracking-tight tabular-nums">{no.serial}</span>
                            {no.prefix && <span dir="ltr" className="text-[10px] font-medium tracking-wider opacity-60">{no.prefix}</span>}
                          </span>

                          {/* ② العميل + اللي اتباع */}
                          <span className="flex min-w-0 flex-col justify-center gap-0.5 px-4 py-3">
                            <span
                              className={cn(
                                'truncate text-[15px] leading-snug',
                                named ? 'font-bold text-foreground' : 'font-medium text-muted-foreground',
                                ret && 'line-through decoration-destructive/50'
                              )}
                            >
                              {s.customer?.name ?? 'عميل نقدي'}
                            </span>
                            <span className="truncate text-[12.5px] text-foreground/70">{preview(s)}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span>{qtyOf(s)} قطعة</span>
                              {s.userName && (<><span className="size-[3px] rounded-full bg-current opacity-50" /><span>{s.userName}</span></>)}
                              <span className="ms-auto @xl:hidden"><StatusChip sale={s} /></span>
                            </span>
                          </span>

                          {/* ③ الدفع: الطبيعي هادي، والاستثناء (باقي/مرتجع) هو اللي يلفت النظر */}
                          <span className="hidden flex-col justify-center gap-1.5 px-2 py-3 @xl:flex">
                            <StatusChip sale={s} />
                            {!ret && s.total > s.paid && s.total > 0 && (
                              <>
                                <span className="h-1 w-full overflow-hidden rounded-full bg-destructive/15">
                                  <span className="block h-full rounded-full bg-yellow-400" style={{ width: `${Math.min(100, Math.round((s.paid / s.total) * 100))}%` }} />
                                </span>
                                <span className="text-[10.5px] tabular-nums text-muted-foreground">اتدفع {Math.min(100, Math.round((s.paid / s.total) * 100))}%</span>
                              </>
                            )}
                          </span>

                          {/* ④ الإجمالي */}
                          <span className="flex flex-col items-end justify-center px-4 py-3">
                            <span className={cn('text-xl font-extrabold leading-none tabular-nums', ret && 'line-through decoration-1')}>{money(s.total)}</span>
                            <span className="mt-1 text-[11px] font-medium text-muted-foreground">جنيه</span>
                          </span>
                        </button>

                        {/* موبايل/تابلت: الإيصال يفتح تحت الكعب */}
                        {open && (
                          <div className="mt-2 xl:hidden">
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
        <aside className="sticky top-4 hidden xl:block">
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

/* ───────── حالة الدفع: المدفوع هادي، والاستثناء ملوّن ───────── */
function StatusChip({ sale: s }: { sale: Sale }) {
  const pill = 'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold'
  if (isReturned(s))
    return <span className={cn(pill, 'bg-destructive-subtle text-destructive-subtle-foreground')}><RotateCcw className="size-3" /> مرتجعة</span>
  if (s.total - s.paid > 0)
    return <span className={cn(pill, 'bg-destructive-subtle text-destructive-subtle-foreground tabular-nums')}>باقي {formatCurrency(s.total - s.paid)}</span>
  if ((s.refunded ?? 0) > 0)
    return <span className={cn(pill, 'bg-warning-subtle text-warning-subtle-foreground')}>مرتجع جزئي</span>
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground">
      <Check className="size-3.5 text-success" /> مدفوعة
    </span>
  )
}

/* ───────── رقم في الشريط العلوي (الماركر الأصفر تحت صافي المبيعات) ───────── */
function Figure({ label, value, mark, danger }: { label: string; value: number; mark?: boolean; danger?: boolean }) {
  return (
    <div className="flex flex-col justify-center px-4 py-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-xl font-extrabold tabular-nums leading-none sm:text-2xl', danger && 'text-destructive')}>
        <span className={cn(mark && 'bg-gradient-to-t from-yellow-300/80 from-35% to-transparent to-35% px-0.5')}>
          {money(value)}
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
          <div className="mt-2 flex items-baseline justify-center gap-1.5">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">فاتورة</span>
            <span dir="ltr" className="text-2xl font-black leading-none tabular-nums">{splitNo(s).serial}</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {splitNo(s).prefix && <span dir="ltr" className="inline-block">{splitNo(s).prefix}</span>}{splitNo(s).prefix && ' · '}{formatArabicDate(d)} · {timeOf(s.createdAt)}
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
