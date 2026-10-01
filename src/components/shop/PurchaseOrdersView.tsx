'use client'

/**
 * المشتريات — "دفتر الاستلام".
 * الهوية: بترول/سماوي غامق + كربون، والكهرماني للمتبقي للموردين فقط (مفيش بنفسجي).
 *
 * أفكار الصفحة:
 *  1) شريط الحساب: إجمالي ← مرتجع ← صافي ← مدفوع ← المتبقي (كل رقم مرة واحدة بس).
 *  2) فلتر "شريط التسوية": الأوامر مقسومة مسدّدة / عليها باقي / آجلة، عرض كل جزء بيمثّل حجمه.
 *  3) كل أمر شراء "إيصال استلام" فيه مقياس تسوية (مدفوع | مرتجع | متبقي) وتفاصيل كاملة.
 *  4) تجميع حسب اليوم أو المورد أو من غير تجميع.
 *
 * المحاسبة (متوافقة مع purchase-return.ts): الإجمالي بيفضل زي ما هو،
 *   صافي الأمر = الإجمالي − قيمة المرتجع،  المتبقي = الصافي − (المدفوع − المسترد).
 */

import * as React from 'react'
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  FileSpreadsheet,
  Filter,
  Layers,
  PackageCheck,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Truck,
  User,
  Wallet,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatArabicDateTime, formatCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PurchaseOrderDialog } from './PurchaseOrderDialog'
import { PurchaseReturnDialog } from './PurchaseReturnDialog'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

/* ───────────────────────── الأنواع ───────────────────────── */

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

type Kind = 'settled' | 'partial' | 'unpaid'
type Period = 'all' | 'today' | '7' | 'month' | '90' | 'custom'
type GroupBy = 'day' | 'supplier' | 'none'
type SortKey = 'recent' | 'oldest' | 'value' | 'due'

interface Calc {
  qty: number
  returnedQty: number
  returnedValue: number
  net: number
  paidNet: number
  due: number
  credit: number
  kind: Kind
  age: number
  late: boolean
  fully: boolean
}

/* ───────────────────────── ثوابت ───────────────────────── */

const LATE_DAYS = 30
const NO_SUPPLIER = '__none'
const FETCH_CAP = 500

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  vodafone_cash: 'فودافون كاش',
  instapay: 'انستاباي',
  fawry: 'فوري',
}
const methodLabel = (m?: string | null) => (m ? METHOD_LABELS[m] ?? m : null)

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'الأحدث أولاً',
  oldest: 'الأقدم أولاً',
  value: 'الأكبر قيمة',
  due: 'الأكبر متبقي',
}
const GROUP_LABELS: Record<GroupBy, string> = {
  day: 'يوم',
  supplier: 'مورد',
  none: 'بدون',
}
const PERIOD_LABELS: Record<Exclude<Period, 'custom'>, string> = {
  today: 'اليوم',
  '7': '٧ أيام',
  month: 'الشهر ده',
  '90': '٩٠ يوم',
  all: 'الأحدث',
}

const KIND_META: Record<Kind, { label: string; short: string; sub: string }> = {
  settled: { label: 'مسدّدة', short: 'مسدّدة', sub: 'صافي مسدّد' },
  partial: { label: 'عليها باقي', short: 'عليها باقي', sub: 'متبقي' },
  unpaid: { label: 'آجلة بالكامل', short: 'آجلة', sub: 'متبقي' },
}

/* ───────────────────────── دوال مساعدة ───────────────────────── */

const toISODate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

const daysBetween = (iso: string) => {
  const a = new Date(iso)
  const b = new Date()
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.max(0, Math.round((db - da) / 86400000))
}

const ageLabel = (d: number) => (d === 0 ? 'النهارده' : d === 1 ? 'إمبارح' : `من ${d} يوم`)

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })

const dayTitle = (key: string) => {
  const d = new Date(`${key}T12:00:00`)
  const base = d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
  const diff = daysBetween(`${key}T12:00:00`)
  return diff === 0 ? `اليوم — ${base}` : diff === 1 ? `إمبارح — ${base}` : base
}

function calcOrder(o: PurchaseOrder): Calc {
  const qty = o.items.reduce((s, it) => s + it.quantity, 0)
  const returnedQty = o.items.reduce((s, it) => s + (it.returnedQty ?? 0), 0)
  const returnedValue = round2(o.items.reduce((s, it) => s + (it.returnedQty ?? 0) * it.cost, 0))
  const net = Math.max(0, round2(o.total - returnedValue))
  const paidNet = Math.max(0, round2(o.paid - (o.refunded ?? 0)))
  const due = Math.max(0, round2(net - paidNet))
  const credit = Math.max(0, round2(paidNet - net))
  const kind: Kind = due <= 0.009 ? 'settled' : paidNet > 0.009 ? 'partial' : 'unpaid'
  const age = daysBetween(o.createdAt)
  return {
    qty,
    returnedQty,
    returnedValue,
    net,
    paidNet,
    due,
    credit,
    kind,
    age,
    late: due > 0.009 && age > LATE_DAYS,
    fully: o.status === 'مرتجعة' || (qty > 0 && returnedQty >= qty),
  }
}

const supplierKey = (o: PurchaseOrder) => o.supplier?.name ?? NO_SUPPLIER

/* ───────────────────────── المكوّن الرئيسي ───────────────────────── */

export function PurchaseOrdersView() {
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([])
  const [loading, setLoading] = React.useState(true)

  // الفترة (بتتحمّل من السيرفر)
  const [period, setPeriod] = React.useState<Period>('all')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  // فلاتر على القائمة المحمّلة
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<Kind | null>(null)
  const [supplier, setSupplier] = React.useState<string | null>(null)
  const [method, setMethod] = React.useState<string | null>(null)
  const [by, setBy] = React.useState<string | null>(null)
  const [onlyReturned, setOnlyReturned] = React.useState(false)
  const [onlyLate, setOnlyLate] = React.useState(false)

  // العرض
  const [sort, setSort] = React.useState<SortKey>('recent')
  const [groupBy, setGroupBy] = React.useState<GroupBy>('day')
  const [openId, setOpenId] = React.useState<number | null>(null)
  const [returnId, setReturnId] = React.useState<number | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)

  const searchRef = React.useRef<HTMLInputElement>(null)
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
    load('', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDataRefresh(['purchase-orders'], () => load(from, to))

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

  const choosePeriod = (p: Period) => {
    setPeriod(p)
    if (p === 'custom') return
    const end = new Date()
    const start = new Date()
    let f = ''
    let t = ''
    if (p === 'today') {
      f = t = toISODate(end)
    } else if (p === '7') {
      start.setDate(start.getDate() - 6)
      f = toISODate(start)
      t = toISODate(end)
    } else if (p === 'month') {
      start.setDate(1)
      f = toISODate(start)
      t = toISODate(end)
    } else if (p === '90') {
      start.setDate(start.getDate() - 89)
      f = toISODate(start)
      t = toISODate(end)
    }
    setFrom(f)
    setTo(t)
    load(f, t)
  }
  const changeCustom = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    load(f, t)
  }

  /* ───── البيانات المشتقة ───── */

  const calcs = React.useMemo(() => {
    const m = new Map<number, Calc>()
    orders.forEach((o) => m.set(o.id, calcOrder(o)))
    return m
  }, [orders])
  const C = (o: PurchaseOrder) => calcs.get(o.id)!

  const suppliers = React.useMemo(() => {
    const m = new Map<string, number>()
    orders.forEach((o) => m.set(supplierKey(o), (m.get(supplierKey(o)) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [orders])
  const methods = React.useMemo(() => {
    const m = new Map<string, number>()
    orders.forEach((o) => o.paymentMethod && m.set(o.paymentMethod, (m.get(o.paymentMethod) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [orders])
  const users = React.useMemo(() => {
    const m = new Map<string, number>()
    orders.forEach((o) => o.userName && m.set(o.userName, (m.get(o.userName) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [orders])

  // كل الفلاتر ما عدا حالة التسوية (علشان أرقام الشريط تفضل ثابتة)
  const base = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      const c = calcs.get(o.id)!
      if (q) {
        const hay = [o.orderNo ?? `#${o.id}`, String(o.id), o.supplier?.name, o.supplier?.phone, ...o.items.map((i) => i.name)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (supplier && supplierKey(o) !== supplier) return false
      if (method && o.paymentMethod !== method) return false
      if (by && o.userName !== by) return false
      if (onlyReturned && c.returnedQty <= 0) return false
      if (onlyLate && !c.late) return false
      return true
    })
  }, [orders, calcs, query, supplier, method, by, onlyReturned, onlyLate])

  const filtered = React.useMemo(
    () => (status ? base.filter((o) => calcs.get(o.id)!.kind === status) : base),
    [base, calcs, status]
  )

  const segs = React.useMemo(() => {
    const r = {
      settled: { n: 0, amount: 0, net: 0 },
      partial: { n: 0, amount: 0, net: 0 },
      unpaid: { n: 0, amount: 0, net: 0 },
    }
    base.forEach((o) => {
      const c = calcs.get(o.id)!
      const s = r[c.kind]
      s.n += 1
      s.net += c.net
      s.amount += c.kind === 'settled' ? c.net : c.due
    })
    return r
  }, [base, calcs])

  const sums = React.useMemo(() => {
    let gross = 0, returned = 0, paidNet = 0, due = 0, lateDue = 0, credit = 0
    filtered.forEach((o) => {
      const c = calcs.get(o.id)!
      gross += o.total
      returned += c.returnedValue
      paidNet += c.paidNet
      due += c.due
      credit += c.credit
      if (c.late) lateDue += c.due
    })
    const net = Math.max(0, gross - returned)
    return { gross, returned, net, paidNet, due, lateDue, credit }
  }, [filtered, calcs])

  const sorter = React.useCallback(
    (a: PurchaseOrder, b: PurchaseOrder) => {
      const ca = calcs.get(a.id)!
      const cb = calcs.get(b.id)!
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      if (sort === 'oldest') return ta - tb
      if (sort === 'value') return b.total - a.total || tb - ta
      if (sort === 'due') return cb.due - ca.due || tb - ta
      return tb - ta
    },
    [sort, calcs]
  )

  const groups = React.useMemo(() => {
    const sorted = [...filtered].sort(sorter)
    if (groupBy === 'none') return [{ key: 'all', title: '', list: sorted }]
    const m = new Map<string, PurchaseOrder[]>()
    sorted.forEach((o) => {
      const k = groupBy === 'day' ? toISODate(new Date(o.createdAt)) : supplierKey(o)
      m.set(k, [...(m.get(k) ?? []), o])
    })
    const arr = [...m.entries()].map(([key, list]) => ({
      key,
      title: groupBy === 'day' ? dayTitle(key) : key === NO_SUPPLIER ? 'بدون مورد' : key,
      list,
    }))
    if (groupBy === 'day') {
      arr.sort((a, b) => (sort === 'oldest' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)))
    } else {
      const dueOf = (l: PurchaseOrder[]) => l.reduce((s, o) => s + calcs.get(o.id)!.due, 0)
      const totOf = (l: PurchaseOrder[]) => l.reduce((s, o) => s + o.total, 0)
      arr.sort((a, b) => dueOf(b.list) - dueOf(a.list) || totOf(b.list) - totOf(a.list))
    }
    return arr
  }, [filtered, sorter, groupBy, sort, calcs])

  const activeFilters =
    (status ? 1 : 0) + (supplier ? 1 : 0) + (method ? 1 : 0) + (by ? 1 : 0) + (onlyReturned ? 1 : 0) + (onlyLate ? 1 : 0) + (query.trim() ? 1 : 0)
  const clearAll = () => {
    setQuery('')
    setStatus(null)
    setSupplier(null)
    setMethod(null)
    setBy(null)
    setOnlyReturned(false)
    setOnlyLate(false)
  }

  const returnOrder = returnId !== null ? orders.find((o) => o.id === returnId) ?? null : null
  const capped = period === 'all' && orders.length >= FETCH_CAP

  const exportExcel = () => {
    if (filtered.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('سجل-المشتريات'),
      shop: { name: shopName, phone: shopBranding.phone || undefined, address: shopBranding.address || undefined },
      documentTitle: 'سجل أوامر الشراء',
      sheetName: 'أوامر الشراء',
      columns: [
        { header: 'رقم الأمر', key: 'orderNo', format: 'text' },
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'المورد', key: 'supplier', format: 'text' },
        { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
        { header: 'الإجمالي', key: 'total', format: 'currency' },
        { header: 'المرتجع', key: 'returned', format: 'currency' },
        { header: 'المدفوع', key: 'paid', format: 'currency' },
        { header: 'المتبقي', key: 'due', format: 'currency' },
        { header: 'طريقة الدفع', key: 'method', format: 'text' },
        { header: 'الحالة', key: 'status', format: 'text' },
        { header: 'بواسطة', key: 'userName', format: 'text' },
      ],
      rows: filtered.map((o) => {
        const c = C(o)
        return {
          orderNo: o.orderNo || `#${o.id}`,
          date: formatArabicDateTime(o.createdAt),
          supplier: o.supplier?.name || '-',
          itemsCount: o.items.length,
          total: o.total,
          returned: c.returnedValue,
          paid: c.paidNet,
          due: c.due,
          method: methodLabel(o.paymentMethod) || '-',
          status: o.status,
          userName: o.userName || '-',
        }
      }),
      totals: {
        orderNo: 'الإجمالي',
        total: sums.gross,
        returned: sums.returned,
        paid: sums.paidNet,
        due: sums.due,
      },
    })
  }

  const paidPct = sums.net > 0 ? Math.min(100, (sums.paidNet / sums.net) * 100) : sums.gross > 0 ? 100 : 0

  /* ───────────────────────── الواجهة ───────────────────────── */

  return (
    <div className="space-y-5">
      {/* العنوان */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">المشتريات</h1>
          <p className="text-sm text-muted-foreground">دفتر استلام البضاعة من الموردين — إيه دخل، ودفعت كام، ولسه عليك كام</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet className="size-4" />
            تصدير Excel
          </Button>
          <Button onClick={() => setNewOpen(true)} className="bg-cyan-700 text-white hover:bg-cyan-600 focus-visible:ring-cyan-600/40">
            <Plus className="size-4" />
            أمر شراء جديد
          </Button>
        </div>
      </div>

      {/* ═════════ شريط الحساب ═════════ */}
      <section className="overflow-hidden rounded-3xl bg-cyan-950 text-cyan-50 shadow-lg ring-1 ring-cyan-900">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* المتبقي — الرقم اللي يهمّك */}
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm text-cyan-200/80">
              <Wallet className="size-4 text-amber-300" aria-hidden />
              متبقي للموردين {query || activeFilters ? 'في النتائج الحالية' : 'في الفترة دي'}
            </p>
            <p className="mt-2 text-5xl font-extrabold leading-none tracking-tight text-amber-300 tabular-nums sm:text-6xl">
              {loading ? '…' : num(sums.due)}
              <span className="ms-2 text-base font-semibold text-cyan-200/70">جنيه</span>
            </p>

            <div className="mt-6">
              <div
                className="flex h-3 overflow-hidden rounded-full bg-cyan-900"
                role="img"
                aria-label={`اتسدّد ${Math.round(paidPct)}٪ من صافي المشتريات`}
              >
                <div className="bg-cyan-300 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${paidPct}%` }} />
                <div className="flex-1 bg-[repeating-linear-gradient(-45deg,transparent_0_4px,rgba(251,191,36,.6)_4px_8px)]" />
              </div>
              <p className="mt-2.5 text-xs text-cyan-200/75">
                اتسدّد <b className="tabular-nums text-cyan-50">{Math.round(paidPct)}٪</b> من صافي المشتريات
                {sums.credit > 0 && (
                  <>
                    {' — '}ودفعت زيادة <b className="tabular-nums text-cyan-50">{formatCurrency(sums.credit)}</b> عند موردين
                  </>
                )}
              </p>
              {sums.lateDue > 0 && (
                <button
                  onClick={() => setOnlyLate(true)}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 ring-1 ring-rose-400/30 transition-colors hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  <Clock className="size-3.5" />
                  منها <span className="tabular-nums">{formatCurrency(sums.lateDue)}</span> عدّى عليها +{LATE_DAYS} يوم — اعرضها
                </button>
              )}
            </div>
          </div>

          {/* إيصال الحساب */}
          <div className="min-w-0 rounded-2xl border border-dashed border-cyan-700/70 bg-cyan-900/40 p-4 sm:p-5">
            <p className="mb-3 text-xs font-semibold tracking-wide text-cyan-200/70">كشف الحساب · {num(filtered.length)} أمر</p>
            <ul className="space-y-2.5 text-sm">
              <Leader label="فواتير الشراء" value={formatCurrency(sums.gross)} />
              <Leader label="− مرتجع للموردين" value={sums.returned > 0 ? formatCurrency(sums.returned) : '—'} dim={sums.returned === 0} />
              <Leader label="= صافي المشتريات" value={formatCurrency(sums.net)} strong />
              <Leader label="− اللي اتدفع" value={formatCurrency(sums.paidNet)} />
            </ul>
            <p className="mt-3 border-t border-dotted border-cyan-700/70 pt-2.5 text-[11px] text-cyan-200/60">
              الصافي − المدفوع = المتبقي للموردين
            </p>
          </div>
        </div>
      </section>

      {/* ═════════ لوحة الفلاتر ═════════ */}
      <section className="space-y-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5" aria-label="فلاتر المشتريات">
        {/* بحث + ترتيب + تجميع */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex h-11 min-w-[240px] flex-1 items-center rounded-2xl border bg-background transition-shadow focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25">
            <Search className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث برقم الأمر أو اسم المورد أو رقمه أو اسم صنف…"
              aria-label="بحث في المشتريات"
              className="h-full w-full bg-transparent pe-10 text-sm outline-none placeholder:text-muted-foreground/80"
              style={{ paddingInlineStart: '2.75rem' }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="مسح البحث"
                className="absolute left-2.5 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute left-3 hidden rounded-md border bg-muted px-1.5 text-[11px] text-muted-foreground sm:block">/</kbd>
            )}
          </label>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 rounded-2xl">
                <ArrowUpDown className="size-4" />
                <span className="text-muted-foreground">ترتيب:</span>
                <span className="font-semibold">{SORT_LABELS[sort]}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSort(k)} className="justify-between gap-4">
                  {SORT_LABELS[k]}
                  {sort === k && <Check className="size-4 text-cyan-700" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex h-11 items-center gap-0.5 rounded-2xl border bg-background p-1" role="group" aria-label="تجميع السجل">
            <Layers className="mx-1.5 size-4 text-muted-foreground" aria-hidden />
            {(Object.keys(GROUP_LABELS) as GroupBy[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setGroupBy(k)}
                aria-pressed={groupBy === k}
                className={cn(
                  'h-8 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
                  groupBy === k ? 'bg-cyan-700 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {GROUP_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {/* الفترة */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground">الفترة</span>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted/60 p-1" role="group" aria-label="الفترة">
            {(['today', '7', 'month', '90', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => choosePeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
                  period === p ? 'bg-cyan-950 text-cyan-50 shadow-sm dark:bg-cyan-600' : 'text-muted-foreground hover:bg-background hover:text-foreground'
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => choosePeriod('custom')}
              aria-pressed={period === 'custom'}
              className={cn(
                'h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
                period === 'custom' ? 'bg-cyan-950 text-cyan-50 shadow-sm dark:bg-cyan-600' : 'text-muted-foreground hover:bg-background hover:text-foreground'
              )}
            >
              فترة محددة
            </button>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs">
              <span className="text-muted-foreground">من</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => changeCustom(e.target.value, to)}
                aria-label="من تاريخ"
                className="bg-transparent py-1 text-xs font-semibold tabular-nums outline-none"
              />
              <span className="text-muted-foreground">إلى</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => changeCustom(from, e.target.value)}
                aria-label="إلى تاريخ"
                className="bg-transparent py-1 text-xs font-semibold tabular-nums outline-none"
              />
            </div>
          )}
        </div>

        {/* شريط التسوية — فلتر وعرض في نفس الوقت */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <PackageCheck className="size-3.5" />
            حالة التسوية — الجزء الأكبر = قيمة أكبر
          </p>
          <SettlementBar segs={segs} status={status} onPick={(k) => setStatus(status === k ? null : k)} />
        </div>

        {/* فلاتر سريعة */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Filter className="size-3.5" />
            تضييق
          </span>

          <Facet
            icon={Truck}
            label="المورد"
            value={supplier ? (supplier === NO_SUPPLIER ? 'بدون مورد' : supplier) : null}
            options={suppliers.map(([k, n]) => ({ value: k, label: k === NO_SUPPLIER ? 'بدون مورد' : k, count: n }))}
            onPick={setSupplier}
          />
          <Facet
            icon={Wallet}
            label="طريقة الدفع"
            value={method ? methodLabel(method) : null}
            options={methods.map(([k, n]) => ({ value: k, label: methodLabel(k) ?? k, count: n }))}
            onPick={setMethod}
          />
          {users.length > 1 && (
            <Facet icon={User} label="بواسطة" value={by} options={users.map(([k, n]) => ({ value: k, label: k, count: n }))} onPick={setBy} />
          )}

          <TogglePill active={onlyReturned} onClick={() => setOnlyReturned((v) => !v)} icon={RotateCcw}>
            فيها مرتجع
          </TogglePill>
          <TogglePill active={onlyLate} onClick={() => setOnlyLate((v) => !v)} icon={Clock} tone="late">
            متأخرة +{LATE_DAYS} يوم
          </TogglePill>

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              مسح الفلاتر ({activeFilters})
            </button>
          )}
        </div>
      </section>

      {capped && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
          معروض آخر {FETCH_CAP} أمر شراء. حدّد فترة علشان تشوف النتائج كاملة بدقة.
        </p>
      )}

      {/* ═════════ السجل ═════════ */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed py-16 text-center">
          <Truck className="mx-auto size-9 text-cyan-700/60" aria-hidden />
          {orders.length === 0 ? (
            <>
              <p className="mt-3 font-bold">لسه مفيش أوامر شراء</p>
              <p className="mt-1 text-sm text-muted-foreground">سجّل أول أمر شراء وهيظهر حسابك مع المورد هنا.</p>
              <Button onClick={() => setNewOpen(true)} className="mt-4 bg-cyan-700 text-white hover:bg-cyan-600">
                <Plus className="size-4" />
                أمر شراء جديد
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 font-bold">مفيش أوامر بالفلاتر دي</p>
              <p className="mt-1 text-sm text-muted-foreground">جرّب توسّع الفترة أو تشيل بعض الفلاتر.</p>
              <Button variant="outline" onClick={clearAll} className="mt-4">
                مسح الفلاتر
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((g) => {
            const gNet = g.list.reduce((s, o) => s + C(o).net, 0)
            const gDue = g.list.reduce((s, o) => s + C(o).due, 0)
            return (
              <section key={g.key} aria-label={g.title || 'كل الأوامر'}>
                {groupBy !== 'none' && (
                  <header className="mb-3 flex items-center gap-3">
                    {groupBy === 'supplier' && (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-700/10 text-sm font-extrabold text-cyan-800 dark:text-cyan-200">
                        {g.title.trim().charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-extrabold">{g.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        {g.list.length} أمر · صافي <span className="tabular-nums">{formatCurrency(gNet)}</span>
                      </p>
                    </div>
                    {gDue > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold tabular-nums text-amber-800 dark:text-amber-300">
                        متبقي {formatCurrency(gDue)}
                      </span>
                    )}
                    <span aria-hidden className="hidden h-px flex-1 bg-border sm:block" />
                  </header>
                )}

                <ul className="space-y-3">
                  {g.list.map((o) => (
                    <Slip
                      key={o.id}
                      o={o}
                      c={C(o)}
                      open={openId === o.id}
                      showSupplier={groupBy !== 'supplier'}
                      showDate={groupBy !== 'day'}
                      onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                      onReturn={() => setReturnId(o.id)}
                    />
                  ))}
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

/* ───────────────────────── مكوّنات فرعية ───────────────────────── */

function Leader({ label, value, strong, dim }: { label: string; value: string; strong?: boolean; dim?: boolean }) {
  return (
    <li className={cn('flex items-baseline gap-2', strong && 'border-t border-cyan-700/70 pt-2.5 text-base font-extrabold text-cyan-50', dim && 'text-cyan-200/50')}>
      <span className={cn(!strong && 'text-cyan-100/85')}>{label}</span>
      <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-cyan-600/60" />
      <b className="tabular-nums">{value}</b>
    </li>
  )
}

function SettlementBar({
  segs,
  status,
  onPick,
}: {
  segs: Record<Kind, { n: number; amount: number; net: number }>
  status: Kind | null
  onPick: (k: Kind) => void
}) {
  const kinds: Kind[] = ['settled', 'partial', 'unpaid']
  const total = kinds.reduce((s, k) => s + segs[k].net, 0)
  const cnt = kinds.reduce((s, k) => s + segs[k].n, 0)
  const weight = (k: Kind) => {
    const share = total > 0 ? segs[k].net / total : cnt > 0 ? segs[k].n / cnt : 1 / 3
    return Math.max(0.22, share)
  }
  const cols = kinds.map((k) => `minmax(104px,${weight(k).toFixed(3)}fr)`).join(' ')

  const tone: Record<Kind, { bar: string; on: string; text: string }> = {
    settled: {
      bar: 'bg-cyan-600',
      on: 'border-cyan-600 bg-cyan-600/10',
      text: 'text-cyan-800 dark:text-cyan-200',
    },
    partial: {
      bar: 'bg-amber-400',
      on: 'border-amber-500 bg-amber-500/10',
      text: 'text-amber-800 dark:text-amber-300',
    },
    unpaid: {
      bar: 'bg-[repeating-linear-gradient(-45deg,#f59e0b_0_5px,#fde68a_5px_10px)]',
      on: 'border-amber-600 bg-amber-600/10',
      text: 'text-amber-900 dark:text-amber-200',
    },
  }

  return (
    <div
      className="grid grid-cols-3 gap-1.5 sm:[grid-template-columns:var(--cols)]"
      style={{ ['--cols' as string]: cols }}
      role="group"
      aria-label="فلتر حالة التسوية"
    >
      {kinds.map((k) => {
        const s = segs[k]
        const on = status === k
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            aria-pressed={on}
            disabled={s.n === 0 && !on}
            className={cn(
              'group relative overflow-hidden rounded-2xl border bg-background p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 disabled:cursor-not-allowed disabled:opacity-45',
              on ? tone[k].on : 'hover:bg-muted/50'
            )}
          >
            <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1.5', tone[k].bar)} />
            <span className="mt-1 flex items-center justify-between gap-2">
              <span className={cn('truncate text-xs font-bold', on && tone[k].text)}>
                <span className="sm:hidden">{KIND_META[k].short}</span>
                <span className="hidden sm:inline">{KIND_META[k].label}</span>
              </span>
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-extrabold tabular-nums">{s.n}</span>
            </span>
            <span className="mt-1.5 block truncate text-base font-extrabold tabular-nums sm:text-lg">
              {s.n === 0 ? '—' : num(s.amount)}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{s.n === 0 ? 'مفيش' : KIND_META[k].sub}</span>
          </button>
        )
      })}
    </div>
  )
}

function Facet({
  icon: Icon,
  label,
  value,
  options,
  onPick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null
  options: { value: string; label: string; count: number }[]
  onPick: (v: string | null) => void
}) {
  const current = options.find((o) => o.label === value)?.value ?? null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={options.length === 0}
          className={cn(
            'inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 disabled:opacity-45',
            value ? 'border-cyan-600 bg-cyan-600/10 text-cyan-900 dark:text-cyan-100' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{value ? `${label}: ${value}` : label}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-52 overflow-y-auto">
        {value && (
          <DropdownMenuItem onClick={() => onPick(null)} className="text-muted-foreground">
            <X className="size-4" />
            الكل
          </DropdownMenuItem>
        )}
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onPick(current === o.value ? null : o.value)} className="justify-between gap-4">
            <span className="truncate">{o.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
              {current === o.value && <Check className="size-4 text-cyan-700" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TogglePill({
  active,
  onClick,
  icon: Icon,
  tone,
  children,
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
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
        active
          ? tone === 'late'
            ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            : 'border-cyan-600 bg-cyan-600/10 text-cyan-900 dark:text-cyan-100'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

/** إيصال استلام لأمر شراء واحد */
function Slip({
  o,
  c,
  open,
  showSupplier,
  showDate,
  onToggle,
  onReturn,
}: {
  o: PurchaseOrder
  c: Calc
  open: boolean
  showSupplier: boolean
  showDate: boolean
  onToggle: () => void
  onReturn: () => void
}) {
  const T = o.total
  const pPaid = T > 0 ? Math.min(100, (Math.min(c.paidNet, Math.max(0, T - c.returnedValue)) / T) * 100) : 0
  const pRet = T > 0 ? Math.min(100, (c.returnedValue / T) * 100) : 0
  const pDue = T > 0 ? Math.max(0, 100 - pPaid - pRet) : 0
  const m = methodLabel(o.paymentMethod)
  const rail = c.fully ? 'border-s-slate-400' : c.kind === 'settled' ? 'border-s-cyan-600' : c.late ? 'border-s-rose-500' : 'border-s-amber-500'
  const refundBack = o.refunded ?? 0
  const creditBack = Math.max(0, round2(c.returnedValue - refundBack))
  const canReturn = o.status !== 'مرتجعة' && !c.fully
  const id = `slip-${o.id}`

  return (
    <li className={cn('overflow-hidden rounded-2xl border border-s-4 bg-card transition-shadow', rail, open && 'shadow-md', c.fully && 'bg-muted/30')}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="grid min-w-0 flex-1 gap-x-8 gap-y-4 p-4 text-start focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cyan-600/40 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)] md:p-5"
        >
          {/* الهوية */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-cyan-950 px-2 py-0.5 text-xs font-extrabold tracking-wide text-cyan-50 tabular-nums dark:bg-cyan-700">
                {o.orderNo ?? `#${o.id}`}
              </span>
              {c.fully && <span className="rounded-md bg-slate-500/15 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">مرتجعة بالكامل</span>}
              {!c.fully && c.returnedQty > 0 && (
                <span className="rounded-md bg-slate-500/15 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">مرتجعة جزئياً</span>
              )}
              {c.late && <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">متأخرة {c.age} يوم</span>}
            </div>
            {showSupplier && (
              <p className="mt-2.5 flex items-center gap-2 text-sm font-bold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-cyan-700/10 text-xs font-extrabold text-cyan-800 dark:text-cyan-200">
                  {(o.supplier?.name ?? '؟').trim().charAt(0)}
                </span>
                <span className="truncate">{o.supplier?.name ?? <span className="font-medium text-muted-foreground">بدون مورد</span>}</span>
              </p>
            )}
            <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground', showSupplier ? 'mt-1.5' : 'mt-2.5')}>
              <span className="tabular-nums">
                {showDate ? `${new Date(o.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' })} · ` : ''}
                {timeLabel(o.createdAt)}
              </span>
              <span aria-hidden>·</span>
              <span>{o.items.length} صنف</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatNumber(c.qty)} قطعة</span>
            </p>
          </div>

          {/* مقياس التسوية */}
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">قيمة الفاتورة</span>
              <b className={cn('text-xl font-extrabold tabular-nums', c.fully && 'text-muted-foreground line-through')}>{formatCurrency(o.total)}</b>
            </div>

            <div
              className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`مدفوع ${num(c.paidNet)}، مرتجع ${num(c.returnedValue)}، متبقي ${num(c.due)}`}
            >
              <div className="bg-cyan-600 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pPaid}%` }} />
              <div className="bg-slate-400" style={{ width: `${pRet}%` }} />
              <div
                className="bg-[repeating-linear-gradient(-45deg,#f59e0b_0_4px,#fde68a_4px_8px)]"
                style={{ width: `${pDue}%` }}
              />
            </div>

            <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {c.paidNet > 0 && (
                <Legend dot="bg-cyan-600" label="مدفوع" value={formatCurrency(c.paidNet)} sub={m ?? undefined} />
              )}
              {c.returnedValue > 0 && (
                <Legend dot="bg-slate-400" label="مرتجع" value={formatCurrency(c.returnedValue)} sub={`${formatNumber(c.returnedQty)} قطعة`} />
              )}
              {c.due > 0 && (
                <Legend dot="bg-amber-500" label="متبقي للمورد" value={formatCurrency(c.due)} strong tone={c.late ? 'late' : 'due'} />
              )}
              {c.credit > 0 && <Legend dot="bg-sky-500" label="زيادة عند المورد" value={formatCurrency(c.credit)} />}
              {c.due <= 0 && c.credit <= 0 && !c.fully && c.paidNet <= 0 && <span className="text-muted-foreground">مفيش مبالغ</span>}
            </dl>
          </div>
        </button>

        <div className="flex w-12 shrink-0 flex-col items-center justify-between border-s py-3">
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
          {canReturn && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onReturn}
              title="مرتجع للمورد"
              aria-label={`مرتجع للمورد من الأمر ${o.orderNo ?? o.id}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div id={id} className="grid gap-5 border-t bg-cyan-600/[0.035] p-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:p-5">
          {/* الأصناف */}
          <div className="min-w-0">
            <p className="mb-2 text-xs font-bold text-muted-foreground">الأصناف المستلمة</p>
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem_6rem] gap-2 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                <span>الصنف</span>
                <span className="text-center">الكمية</span>
                <span className="text-end">التكلفة</span>
                <span className="text-end">القيمة</span>
              </div>
              <ul className="divide-y">
                {o.items.map((it) => {
                  const rq = it.returnedQty ?? 0
                  return (
                    <li key={it.id} className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem_6rem] items-center gap-2 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{it.name}</p>
                        {rq > 0 && (
                          <p className="mt-0.5 inline-flex items-center gap-1 rounded bg-slate-500/15 px-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            <RotateCcw className="size-3" />
                            رجع {formatNumber(rq)} من {formatNumber(it.quantity)}
                          </p>
                        )}
                      </div>
                      <span className="text-center tabular-nums">{formatNumber(it.quantity)}</span>
                      <span className="text-end tabular-nums text-muted-foreground">{formatCurrency(it.cost)}</span>
                      <span className="text-end font-bold tabular-nums">{formatCurrency(it.quantity * it.cost)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          {/* بيانات الأمر */}
          <div className="min-w-0 space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold text-muted-foreground">بيانات الأمر</p>
              <dl className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                <Row label="المورد">
                  <span className="truncate font-semibold">{o.supplier?.name ?? 'بدون مورد'}</span>
                </Row>
                {o.supplier?.phone && (
                  <Row label="رقمه">
                    <a
                      href={`tel:${o.supplier.phone}`}
                      className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-cyan-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40 dark:text-cyan-300"
                      dir="ltr"
                    >
                      <Phone className="size-3.5" />
                      {o.supplier.phone}
                    </a>
                  </Row>
                )}
                <Row label="التاريخ">
                  <span className="tabular-nums">{formatArabicDateTime(o.createdAt)}</span>
                </Row>
                <Row label="عمره">
                  <span className={cn(c.late && 'font-bold text-rose-600 dark:text-rose-300')}>{ageLabel(c.age)}</span>
                </Row>
                <Row label="سجّله">{o.userName ?? '—'}</Row>
                <Row label="الدفع">{m ?? (c.paidNet > 0 ? '—' : 'لم يُدفع شيء')}</Row>
              </dl>
            </div>

            {c.returnedValue > 0 && (
              <div className="rounded-xl border border-dashed border-slate-400/60 bg-slate-500/[0.06] p-3 text-xs leading-relaxed">
                <p className="mb-1 font-bold text-slate-700 dark:text-slate-200">إزاي اتسوّى المرتجع</p>
                {refundBack > 0 && <p>استرديت <b className="tabular-nums">{formatCurrency(refundBack)}</b> من المورد.</p>}
                {creditBack > 0 && <p>اتخصم <b className="tabular-nums">{formatCurrency(creditBack)}</b> من حسابك عنده.</p>}
              </div>
            )}

            {canReturn && (
              <Button variant="outline" onClick={onReturn} className="w-full">
                <RotateCcw className="size-4" />
                مرتجع للمورد
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function Legend({
  dot,
  label,
  value,
  sub,
  strong,
  tone,
}: {
  dot: string
  label: string
  value: string
  sub?: string
  strong?: boolean
  tone?: 'due' | 'late'
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dot)} />
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-bold tabular-nums',
          strong && (tone === 'late' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300')
        )}
      >
        {value}
        {sub && <span className="ms-1 font-normal text-muted-foreground">· {sub}</span>}
      </dd>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-end">{children}</dd>
    </div>
  )
}
