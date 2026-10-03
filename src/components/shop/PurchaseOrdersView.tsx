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
  Copy,
  Smartphone,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

// نفس تسميات باقي المشروع (PaymentDialog / الخزنة)
const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'انستاباي',
  fawry: 'محفظة إلكترونية',
}
const methodLabel = (m?: string | null) => (m ? METHOD_LABELS[m] ?? m : null)

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'الأحدث أولاً',
  oldest: 'الأقدم أولاً',
  value: 'الأكبر قيمة',
  due: 'الأكبر متبقي',
}
const SORT_HINTS: Record<SortKey, string> = {
  recent: 'آخر أمر اتسجّل يظهر في الأول',
  oldest: 'الأقدم في الأول — مفيد لمتابعة القديم',
  value: 'الفواتير الكبيرة قبل الصغيرة',
  due: 'اللي عليه متبقي أكبر قبل غيره',
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
  all: 'الكل',
}

const KIND_META: Record<Kind, { label: string; short: string; sub: string }> = {
  settled: { label: 'مسدّدة', short: 'مسدّدة', sub: 'قيمتها بعد المرتجع' },
  partial: { label: 'عليها باقي', short: 'عليها باقي', sub: 'متبقي عليها' },
  unpaid: { label: 'آجلة بالكامل', short: 'آجلة', sub: 'متبقي عليها' },
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

const ageText = (d: number) =>
  d === 0 ? 'أقل من يوم' : d === 1 ? 'يوم واحد' : d === 2 ? 'يومين' : d <= 10 ? `${d} أيام` : `${d} يوم`

const fullDate = (iso: string) => ({
  d: new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }),
  t: new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }),
})

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

  // خيارات القوائم المنسدلة — كل خيار معاه عدد الأوامر + معلومة تفيد في القرار
  const supplierOpts = React.useMemo<PickOption[]>(() => {
    const m = new Map<string, { n: number; due: number }>()
    orders.forEach((o) => {
      const k = supplierKey(o)
      const e = m.get(k) ?? { n: 0, due: 0 }
      e.n += 1
      e.due += calcs.get(o.id)!.due
      m.set(k, e)
    })
    return [...m.entries()]
      .sort((a, b) => b[1].due - a[1].due || b[1].n - a[1].n)
      .map(([k, e]) => ({
        value: k,
        label: k === NO_SUPPLIER ? 'شراء بدون مورد' : k,
        count: e.n,
        noSupplier: k === NO_SUPPLIER,
        hint: e.due > 0 ? `متبقي ${formatCurrency(e.due)}` : 'مفيش متبقي',
        tone: (e.due > 0 ? 'due' : 'muted') as 'due' | 'muted',
      }))
  }, [orders, calcs])
  const methodOpts = React.useMemo<PickOption[]>(() => {
    const m = new Map<string, { n: number; paid: number }>()
    orders.forEach((o) => {
      if (!o.paymentMethod) return
      const e = m.get(o.paymentMethod) ?? { n: 0, paid: 0 }
      e.n += 1
      e.paid += calcs.get(o.id)!.paidNet
      m.set(o.paymentMethod, e)
    })
    return [...m.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, e]) => ({ value: k, label: methodLabel(k) ?? k, count: e.n, hint: `مدفوع ${formatCurrency(e.paid)}`, tone: 'muted' as const }))
  }, [orders, calcs])
  const userOpts = React.useMemo<PickOption[]>(() => {
    const m = new Map<string, { n: number; net: number }>()
    orders.forEach((o) => {
      if (!o.userName) return
      const e = m.get(o.userName) ?? { n: 0, net: 0 }
      e.n += 1
      e.net += calcs.get(o.id)!.net
      m.set(o.userName, e)
    })
    return [...m.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, e]) => ({ value: k, label: k, count: e.n, hint: `صافي ${formatCurrency(e.net)}`, tone: 'muted' as const }))
  }, [orders, calcs])

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

  const periodText =
    query || activeFilters
      ? 'في النتائج الحالية'
      : period === 'today'
        ? 'النهارده'
        : period === '7'
          ? 'في آخر ٧ أيام'
          : period === 'month'
            ? 'الشهر ده'
            : period === '90'
              ? 'في آخر ٩٠ يوم'
              : period === 'custom'
                ? 'في الفترة المحددة'
                : 'على كل المشتريات'

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
        <div className="grid items-center gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* المتبقي — الرقم اللي يهمّك */}
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm text-cyan-200/80">
              <Wallet className="size-4 text-amber-300" aria-hidden />
              متبقي للموردين {periodText}
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

          <Picker
            align="end"
            title="ترتيب السجل"
            subtitle="الترتيب جوّه كل مجموعة"
            icon={ArrowUpDown}
            options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: SORT_LABELS[k], hint: SORT_HINTS[k], tone: 'muted' as const }))}
            selected={sort}
            onSelect={(v) => v && setSort(v as SortKey)}
            trigger={(open) => (
              <button
                type="button"
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-2xl border bg-background px-3.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
                  open && 'border-cyan-600 ring-[3px] ring-cyan-600/25'
                )}
              >
                <ArrowUpDown className="size-4 text-cyan-700 dark:text-cyan-300" />
                <span className="text-muted-foreground">ترتيب:</span>
                <span className="font-semibold">{SORT_LABELS[sort]}</span>
                <ChevronDown className={cn('size-4 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
              </button>
            )}
          />

          <div className="flex h-11 items-center gap-0.5 rounded-2xl border bg-background p-1" role="group" aria-label="تجميع السجل">
            <Layers className="ms-1.5 size-4 text-muted-foreground" aria-hidden />
            <span className="me-1 hidden text-xs text-muted-foreground lg:inline">تجميع</span>
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
            حالة التسوية — الشريط يوضّح نصيب كل حالة من القيمة
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
            title="اختر المورد"
            subtitle="مرتّبين بالأكتر متبقياً عليك"
            options={supplierOpts}
            selected={supplier}
            onPick={setSupplier}
            allLabel="كل الموردين"
            allCount={orders.length}
            searchable={supplierOpts.length > 5}
            searchPlaceholder="ابحث باسم المورد…"
          />
          <Facet
            icon={Wallet}
            label="طريقة الدفع"
            title="طريقة الدفع"
            subtitle="الأوامر اللي اتدفع فيها حاجة"
            options={methodOpts}
            selected={method}
            onPick={setMethod}
            allLabel="كل الطرق"
            allCount={methodOpts.reduce((s, o) => s + (o.count ?? 0), 0)}
          />
          {userOpts.length > 1 && (
            <Facet
              icon={User}
              label="بواسطة"
              title="مين سجّل الأمر"
              subtitle="حسب الموظف"
              options={userOpts}
              selected={by}
              onPick={setBy}
              allLabel="كل الموظفين"
              allCount={userOpts.reduce((s, o) => s + (o.count ?? 0), 0)}
            />
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
                        {g.key === NO_SUPPLIER ? <Truck className="size-4" aria-hidden /> : g.title.trim().charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0 max-w-[60%] shrink-0">
                      <h2 className="truncate text-sm font-extrabold">{g.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        {g.list.length} أمر · صافي <span className="tabular-nums">{formatCurrency(gNet)}</span>
                      </p>
                    </div>
                    <span aria-hidden className="h-px min-w-6 flex-1 bg-border" />
                    {gDue > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold tabular-nums text-amber-800 dark:text-amber-300">
                        متبقي {formatCurrency(gDue)}
                      </span>
                    )}
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
  const share = (k: Kind) => (total > 0 ? segs[k].net / total : cnt > 0 ? segs[k].n / cnt : 0)

  const tone: Record<Kind, { fill: string; dot: string; on: string; text: string }> = {
    settled: { fill: 'bg-cyan-600', dot: 'bg-cyan-600', on: 'border-cyan-600 bg-cyan-600/10', text: 'text-cyan-800 dark:text-cyan-200' },
    partial: { fill: 'bg-amber-400', dot: 'bg-amber-400', on: 'border-amber-500 bg-amber-500/10', text: 'text-amber-800 dark:text-amber-300' },
    unpaid: {
      fill: 'bg-[repeating-linear-gradient(-45deg,#f59e0b_0_5px,#fde68a_5px_10px)]',
      dot: 'bg-[repeating-linear-gradient(-45deg,#f59e0b_0_3px,#fde68a_3px_6px)]',
      on: 'border-amber-600 bg-amber-600/10',
      text: 'text-amber-900 dark:text-amber-200',
    },
  }

  return (
    <div>
      {/* شريط النِّسب: حجم كل جزء = حجم قيمته */}
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

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="فلتر حالة التسوية">
        {kinds.map((k) => {
          const s = segs[k]
          const on = status === k
          const pct = Math.round(share(k) * 100)
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              aria-pressed={on}
              disabled={s.n === 0 && !on}
              className={cn(
                'rounded-2xl border bg-background p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 disabled:cursor-not-allowed disabled:opacity-45',
                on ? tone[k].on : 'hover:bg-muted/50'
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn('flex min-w-0 items-center gap-1.5 text-xs font-bold', on && tone[k].text)}>
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', tone[k].dot)} />
                  <span className="truncate">
                    <span className="sm:hidden">{KIND_META[k].short}</span>
                    <span className="hidden sm:inline">{KIND_META[k].label}</span>
                  </span>
                </span>
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-extrabold tabular-nums">{s.n}</span>
              </span>
              <span className="mt-1.5 block truncate text-lg font-extrabold tabular-nums sm:text-xl">{s.n === 0 ? '—' : num(s.amount)}</span>
              <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{s.n === 0 ? 'مفيش' : KIND_META[k].sub}</span>
                {s.n > 0 && pct > 0 && <span className="shrink-0 tabular-nums">{pct}٪</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface PickOption {
  value: string
  label: string
  count?: number
  hint?: string
  tone?: 'due' | 'muted'
  noSupplier?: boolean
}

/** قائمة اختيار بتصميم الصفحة: رأس بترولي + بحث + صفوف فيها معلومة + تنقّل بالأسهم */
function Picker({
  trigger,
  title,
  subtitle,
  icon: Icon,
  options,
  selected,
  onSelect,
  allLabel,
  allCount,
  searchable,
  searchPlaceholder,
  align = 'start',
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
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger(open)}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        className="w-[min(21rem,92vw)] overflow-hidden rounded-2xl border-cyan-900/20 p-0 shadow-2xl"
      >
        <PickerBody
          title={title}
          subtitle={subtitle}
          icon={Icon}
          options={options}
          selected={selected}
          allLabel={allLabel}
          allCount={allCount}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          onSelect={(v) => {
            onSelect(v)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function PickerBody({
  title,
  subtitle,
  icon: Icon,
  options,
  selected,
  onSelect,
  allLabel,
  allCount,
  searchable,
  searchPlaceholder,
}: {
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
}) {
  const [q, setQ] = React.useState('')
  const listRef = React.useRef<HTMLDivElement>(null)
  const needle = q.trim().toLowerCase()
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  const hasAll = !!allLabel

  const move = (dir: 1 | -1) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-row]') ?? [])
    if (rows.length === 0) return
    const i = rows.indexOf(document.activeElement as HTMLButtonElement)
    rows[i === -1 ? (dir === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, i + dir))]?.focus()
  }

  return (
    <div onKeyDown={(e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    }}>
      {/* الرأس */}
      <div className="flex items-center gap-3 bg-cyan-950 px-4 py-3 text-cyan-50">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-cyan-800/70">
          <Icon className="size-4 text-cyan-200" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-cyan-200/70">{subtitle}</p>}
        </div>
      </div>

      {/* البحث */}
      {searchable && (
        <div className="border-b bg-muted/30 p-2.5">
          <label className="relative flex h-9 items-center rounded-xl border bg-background focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25">
            <Search className="pointer-events-none absolute right-3 size-3.5 text-muted-foreground" aria-hidden />
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

      {/* الصفوف */}
      <div ref={listRef} role="listbox" className="max-h-72 space-y-0.5 overflow-y-auto p-1.5">
        {hasAll && !needle && (
          <Row2 on={selected === null} onClick={() => onSelect(null)} lead={<Layers className="size-4" />} label={allLabel!} count={allCount} />
        )}
        {shown.map((o) => (
          <Row2
            key={o.value}
            on={selected === o.value}
            onClick={() => onSelect(!hasAll && selected === o.value ? o.value : selected === o.value ? null : o.value)}
            lead={
              o.noSupplier ? (
                <Truck className="size-4" />
              ) : (
                <span className="text-sm font-extrabold">{o.label.trim().charAt(0)}</span>
              )
            }
            label={o.label}
            count={o.count}
            hint={o.hint}
            tone={o.tone}
            plainLead={!hasAll}
          />
        ))}
        {shown.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">مفيش نتايج بالاسم ده</p>
        )}
      </div>

      {hasAll && selected !== null && (
        <div className="border-t bg-muted/30 p-1.5">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40"
          >
            <X className="size-3.5" />
            مسح الاختيار
          </button>
        </div>
      )}
    </div>
  )
}

function Row2({
  on,
  onClick,
  lead,
  label,
  count,
  hint,
  tone,
  plainLead,
}: {
  on: boolean
  onClick: () => void
  lead: React.ReactNode
  label: string
  count?: number
  hint?: string
  tone?: 'due' | 'muted'
  plainLead?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      data-row
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
        on ? 'bg-cyan-600/10' : 'hover:bg-muted/70 focus-visible:bg-muted/70'
      )}
    >
      {!plainLead && (
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            on ? 'bg-cyan-700 text-white' : 'bg-cyan-700/10 text-cyan-800 group-hover:bg-cyan-700/15 dark:text-cyan-200'
          )}
        >
          {lead}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', on ? 'font-extrabold' : 'font-semibold')}>{label}</span>
        {hint && (
          <span
            className={cn(
              'block truncate text-[11px] tabular-nums',
              tone === 'due' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {count !== undefined && (
        <span className="shrink-0 rounded-full bg-muted px-2 text-[11px] font-extrabold tabular-nums text-muted-foreground">{count}</span>
      )}
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          on ? 'border-cyan-700 bg-cyan-700 text-white' : 'border-transparent text-transparent'
        )}
      >
        <Check className="size-3" />
      </span>
    </button>
  )
}

function Facet({
  icon: Icon,
  label,
  title,
  subtitle,
  options,
  selected,
  onPick,
  allLabel,
  allCount,
  searchable,
  searchPlaceholder,
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
        'inline-flex h-8 max-w-[240px] items-center rounded-full border text-xs font-semibold transition-colors',
        active ? 'border-cyan-600 bg-cyan-600/10 text-cyan-900 dark:text-cyan-100' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Picker
        title={title}
        subtitle={subtitle}
        icon={Icon}
        options={options}
        selected={selected}
        onSelect={onPick}
        allLabel={allLabel}
        allCount={allCount}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        trigger={(open) => (
          <button
            type="button"
            disabled={options.length === 0}
            className={cn(
              'inline-flex h-full min-w-0 items-center gap-1.5 rounded-full ps-3 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 disabled:opacity-45',
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
          className="me-1 ms-0.5 flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-cyan-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/50"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
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

const MANY_ITEMS = 8

/** جدول أصناف الأمر — بيتعامل مع الفواتير الطويلة (جملة 30–50 صنف): بحث، "المرتجع فقط"، تمرير داخلي، وعنوان وإجمالي ثابتين */
function ItemsTable({ o, c }: { o: PurchaseOrder; c: Calc }) {
  const [q, setQ] = React.useState('')
  const [onlyRet, setOnlyRet] = React.useState(false)
  const many = o.items.length > MANY_ITEMS
  const retCount = o.items.filter((i) => (i.returnedQty ?? 0) > 0).length
  const needle = q.trim().toLowerCase()
  const shown = o.items.filter(
    (it) => (!needle || it.name.toLowerCase().includes(needle)) && (!onlyRet || (it.returnedQty ?? 0) > 0)
  )
  const filtering = !!needle || onlyRet

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-foreground/70">الأصناف المستلمة</p>
        {many && (
          <span className="text-xs font-semibold tabular-nums text-foreground/65">
            {filtering ? `عرض ${shown.length} من ${o.items.length}` : `${o.items.length} صنف`}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {many && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2.5">
            <label className="relative flex h-9 min-w-[10rem] flex-1 items-center rounded-xl border bg-background focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25">
              <Search className="pointer-events-none absolute right-3 size-3.5 text-muted-foreground" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث في أصناف الفاتورة…"
                aria-label="بحث في أصناف الفاتورة"
                className="h-full w-full bg-transparent pe-8 text-sm outline-none placeholder:text-muted-foreground/80"
                style={{ paddingInlineStart: '2.25rem' }}
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  aria-label="مسح البحث"
                  className="absolute left-2 flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            {retCount > 0 && (
              <button
                type="button"
                aria-pressed={onlyRet}
                onClick={() => setOnlyRet((v) => !v)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
                  onlyRet ? 'border-cyan-600 bg-cyan-600/10 text-cyan-900 dark:text-cyan-100' : 'bg-background text-foreground/75 hover:bg-muted'
                )}
              >
                <RotateCcw className="size-3.5" />
                المرتجع فقط ({retCount})
              </button>
            )}
          </div>
        )}

        <div className={cn(many && 'max-h-[18rem] overflow-y-auto overscroll-contain')}>
          <div className={cn(ITEM_COLS, 'sticky top-0 z-10 border-b bg-muted px-4 py-2.5 text-[11px] font-bold text-foreground/70')}>
            <span>الصنف</span>
            <span className="text-center">الكمية</span>
            <span className="text-end">التكلفة</span>
            <span className="text-end">القيمة</span>
          </div>
          <ul className="divide-y">
            {shown.map((it) => {
              const rq = it.returnedQty ?? 0
              const keptPct = it.quantity > 0 ? ((it.quantity - rq) / it.quantity) * 100 : 100
              return (
                <li key={it.id} className={cn(ITEM_COLS, 'items-center px-4 py-3')}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{it.name}</p>
                    {rq > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="flex h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-400" aria-hidden>
                          <span className="h-full bg-cyan-600" style={{ width: `${keptPct}%` }} />
                        </span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          رجع {formatNumber(rq)} من {formatNumber(it.quantity)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-center tabular-nums">
                    <p className="text-sm font-bold">{formatNumber(it.quantity)}</p>
                    {rq > 0 && <p className="text-xs font-bold text-slate-600 dark:text-slate-300">−{formatNumber(rq)}</p>}
                  </div>
                  <p className="text-end text-sm font-medium tabular-nums text-foreground/70">{formatCurrency(it.cost)}</p>
                  <div className="text-end tabular-nums">
                    <p className="text-sm font-extrabold">{formatCurrency(it.quantity * it.cost)}</p>
                    {rq > 0 && <p className="text-xs font-bold text-slate-600 dark:text-slate-300">−{formatCurrency(rq * it.cost)}</p>}
                  </div>
                </li>
              )
            })}
            {shown.length === 0 && (
              <li className="px-4 py-8 text-center text-sm font-medium text-foreground/65">مفيش أصناف بالفلتر ده</li>
            )}
          </ul>
        </div>

        {c.returnedQty > 0 ? (
          <div className={cn(ITEM_COLS, 'items-center border-t bg-cyan-600/[0.07] px-4 py-3 text-sm font-extrabold tabular-nums')}>
            <span className="text-cyan-900 dark:text-cyan-100">الصافي بعد المرتجع</span>
            <span className="text-center">{formatNumber(c.qty - c.returnedQty)}</span>
            <span />
            <span className="text-end">{formatCurrency(c.net)}</span>
          </div>
        ) : (
          many && (
            <div className={cn(ITEM_COLS, 'items-center border-t bg-cyan-600/[0.07] px-4 py-3 text-sm font-extrabold tabular-nums')}>
              <span className="text-cyan-900 dark:text-cyan-100">إجمالي {o.items.length} صنف</span>
              <span className="text-center">{formatNumber(c.qty)}</span>
              <span />
              <span className="text-end">{formatCurrency(o.total)}</span>
            </div>
          )
        )}
      </div>
    </div>
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
  const rail = c.fully ? 'bg-slate-400' : c.kind === 'settled' ? 'bg-cyan-600' : c.late ? 'bg-rose-500' : 'bg-amber-500'
  const refundBack = o.refunded ?? 0
  const creditBack = Math.max(0, round2(c.returnedValue - refundBack))
  const canReturn = o.status !== 'مرتجعة' && !c.fully
  const id = `slip-${o.id}`
  const when = fullDate(o.createdAt)
  const paidSub = [m, refundBack > 0 ? `بعد استرداد ${num(refundBack)}` : null].filter(Boolean).join(' · ')

  return (
    <li className={cn('relative overflow-hidden rounded-2xl border bg-card transition-shadow', open && 'shadow-md', c.fully && 'bg-muted/30')}>
      <span aria-hidden className={cn('absolute inset-y-4 start-0 w-1.5 rounded-e-full', rail)} />

      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="grid min-w-0 flex-1 items-center gap-x-8 gap-y-4 p-4 ps-6 text-start focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cyan-600/40 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.25fr)] md:p-5 md:ps-7"
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
                {o.supplier ? (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-cyan-700/10 text-xs font-extrabold text-cyan-800 dark:text-cyan-200">
                    {o.supplier.name.trim().charAt(0)}
                  </span>
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                    <Truck className="size-3.5" aria-hidden />
                  </span>
                )}
                <span className="truncate">{o.supplier?.name ?? <span className="font-medium text-muted-foreground">شراء بدون مورد</span>}</span>
              </p>
            )}
            <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-foreground/70', showSupplier ? 'mt-1.5' : 'mt-2.5')}>
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

          {/* قيمة الفاتورة — عمود ثابت علشان الأرقام تتحاذى */}
          <div className="flex items-baseline justify-between gap-3 md:block">
            <p className="text-xs font-semibold text-foreground/70">قيمة الفاتورة</p>
            <p className={cn('text-xl font-extrabold leading-tight tabular-nums md:mt-0.5 md:text-2xl', c.fully && 'text-muted-foreground line-through')}>
              {num(o.total)}
              <span className="ms-1 text-xs font-semibold text-muted-foreground">جنيه</span>
            </p>
          </div>

          {/* مقياس التسوية */}
          <div className="min-w-0">
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`مدفوع ${num(c.paidNet)}، مرتجع ${num(c.returnedValue)}، متبقي ${num(c.due)}`}
            >
              <div className="bg-cyan-600 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pPaid}%` }} />
              <div className="bg-slate-400" style={{ width: `${pRet}%` }} />
              <div className="bg-[repeating-linear-gradient(-45deg,#f59e0b_0_4px,#fde68a_4px_8px)]" style={{ width: `${pDue}%` }} />
            </div>

            <dl className="mt-3 flex flex-wrap gap-2">
              {c.paidNet > 0 && <Legend kind="paid" label="مدفوع" value={formatCurrency(c.paidNet)} sub={paidSub || undefined} />}
              {c.returnedValue > 0 && (
                <Legend kind="ret" label="مرتجع" value={formatCurrency(c.returnedValue)} sub={`${formatNumber(c.returnedQty)} قطعة`} />
              )}
              {c.due > 0 && <Legend kind={c.late ? 'late' : 'due'} label="متبقي للمورد" value={formatCurrency(c.due)} />}
              {c.credit > 0 && <Legend kind="credit" label="زيادة عند المورد" value={formatCurrency(c.credit)} />}
              {c.due <= 0 && c.credit <= 0 && !c.fully && c.paidNet <= 0 && <span className="text-sm font-medium text-foreground/70">مفيش مبالغ</span>}
            </dl>
          </div>
        </button>

        <div className="flex w-14 shrink-0 flex-col items-center justify-between gap-2 border-s py-3">
          <button
            type="button"
            onClick={onToggle}
            tabIndex={-1}
            aria-hidden
            className={cn('flex size-8 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted', open && 'bg-cyan-600/15 text-cyan-800 dark:text-cyan-200')}
          >
            <ChevronDown className={cn('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
          </button>
          {canReturn ? (
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
          ) : (
            <span className="size-8" aria-hidden />
          )}
        </div>
      </div>

      {open && (
        <div id={id} className="grid gap-5 border-t bg-cyan-600/[0.035] p-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:p-5">
          {/* الأصناف + المرتجع */}
          <div className="min-w-0 space-y-4">
            <ItemsTable o={o} c={c} />

            {c.returnedValue > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold text-foreground/70">إزاي اتسوّى المرتجع</p>
                <div className="overflow-hidden rounded-2xl border bg-card">
                  <div className="flex items-center justify-between gap-3 bg-slate-500/[0.07] px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold text-foreground/60">قيمة المرتجع</p>
                      <p className="text-xl font-extrabold tabular-nums">
                        {num(c.returnedValue)}
                        <span className="ms-1 text-xs font-semibold text-foreground/60">جنيه</span>
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-foreground/65">
                      {formatNumber(c.returnedQty)} قطعة من {o.items.filter((i) => (i.returnedQty ?? 0) > 0).length} صنف
                    </p>
                  </div>

                  <div className="flex h-2.5 gap-0.5 overflow-hidden bg-muted" aria-hidden>
                    {refundBack > 0 && <span className="h-full bg-cyan-600" style={{ flexGrow: refundBack, flexBasis: 0 }} />}
                    {creditBack > 0 && <span className="h-full bg-amber-400" style={{ flexGrow: creditBack, flexBasis: 0 }} />}
                  </div>

                  <ul className="divide-y">
                    {refundBack > 0 && (
                      <li className="flex items-center gap-3 px-4 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-600/10 text-cyan-800 dark:text-cyan-200">
                          <Wallet className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">رجعلك المورد فلوس</p>
                          <p className="text-xs font-medium text-foreground/65">اتسجّلت في الخزنة</p>
                        </div>
                        <b className="text-base font-extrabold tabular-nums text-cyan-800 dark:text-cyan-200">{formatCurrency(refundBack)}</b>
                      </li>
                    )}
                    {creditBack > 0 && (
                      <li className="flex items-center gap-3 px-4 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-200">
                          <Truck className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">اتخصمت من اللي عليك للمورد</p>
                          <p className="text-xs font-medium tabular-nums text-foreground/65">
                            {c.credit <= 0 ? `المتبقي عليك نزل من ${num(c.due + creditBack)} إلى ${num(c.due)}` : 'قلّل المتبقي عليك للمورد'}
                          </p>
                        </div>
                        <b className="text-base font-extrabold tabular-nums text-amber-800 dark:text-amber-200">{formatCurrency(creditBack)}</b>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* بيانات الأمر */}
          <div className="min-w-0 space-y-3 md:sticky md:top-3 md:self-start">
            <p className="text-xs font-bold text-foreground/70">بيان الأمر</p>
            <div className="overflow-hidden rounded-2xl border bg-card">
              {/* المورد */}
              <div className="p-3.5">
                <div className="flex items-center gap-3">
                  {o.supplier ? (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-950 text-lg font-extrabold text-cyan-50 dark:bg-cyan-700">
                      {o.supplier.name.trim().charAt(0)}
                    </span>
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
                      <Truck className="size-5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-foreground/60">المورد</p>
                    <p className="truncate text-base font-extrabold leading-tight">{o.supplier?.name ?? 'شراء بدون مورد'}</p>
                    {o.supplier?.phone && (
                      <bdi dir="ltr" className="mt-0.5 inline-block text-sm font-semibold tabular-nums tracking-wide text-foreground/75">
                        {o.supplier.phone}
                      </bdi>
                    )}
                  </div>
                </div>

                {o.supplier?.phone && (
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <a
                      href={`tel:${o.supplier.phone}`}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white transition-colors hover:bg-cyan-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40"
                    >
                      <Smartphone className="size-4" aria-hidden />
                      اتصال بالمورد
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(o.supplier!.phone!)
                          toast.success('تم نسخ رقم المورد')
                        } catch {
                          toast.error('تعذّر النسخ')
                        }
                      }}
                      aria-label="نسخ رقم المورد"
                      title="نسخ الرقم"
                      className="flex size-10 items-center justify-center rounded-xl border bg-background text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40"
                    >
                      <Copy className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
              </div>

              {/* معلومات الأمر */}
              <div className="grid grid-cols-2 gap-px border-t bg-border">
                <Fact label="التاريخ" value={when.d} sub={when.t} />
                <Fact
                  label="مرّ عليه"
                  value={ageText(c.age)}
                  sub={c.due > 0 ? (c.late ? 'عدّى حد التأخير' : 'لسه فيه متبقي') : 'مفيش متبقي'}
                  tone={c.late ? 'late' : undefined}
                />
                <Fact label="سجّله" value={o.userName ?? '—'} />
                <Fact label="طريقة الدفع" value={m ?? (c.paidNet > 0 ? '—' : 'لم يُدفع شيء')} />
              </div>
            </div>

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

const ITEM_COLS = 'grid grid-cols-[minmax(0,1fr)_4rem_5.5rem_6.5rem] gap-3'

const LEGEND_STYLE = {
  paid: { dot: 'bg-cyan-600', chip: 'bg-cyan-600/10 ring-cyan-600/20', value: 'text-cyan-900 dark:text-cyan-100' },
  ret: { dot: 'bg-slate-500', chip: 'bg-slate-500/10 ring-slate-500/20', value: 'text-slate-800 dark:text-slate-100' },
  due: { dot: 'bg-amber-500', chip: 'bg-amber-500/15 ring-amber-500/30', value: 'text-amber-800 dark:text-amber-200' },
  late: { dot: 'bg-rose-500', chip: 'bg-rose-500/10 ring-rose-500/25', value: 'text-rose-700 dark:text-rose-200' },
  credit: { dot: 'bg-sky-500', chip: 'bg-sky-500/10 ring-sky-500/25', value: 'text-sky-800 dark:text-sky-200' },
} as const

function Legend({
  kind,
  label,
  value,
  sub,
}: {
  kind: keyof typeof LEGEND_STYLE
  label: string
  value: string
  sub?: string
}) {
  const st = LEGEND_STYLE[kind]
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-3 py-1.5 ring-1 ring-inset', st.chip)}>
      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', st.dot)} />
      <dt className="text-[13px] font-semibold text-foreground/80">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className={cn('text-[15px] font-extrabold tabular-nums', st.value)}>{value}</span>
        {sub && <span className="text-xs font-medium text-foreground/65">· {sub}</span>}
      </dd>
    </div>
  )
}

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'late' }) {
  return (
    <div className="min-w-0 bg-card px-3.5 py-3">
      <p className="text-[11px] font-semibold text-foreground/60">{label}</p>
      <p className={cn('mt-0.5 truncate text-sm font-extrabold tabular-nums', tone === 'late' && 'text-rose-600 dark:text-rose-300')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs font-medium tabular-nums text-foreground/65">{sub}</p>}
    </div>
  )
}
