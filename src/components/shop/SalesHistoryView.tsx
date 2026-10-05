'use client'

import * as React from 'react'
import {
  ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, FileDown, FileSpreadsheet,
  Filter, Layers, PackageCheck, Printer, ReceiptText, RotateCcw, Search, User, Users, Wallet, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  returnedQty?: number
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
  paymentMethod?: string | null
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

/* ───────────── للفلاتر: أنواع + ثوابت + حساب التسوية (متوافق مع sale-return.ts) ───────────── */

type Kind = 'settled' | 'partial' | 'unpaid'
type Period = 'all' | 'today' | '7' | 'month' | '90' | 'custom'
type SortKey = 'recent' | 'oldest' | 'value' | 'due'
interface Calc {
  qty: number; returnedQty: number; returnedValue: number; net: number; paidNet: number
  due: number; credit: number; kind: Kind; age: number; late: boolean; fully: boolean
}

const LATE_DAYS = 30
const NO_CUSTOMER = '__walkin'
const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي', vodafone_cash: 'فودافون كاش', instapay: 'انستاباي', fawry: 'فوري',
}
const methodLabel = (m?: string | null) => (m ? METHOD_LABELS[m] ?? m : null)
const SORT_LABELS: Record<SortKey, string> = {
  recent: 'الأحدث أولاً', oldest: 'الأقدم أولاً', value: 'الأكبر قيمة', due: 'الأكبر باقي',
}
const SORT_HINTS: Record<SortKey, string> = {
  recent: 'آخر فاتورة تظهر في الأول',
  oldest: 'الأقدم في الأول — مفيد لمتابعة القديم',
  value: 'الفواتير الكبيرة قبل الصغيرة (جوّه كل يوم)',
  due: 'اللي عليها باقي أكبر قبل غيرها (جوّه كل يوم)',
}
const PERIOD_LABELS: Record<Exclude<Period, 'custom'>, string> = {
  today: 'اليوم', '7': '٧ أيام', month: 'الشهر ده', '90': '٩٠ يوم', all: 'الكل',
}
const KIND_META: Record<Kind, { label: string; short: string; sub: string }> = {
  settled: { label: 'مدفوعة', short: 'مدفوعة', sub: 'صافيها بعد المرتجع' },
  partial: { label: 'عليها باقي', short: 'باقي', sub: 'باقي عليها' },
  unpaid: { label: 'آجلة بالكامل', short: 'آجلة', sub: 'باقي عليها' },
}

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
const daysBetween = (iso: string) => {
  const a = new Date(iso)
  const b = new Date()
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.max(0, Math.round((db - da) / 86400000))
}
const custKey = (s: Sale) => (s.customer ? String(s.customer.id) : NO_CUSTOMER)
const custLabel = (s: Sale) => s.customer?.name ?? 'عميل نقدي'

/** الإجمالي ثابت، المرتجع بيتخصم، والمسترد بيتخصم من المدفوع */
function calcSale(s: Sale): Calc {
  const qty = s.items.reduce((n, it) => n + it.quantity, 0)
  const returnedQty = s.items.reduce((n, it) => n + (it.returnedQty ?? 0), 0)
  const fully = s.status === 'مرتجعة' || (qty > 0 && returnedQty >= qty)
  const itemsRet = round2(s.items.reduce((n, it) => n + (it.returnedQty ?? 0) * it.price, 0))
  const returnedValue = fully ? s.total : Math.min(s.total, itemsRet)
  const net = Math.max(0, round2(s.total - returnedValue))
  const paidNet = Math.max(0, round2(s.paid - (s.refunded ?? 0)))
  const due = Math.max(0, round2(net - paidNet))
  const credit = Math.max(0, round2(paidNet - net))
  const kind: Kind = due <= 0.009 ? 'settled' : paidNet > 0.009 ? 'partial' : 'unpaid'
  const age = daysBetween(s.createdAt)
  return { qty, returnedQty, returnedValue, net, paidNet, due, credit, kind, age, late: due > 0.009 && age > LATE_DAYS, fully }
}

export function SalesHistoryView() {
  const [sales, setSales] = React.useState<Sale[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [period, setPeriod] = React.useState<Period>('all')
  const [status, setStatus] = React.useState<Kind | null>(null)
  const [customer, setCustomer] = React.useState<string | null>(null)
  const [method, setMethod] = React.useState<string | null>(null)
  const [by, setBy] = React.useState<string | null>(null)
  const [onlyReturned, setOnlyReturned] = React.useState(false)
  const [onlyLate, setOnlyLate] = React.useState(false)
  const [sort, setSort] = React.useState<SortKey>('recent')
  const [partialReturnSale, setPartialReturnSale] = React.useState<Sale | null>(null)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal] = React.useState(0)

  const searchRef = React.useRef<HTMLInputElement>(null)
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

  // اختصار "/" للبحث
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === '/' && t && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // الأزرار بتملأ التواريخ باقتراح مبدئي؛ الفلترة الفعلية بتوقيت *المحل* على السيرفر (tenantTime.ts)
  const choosePeriod = (p: Period) => {
    setPeriod(p)
    if (p === 'custom') return
    const end = new Date()
    const start = new Date()
    let f = ''
    let t = ''
    if (p === 'today') {
      f = t = getLocalDateStr(end)
    } else if (p === '7') {
      start.setDate(start.getDate() - 6)
      f = getLocalDateStr(start); t = getLocalDateStr(end)
    } else if (p === 'month') {
      start.setDate(1)
      f = getLocalDateStr(start); t = getLocalDateStr(end)
    } else if (p === '90') {
      start.setDate(start.getDate() - 89)
      f = getLocalDateStr(start); t = getLocalDateStr(end)
    }
    setFrom(f); setTo(t)
    load(f, t, 1)
  }
  const changeCustom = (f: string, t: string) => {
    setFrom(f); setTo(t)
    load(f, t, 1)
  }

  /* ───── الفلاتر ───── */

  const calcs = React.useMemo(() => {
    const m = new Map<number, Calc>()
    sales.forEach((s) => m.set(s.id, calcSale(s)))
    return m
  }, [sales])

  // خيارات القوائم — كل خيار معاه عدد الفواتير + معلومة تفيد في القرار
  const customerOpts = React.useMemo<PickOption[]>(() => {
    const m = new Map<string, { label: string; n: number; due: number }>()
    sales.forEach((s) => {
      const k = custKey(s)
      const e = m.get(k) ?? { label: custLabel(s), n: 0, due: 0 }
      e.n += 1
      e.due += calcs.get(s.id)!.due
      m.set(k, e)
    })
    return [...m.entries()]
      .sort((a, b) => b[1].due - a[1].due || b[1].n - a[1].n)
      .map(([k, e]) => ({
        value: k,
        label: e.label,
        count: e.n,
        walkIn: k === NO_CUSTOMER,
        hint: e.due > 0 ? `باقي عليه ${formatCurrency(e.due)}` : 'مفيش باقي',
        tone: (e.due > 0 ? 'due' : 'muted') as 'due' | 'muted',
      }))
  }, [sales, calcs])
  const methodOpts = React.useMemo<PickOption[]>(() => {
    const m = new Map<string, { n: number; paid: number }>()
    sales.forEach((s) => {
      if (!s.paymentMethod) return
      const e = m.get(s.paymentMethod) ?? { n: 0, paid: 0 }
      e.n += 1
      e.paid += calcs.get(s.id)!.paidNet
      m.set(s.paymentMethod, e)
    })
    return [...m.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, e]) => ({ value: k, label: methodLabel(k) ?? k, count: e.n, hint: `محصّل ${formatCurrency(e.paid)}`, tone: 'muted' as const }))
  }, [sales, calcs])
  const userOpts = React.useMemo<PickOption[]>(() => {
    const m = new Map<string, { n: number; net: number }>()
    sales.forEach((s) => {
      if (!s.userName) return
      const e = m.get(s.userName) ?? { n: 0, net: 0 }
      e.n += 1
      e.net += calcs.get(s.id)!.net
      m.set(s.userName, e)
    })
    return [...m.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, e]) => ({ value: k, label: k, count: e.n, hint: `صافي ${formatCurrency(e.net)}`, tone: 'muted' as const }))
  }, [sales, calcs])

  // كل الفلاتر ما عدا حالة التسوية (علشان أرقام الشريط تفضل ثابتة)
  const base = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return sales.filter((s) => {
      const c = calcs.get(s.id)!
      if (q) {
        const hay = [invNo(s), String(s.id), s.customer?.name, s.customer?.phone, ...s.items.map((i) => i.name)]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (customer && custKey(s) !== customer) return false
      if (method && s.paymentMethod !== method) return false
      if (by && s.userName !== by) return false
      if (onlyReturned && c.returnedQty <= 0 && !c.fully) return false
      if (onlyLate && !c.late) return false
      return true
    })
  }, [sales, calcs, query, customer, method, by, onlyReturned, onlyLate])

  const filtered = React.useMemo(
    () => (status ? base.filter((s) => calcs.get(s.id)!.kind === status) : base),
    [base, calcs, status]
  )

  const segs = React.useMemo(() => {
    const r = {
      settled: { n: 0, amount: 0, net: 0 },
      partial: { n: 0, amount: 0, net: 0 },
      unpaid: { n: 0, amount: 0, net: 0 },
    }
    base.forEach((s) => {
      const c = calcs.get(s.id)!
      const g = r[c.kind]
      g.n += 1
      g.net += c.net
      g.amount += c.kind === 'settled' ? c.net : c.due
    })
    return r
  }, [base, calcs])

  const sorter = React.useCallback(
    (a: Sale, b: Sale) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      if (sort === 'oldest') return ta - tb
      if (sort === 'value') return b.total - a.total || tb - ta
      if (sort === 'due') return calcs.get(b.id)!.due - calcs.get(a.id)!.due || tb - ta
      return tb - ta
    },
    [sort, calcs]
  )


  const activeFilters =
    (status ? 1 : 0) + (customer ? 1 : 0) + (method ? 1 : 0) + (by ? 1 : 0) +
    (onlyReturned ? 1 : 0) + (onlyLate ? 1 : 0) + (query.trim() ? 1 : 0)
  const clearAll = () => {
    setQuery(''); setStatus(null); setCustomer(null); setMethod(null); setBy(null)
    setOnlyReturned(false); setOnlyLate(false)
  }
  const pageScoped = totalPages > 1 && (activeFilters > 0 || sort !== 'recent')


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

  /* ترتيب القايمة: الأيام حسب التاريخ، والفواتير جوّه اليوم حسب «ترتيب» */
  const listDays = React.useMemo(() => {
    const arr = days
      .map((d) => ({ ...d, list: [...d.list].sort(sorter) }))
      .sort((a, b) => b.key.localeCompare(a.key))
    return sort === 'oldest' ? arr.reverse() : arr
  }, [days, sorter, sort])

  const flat = React.useMemo(() => listDays.flatMap((d) => d.list), [listDays])
  const selected = flat.find((s) => s.id === selectedId) ?? flat[0] ?? null

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
          <div className="flex w-full min-w-[230px] items-center gap-3 border-b border-dashed p-4 sm:w-auto sm:border-b-0 sm:border-e">
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

          {/* 📱 على الجوال: عمودين بس (صافي + محصّل) — «لسه مستحق» بيختفي.
              من sm وفوق: ٣ أعمدة كاملة زي الأصل. */}
          <dl className="grid min-w-0 flex-1 basis-full grid-cols-2 divide-x divide-dashed divide-border rtl:divide-x-reverse sm:basis-auto sm:grid-cols-3">
            <Figure label="صافي المبيعات" value={net} mark />
            <Figure label="المحصّل" value={collected} />
            <Figure
              label="لسه مستحق"
              value={outstanding}
              danger={outstanding > 0}
              className="hidden sm:flex"
            />
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

      {/* ═════════ لوحة الفلاتر ═════════ */}
      <section className="space-y-3.5 rounded-2xl border bg-card p-3.5 shadow-sm" aria-label="فلاتر المبيعات">
        {/* بحث + ترتيب + تجميع + تصدير */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex h-10 min-w-[240px] flex-1 items-center rounded-xl border bg-background transition-shadow focus-within:border-yellow-400 focus-within:ring-[3px] focus-within:ring-yellow-300/40">
            <Search className="pointer-events-none absolute start-3.5 size-4 text-foreground/60" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث برقم الفاتورة أو اسم العميل أو رقمه أو اسم صنف…"
              aria-label="بحث في المبيعات"
              className="h-full w-full bg-transparent pe-10 text-sm outline-none placeholder:text-muted-foreground/80"
              style={{ paddingInlineStart: '2.75rem' }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="مسح البحث"
                className="absolute end-2.5 flex size-6 items-center justify-center rounded-full text-foreground/60 hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute end-3 hidden rounded-md border bg-muted px-1.5 text-[11px] text-foreground/60 sm:block">/</kbd>
            )}
          </label>

          <Picker
            align="end"
            title="ترتيب السجل"
            subtitle="الترتيب جوّه كل مجموعة"
            icon={ArrowUpDown}
            options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: SORT_LABELS[k], hint: SORT_HINTS[k], tone: 'muted' as const }))}
            selected={sort}
            onSelect={(v) => v && setSort(v as SortKey)}
            plain
            trigger={(open) => (
              <button
                type="button"
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-3.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-300/50',
                  open && 'border-yellow-400 ring-[3px] ring-yellow-300/40'
                )}
              >
                <ArrowUpDown className="size-4 text-foreground/70" />
                <span className="text-foreground/65">ترتيب:</span>
                <span className="font-bold">{SORT_LABELS[sort]}</span>
                <ChevronDown className={cn('size-4 text-foreground/60 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
              </button>
            )}
          />

          <Button variant="outline" className="h-10 rounded-xl" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
        </div>

        {/* الفترة */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-bold text-foreground/65">الفترة</span>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted/60 p-1" role="group" aria-label="الفترة">
            {([...(['today', '7', 'month', '90', 'all'] as const), 'custom'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => choosePeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-300/50',
                  period === p ? 'bg-zinc-900 text-yellow-300 shadow-sm dark:bg-yellow-300 dark:text-zinc-900' : 'text-foreground/65 hover:bg-background hover:text-foreground'
                )}
              >
                {p === 'custom' ? 'فترة محددة' : PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex max-w-full flex-wrap items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs">
              <span className="text-foreground/65">من</span>
              <input
                type="date" value={from} max={to || undefined} aria-label="من تاريخ"
                onChange={(e) => changeCustom(e.target.value, to)}
                className="bg-transparent py-1 text-xs font-bold tabular-nums outline-none"
              />
              <span className="text-foreground/65">إلى</span>
              <input
                type="date" value={to} min={from || undefined} aria-label="إلى تاريخ"
                onChange={(e) => changeCustom(from, e.target.value)}
                className="bg-transparent py-1 text-xs font-bold tabular-nums outline-none"
              />
            </div>
          )}
        </div>

        {/* شريط التسوية — فلتر وعرض في نفس الوقت */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-foreground/65">
            <PackageCheck className="size-3.5" />
            حالة التحصيل — الشريط يوضّح نصيب كل حالة من القيمة
          </p>
          <SettlementBar segs={segs} status={status} onPick={(k) => setStatus(status === k ? null : k)} />
        </div>

        {/* تضييق */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="flex items-center gap-1 text-[11px] font-bold text-foreground/65">
            <Filter className="size-3.5" />
            تضييق
          </span>
          <Facet
            icon={Users} label="العميل" title="اختر العميل" subtitle="مرتّبين بالأكتر باقياً عليه"
            options={customerOpts} selected={customer} onPick={setCustomer}
            allLabel="كل العملاء" allCount={sales.length}
            searchable={customerOpts.length > 5} searchPlaceholder="ابحث باسم العميل…"
          />
          <Facet
            icon={Wallet} label="طريقة الدفع" title="طريقة الدفع" subtitle="الفواتير اللي اتدفع فيها حاجة"
            options={methodOpts} selected={method} onPick={setMethod}
            allLabel="كل الطرق" allCount={methodOpts.reduce((n, o) => n + (o.count ?? 0), 0)}
          />
          {userOpts.length > 1 && (
            <Facet
              icon={User} label="الكاشير" title="مين سجّل الفاتورة" subtitle="حسب الموظف"
              options={userOpts} selected={by} onPick={setBy}
              allLabel="كل الموظفين" allCount={userOpts.reduce((n, o) => n + (o.count ?? 0), 0)}
            />
          )}
          <TogglePill active={onlyReturned} onClick={() => setOnlyReturned((v) => !v)} icon={RotateCcw}>فيها مرتجع</TogglePill>
          <TogglePill active={onlyLate} onClick={() => setOnlyLate((v) => !v)} icon={Clock} tone="late">متأخرة +{LATE_DAYS} يوم</TogglePill>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-foreground/65 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              مسح الفلاتر ({activeFilters})
            </button>
          )}
        </div>
      </section>

      {pageScoped && (
        <p className="rounded-xl border border-yellow-400/40 bg-yellow-300/15 px-4 py-2.5 text-xs font-medium text-foreground/80">
          البحث والفلاتر والترتيب بيشتغلوا على الـ {num(sales.length)} فاتورة المعروضة (صفحة {page} من {totalPages}). حدّد فترة أضيق عشان تشوف النتايج كاملة بدقة.
        </p>
      )}

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
                {hasRange || activeFilters > 0 ? 'جرّب فترة أوسع أو شيل بعض الفلاتر.' : 'أول فاتورة بيع هتظهر هنا.'}
              </p>
              {(hasRange || activeFilters > 0) && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { clearAll(); choosePeriod('all') }}>
                  عرض كل الفواتير
                </Button>
              )}
            </div>
          ) : (
            listDays.map((d) => (
              <section key={d.key} id={`day-${d.key}`} className="scroll-mt-2">
                <header className="sticky top-0 z-10 -mx-1 mb-2.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 bg-background/95 px-1 pb-2 pt-1.5 backdrop-blur">
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
                          <span className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-3 sm:px-4">
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
                          <span className="flex flex-col items-end justify-center px-3 py-3 sm:px-4">
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
            <nav className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-xl border bg-card px-3 py-2">
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
/* بيقبل className عشان نقدر نخفيه على الجوال من غير ما نغيّر هيكله */
function Figure({
  label, value, mark, danger, className,
}: {
  label: string
  value: number
  mark?: boolean
  danger?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center px-2.5 py-3 sm:px-4', className)}>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 flex flex-wrap items-baseline gap-x-1.5 text-base font-extrabold tabular-nums leading-tight sm:text-2xl', danger && 'text-destructive')}>
        <span className={cn(mark && 'bg-gradient-to-t from-yellow-300/80 from-35% to-transparent to-35% px-0.5')}>
          {money(value)}
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground sm:text-xs">جنيه</span>
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
  // 📱 الموبايل/التابلت: الإيصال بيتفتح تحت كعب الفاتورة — لو طالع تحت الفيوبورت
  // منزّلشه بهدوء عشان يظهر كامل (على الديسكتوب اللوحة الجانبية ثابتة فمفيش حاجة تتعمل)
  const rootRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (window.matchMedia('(min-width:1280px)').matches) return
    const t = window.setTimeout(() => {
      const el = rootRef.current
      if (el && el.getBoundingClientRect().bottom > window.innerHeight + 4) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 120)
    return () => window.clearTimeout(t)
  }, [])
  // فاتورة جملة (٣٠–٥٠ صنف): بحث جوّه الإيصال + عدّاد، والقايمة بتتمرّر لوحدها
  const [itemQ, setItemQ] = React.useState('')
  const bigInvoice = s.items.length > 8
  const needle = itemQ.trim().toLowerCase()
  const shownItems = needle ? s.items.filter((it) => it.name.toLowerCase().includes(needle)) : s.items

  return (
    <div ref={rootRef} className="animate-in-up scroll-mt-12">
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

        <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
          <span>{s.items.length} صنف</span>
          <span className="tabular-nums">{qtyOf(s)} قطعة</span>
        </div>
        {bigInvoice && (
          <label className="relative mt-2 flex h-8 items-center rounded-lg border border-zinc-300 bg-white/70 focus-within:border-yellow-500 focus-within:ring-[3px] focus-within:ring-yellow-300/40 dark:border-zinc-700 dark:bg-zinc-800/60">
            <Search className="pointer-events-none absolute start-2.5 size-3.5 text-zinc-500" aria-hidden />
            <input
              value={itemQ}
              onChange={(e) => setItemQ(e.target.value)}
              placeholder="دوّر في الأصناف…"
              aria-label="بحث في أصناف الفاتورة"
              className="h-full w-full bg-transparent pe-2 text-xs outline-none placeholder:text-zinc-500"
              style={{ paddingInlineStart: '2rem' }}
            />
          </label>
        )}
        <ul className={cn('mt-2 max-h-[260px] space-y-2 overflow-y-auto pe-1', ret && 'opacity-60')}>
          {shownItems.length === 0 && (
            <li className="py-4 text-center text-xs text-zinc-500">مفيش صنف بالاسم ده</li>
          )}
          {shownItems.map((it) => {
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

/* ───────── شريط التسوية: حجم كل جزء = نصيبه من القيمة، وبالضغط يتحوّل لفلتر ───────── */
function SettlementBar({
  segs, status, onPick,
}: {
  segs: Record<Kind, { n: number; amount: number; net: number }>
  status: Kind | null
  onPick: (k: Kind) => void
}) {
  const kinds: Kind[] = ['settled', 'partial', 'unpaid']
  const totalNet = kinds.reduce((n, k) => n + segs[k].net, 0)
  const cnt = kinds.reduce((n, k) => n + segs[k].n, 0)
  const share = (k: Kind) => (totalNet > 0 ? segs[k].net / totalNet : cnt > 0 ? segs[k].n / cnt : 0)

  const tone: Record<Kind, { fill: string; dot: string; on: string; text: string }> = {
    settled: { fill: 'bg-success', dot: 'bg-success', on: 'border-success bg-success/10', text: 'text-success' },
    partial: { fill: 'bg-yellow-400', dot: 'bg-yellow-400', on: 'border-yellow-500 bg-yellow-400/15', text: 'text-yellow-800 dark:text-yellow-300' },
    unpaid: {
      fill: 'bg-[repeating-linear-gradient(-45deg,#ef4444_0_5px,#fca5a5_5px_10px)]',
      dot: 'bg-[repeating-linear-gradient(-45deg,#ef4444_0_3px,#fca5a5_3px_6px)]',
      on: 'border-destructive bg-destructive/10',
      text: 'text-destructive',
    },
  }

  return (
    <div>
      {/* الشريط البصري بيفضل يعرض الـ ٣ شرائح — النِسب مش بتتأثر */}
      <div className="mb-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {kinds.map((k) =>
          segs[k].n > 0 ? (
            <span
              key={k}
              className={cn('h-full transition-[flex-grow,opacity] duration-500 motion-reduce:transition-none', tone[k].fill, status && status !== k && 'opacity-25')}
              style={{ flexGrow: Math.max(0.02, share(k)), flexBasis: 0 }}
            />
          ) : null
        )}
      </div>

      {/* 📱 على الجوال: عمودين بس (مدفوعة + عليها باقي) — «آجلة بالكامل» بتختفي.
          من sm وفوق: ٣ أعمدة كاملة زي الأصل. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="فلتر حالة التحصيل">
        {kinds.map((k) => {
          const g = segs[k]
          const on = status === k
          const pct = Math.round(share(k) * 100)
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              aria-pressed={on}
              disabled={g.n === 0 && !on}
              className={cn(
                'rounded-xl border bg-background p-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-300/50 disabled:cursor-not-allowed disabled:opacity-45 sm:p-2.5',
                // «آجلة بالكامل» بتختفي على الجوال بس
                k === 'unpaid' && 'hidden sm:block',
                on ? tone[k].on : 'hover:bg-muted/50'
              )}
            >
              <span className="flex items-center justify-between gap-1 sm:gap-2">
                <span className={cn('flex min-w-0 items-center gap-1 text-[11px] font-bold sm:gap-1.5 sm:text-xs', on && tone[k].text)}>
                  <span aria-hidden className={cn('size-2 shrink-0 rounded-full sm:size-2.5', tone[k].dot)} />
                  <span className="truncate">
                    <span className="sm:hidden">{KIND_META[k].short}</span>
                    <span className="hidden sm:inline">{KIND_META[k].label}</span>
                  </span>
                </span>
                <span className="rounded-full bg-muted px-1 text-[10px] font-extrabold tabular-nums sm:px-1.5 sm:text-[11px]">{g.n}</span>
              </span>
              <span className="mt-1 block truncate text-base font-extrabold tabular-nums sm:text-lg">{g.n === 0 ? '—' : num(g.amount)}</span>
              <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-foreground/60">
                <span className="truncate">{g.n === 0 ? 'مفيش' : KIND_META[k].sub}</span>
                {g.n > 0 && pct > 0 && <span className="shrink-0 tabular-nums">{pct}٪</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────── قوائم الاختيار (Popover) ───────────────────────── */

interface PickOption {
  value: string
  label: string
  count?: number
  hint?: string
  tone?: 'due' | 'muted'
  walkIn?: boolean
}

/** قائمة اختيار بتصميم الصفحة: رأس فحمي + بحث اختياري + صفوف فيها معلومة */
function Picker({
  trigger, title, subtitle, icon: Icon, options, selected, onSelect, allLabel, allCount,
  searchable, searchPlaceholder, plain, align = 'start',
}: {
  trigger: (open: boolean) => React.ReactNode
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  options: PickOption[]
  selected: string | null
  onSelect: (v: string | null) => void
  allLabel?: string
  allCount?: number
  searchable?: boolean
  searchPlaceholder?: string
  /** من غير أفاتار (زي قايمة الترتيب) */
  plain?: boolean
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const needle = q.trim().toLowerCase()
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  const hasAll = !!allLabel
  const pick = (v: string | null) => { onSelect(v); setOpen(false); setQ('') }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ('') }}>
      <PopoverTrigger asChild>{trigger(open)}</PopoverTrigger>
      <PopoverContent align={align} sideOffset={8} className="w-[min(21rem,92vw)] overflow-hidden rounded-2xl p-0 shadow-2xl">
        <div className="flex items-center gap-3 bg-zinc-900 px-4 py-3 text-zinc-50">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-yellow-300 text-zinc-900">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{title}</p>
            {subtitle && <p className="truncate text-[11px] font-medium text-zinc-300">{subtitle}</p>}
          </div>
        </div>

        {searchable && (
          <div className="border-b bg-muted/30 p-2.5">
            <label className="relative flex h-9 items-center rounded-lg border bg-background focus-within:border-yellow-400 focus-within:ring-[3px] focus-within:ring-yellow-300/40">
              <Search className="pointer-events-none absolute start-3 size-3.5 text-foreground/60" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder ?? 'بحث…'}
                aria-label={searchPlaceholder ?? 'بحث'}
                className="h-full w-full bg-transparent pe-3 text-sm outline-none placeholder:text-muted-foreground/80"
                style={{ paddingInlineStart: '2.25rem' }}
              />
            </label>
          </div>
        )}

        <div role="listbox" className="max-h-72 space-y-0.5 overflow-y-auto p-1.5">
          {hasAll && !needle && (
            <PickRow on={selected === null} onClick={() => pick(null)} lead={<Layers className="size-4" />} label={allLabel!} count={allCount} />
          )}
          {shown.map((o) => (
            <PickRow
              key={o.value}
              on={selected === o.value}
              onClick={() => pick(hasAll && selected === o.value ? null : o.value)}
              lead={o.walkIn ? <User className="size-4" /> : <span className="text-sm font-extrabold">{o.label.trim().charAt(0)}</span>}
              label={o.label}
              count={o.count}
              hint={o.hint}
              tone={o.tone}
              plain={plain}
            />
          ))}
          {shown.length === 0 && <p className="px-3 py-8 text-center text-sm text-foreground/65">مفيش نتايج بالاسم ده</p>}
        </div>

        {hasAll && selected !== null && (
          <div className="border-t bg-muted/30 p-1.5">
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-bold text-foreground/65 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-300/50"
            >
              <X className="size-3.5" />
              مسح الاختيار
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function PickRow({
  on, onClick, lead, label, count, hint, tone, plain,
}: {
  on: boolean
  onClick: () => void
  lead: React.ReactNode
  label: string
  count?: number
  hint?: string
  tone?: 'due' | 'muted'
  plain?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-300/50',
        on ? 'bg-yellow-300/25' : 'hover:bg-muted/70 focus-visible:bg-muted/70'
      )}
    >
      {!plain && (
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors', on ? 'bg-yellow-300 text-zinc-900' : 'bg-yellow-300/25 text-yellow-900 dark:text-yellow-200')}>
          {lead}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', on ? 'font-extrabold' : 'font-semibold')}>{label}</span>
        {hint && (
          <span className={cn('block truncate text-[11px] tabular-nums', tone === 'due' ? 'font-bold text-destructive' : 'font-medium text-foreground/60')}>
            {hint}
          </span>
        )}
      </span>
      {count !== undefined && (
        <span className="shrink-0 rounded-full bg-muted px-2 text-[11px] font-extrabold tabular-nums text-foreground/65">{count}</span>
      )}
      <span aria-hidden className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors', on ? 'border-zinc-900 bg-zinc-900 text-yellow-300' : 'border-transparent text-transparent')}>
        <Check className="size-3" />
      </span>
    </button>
  )
}

function Facet({
  icon: Icon, label, title, subtitle, options, selected, onPick, allLabel, allCount, searchable, searchPlaceholder,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  title: string
  subtitle?: string
  options: PickOption[]
  selected: string | null
  onPick: (v: string | null) => void
  allLabel: string
  allCount?: number
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const current = selected ? options.find((o) => o.value === selected) : null
  const active = !!selected
  return (
    <span
      className={cn(
        'inline-flex h-8 max-w-[240px] items-center rounded-full border text-xs font-bold transition-colors',
        active ? 'border-yellow-500 bg-yellow-300/25 text-foreground' : 'bg-background text-foreground/65 hover:bg-muted hover:text-foreground'
      )}
    >
      <Picker
        title={title} subtitle={subtitle} icon={Icon} options={options} selected={selected} onSelect={onPick}
        allLabel={allLabel} allCount={allCount} searchable={searchable} searchPlaceholder={searchPlaceholder}
        trigger={(open) => (
          <button
            type="button"
            disabled={options.length === 0}
            className={cn(
              'inline-flex h-full min-w-0 items-center gap-1.5 rounded-full ps-3 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-300/50 disabled:opacity-45',
              active ? 'pe-1.5' : 'pe-3',
              open && 'text-foreground'
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{current ? `${label}: ${current.label}` : label}</span>
            <ChevronDown className={cn('size-3.5 shrink-0 opacity-60 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
          </button>
        )}
      />
      {active && (
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label={`مسح فلتر ${label}`}
          className="me-1 ms-0.5 flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-yellow-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

function TogglePill({
  active, onClick, icon: Icon, tone, children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  tone?: 'late'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-300/50',
        active
          ? tone === 'late'
            ? 'border-destructive bg-destructive/10 text-destructive'
            : 'border-yellow-500 bg-yellow-300/25 text-foreground'
          : 'bg-background text-foreground/65 hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}