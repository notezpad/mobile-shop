'use client'

import * as React from 'react'
import {
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Eye,
  FileSpreadsheet,
  Truck,
  Smartphone,
  MoreVertical,
  Check,
  X,
  CheckCircle2,
  BarChart3,
  ChevronDown,
  ArrowUpDown,
  HandCoins,
  PackageCheck,
  Percent,
  Receipt,
  Clock,
  Wallet,
  Boxes,
  CalendarDays,
  LayoutGrid,
  Rows3,
  Flame,
  ShoppingBag,
  Calculator,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { useConfirm } from './ConfirmDialogProvider'
import { SupplierDetailDialog } from './SupplierDetailDialog'
import { SupplierPaymentDialog } from './SupplierPaymentDialog'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Supplier {
  id: number
  name: string
  phone: string | null
  balance: number
  _count?: { purchaseOrders: number }
  totalPurchases?: number
  lastPurchaseAt?: string | null
}

/* ───────────────────────── هوية الصفحة ─────────────────────────
   «بوليصة الاستلام»: الموردين = بضاعة داخلة وفلوس علينا.
   برتقالي الكرتون/الشحن (#ea580c) + حبر داكن دافي، وكل مورد بوليصة
   بشريط تحذير، وخط تقطيع بثقبين، وختم بحالة الحساب.
   ألوان الحالة: برتقالي = مستحق عليك · أخضر = مسدَّد · أزرق = دفعت زيادة */
const ACCENT = '#ea580c'
const TONES = {
  debt: { color: '#ea580c', label: 'مستحق السداد' },
  clear: { color: '#059669', label: 'مسدَّد' },
  credit: { color: '#0284c7', label: 'دفعنا زيادة' },
} as const
type Tone = keyof typeof TONES
const toneOf = (balance: number): Tone => (balance > 0 ? 'debt' : balance < 0 ? 'credit' : 'clear')

export function SuppliersView() {
  const confirm = useConfirm()
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Supplier | null>(null)
  const [detailSupplier, setDetailSupplier] = React.useState<Supplier | null>(
    null
  )
  const [payTarget, setPayTarget] = React.useState<Supplier | null>(null)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : ''
      const data = await api<Supplier[]>(`/api/suppliers${params}`)
      if (Array.isArray(data)) setSuppliers(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الموردين')
    } finally {
      setLoading(false)
    }
  }, [search])

  React.useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['suppliers'], load)

  const exportExcel = () => {
    if (suppliers.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('قائمة-الموردين'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'قائمة الموردين',
      sheetName: 'الموردين',
      columns: [
        { header: 'الاسم', key: 'name', format: 'text' },
        { header: 'الهاتف', key: 'phone', format: 'text' },
        { header: 'عدد أوامر الشراء', key: 'ordersCount', format: 'int' },
        { header: 'إجمالي المشتريات', key: 'totalPurchases', format: 'currency' },
        { header: 'الرصيد المستحق للمورد', key: 'balance', format: 'currency' },
        { header: 'آخر عملية شراء', key: 'lastPurchaseAt', format: 'text' },
      ],
      rows: suppliers.map((s) => ({
        name: s.name,
        phone: s.phone || '-',
        ordersCount: s._count?.purchaseOrders ?? 0,
        totalPurchases: s.totalPurchases ?? 0,
        balance: s.balance,
        lastPurchaseAt: s.lastPurchaseAt ? new Date(s.lastPurchaseAt).toLocaleDateString('ar-EG') : '-',
      })),
      totals: {
        name: 'الإجمالي',
        totalPurchases: suppliers.reduce((sum, s) => sum + (s.totalPurchases ?? 0), 0),
        balance: suppliers.reduce((sum, s) => sum + s.balance, 0),
      },
    })
  }

  const remove = async (id: number) => {
    if (!(await confirm('حذف المورد؟'))) return
    // ⚡ Optimistic
    const removed = suppliers.find((s) => s.id === id)
    setSuppliers((prev) => prev.filter((s) => s.id !== id))
    try {
      await api(`/api/suppliers/${id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      if (typeof navigator === 'undefined' || navigator.onLine) load()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم الحذف (offline — سيتم المزامنة لاحقاً)')
      } else {
        if (removed) setSuppliers((prev) => [removed, ...prev])
        toast.error(e?.message || 'فشل الحذف')
      }
    }
  }

  // آخر نسخة كاملة من القائمة (من غير بحث) — الإحصائيات بتعتمد عليها علشان متتغيّرش وقت البحث
  const [fullList, setFullList] = React.useState<Supplier[]>([])
  React.useEffect(() => {
    if (!search.trim()) setFullList(suppliers)
  }, [suppliers, search])
  const base = fullList.length > 0 ? fullList : suppliers

  // Total we owe suppliers = sum of positive balances
  const totalOwed = React.useMemo(
    () => base.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0),
    [base]
  )

  /* ───────── أرقام العرض فقط (مشتقة من نفس البيانات — بدون أي منطق جديد) ───────── */
  const view = React.useMemo(() => {
    const creditors = base.filter((c) => c.balance > 0)
    const top = [...creditors].sort((x, y) => y.balance - x.balance)
    const purchases = base.reduce((s, c) => s + (c.totalPurchases ?? 0), 0)
    const orders = base.reduce((s, c) => s + (c._count?.purchaseOrders ?? 0), 0)
    const overpaid = base.filter((c) => c.balance < 0)
    const age = (c: Supplier) => (c.lastPurchaseAt ? daysSince(c.lastPurchaseAt) : Infinity)
    const old = creditors.filter((c) => age(c) > 30)
    const idle = base.filter((c) => age(c) > 30)
    const buckets = [
      { label: 'حتى ٧ أيام', color: '#10b981', sum: 0, n: 0 },
      { label: '٨ – ٣٠ يوم', color: '#f59e0b', sum: 0, n: 0 },
      { label: '٣١ – ٩٠ يوم', color: '#ea580c', sum: 0, n: 0 },
      { label: 'أكتر من ٩٠ يوم', color: '#be123c', sum: 0, n: 0 },
    ]
    for (const c of creditors) {
      const d = age(c)
      const i = d <= 7 ? 0 : d <= 30 ? 1 : d <= 90 ? 2 : 3
      buckets[i].sum += c.balance
      buckets[i].n += 1
    }
    const sources = [...base]
      .filter((c) => (c.totalPurchases ?? 0) > 0)
      .sort((x, y) => (y.totalPurchases ?? 0) - (x.totalPurchases ?? 0))
    return {
      creditorsCount: creditors.length,
      top,
      purchases,
      orders,
      avgOrder: orders > 0 ? purchases / orders : 0,
      paidPct: purchases > 0 ? Math.min(Math.max(((purchases - totalOwed) / purchases) * 100, 0), 100) : 0,
      oldDebt: old.reduce((s, c) => s + c.balance, 0),
      oldCount: old.length,
      idleCount: idle.length,
      overpaidSum: overpaid.reduce((s, c) => s + Math.abs(c.balance), 0),
      overpaidCount: overpaid.length,
      buckets,
      sources,
    }
  }, [base, totalOwed])

  /* ───────── الفلاتر والترتيب (عرض فقط على القايمة اللي اتحمّلت) ───────── */
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [activity, setActivity] = React.useState<ActivityFilter>('any')
  const [sort, setSort] = React.useState<SortKey>('default')
  const [budget, setBudget] = React.useState('')
  const [mode, setMode] = React.useState<'cards' | 'list'>('cards')

  const ageOf = (c: Supplier) => (c.lastPurchaseAt ? daysSince(c.lastPurchaseAt) : Infinity)
  const isUrgent = (c: Supplier) => c.balance > 0 && ageOf(c) > 30 // عليك له ومن شهر ما اشتريتش منه = بضاعة قديمة لسه مدفوعة ناقص
  const matchStatus = (c: Supplier, s: StatusFilter) =>
    s === 'debt' ? c.balance > 0 : s === 'urgent' ? isUrgent(c) : s === 'clear' ? c.balance === 0 : s === 'credit' ? c.balance < 0 : true
  const matchActivity = (c: Supplier, a: ActivityFilter) =>
    a === 'active'
      ? ageOf(c) <= 30
      : a === 'stalled'
        ? c.lastPurchaseAt != null && ageOf(c) > 30
        : a === 'never'
          ? !c.lastPurchaseAt && (c._count?.purchaseOrders ?? 0) === 0
          : a === 'nophone'
            ? !c.phone
            : true

  // عدّاد ومجموع كل تبويب (على القايمة المحمّلة)
  const tabs = React.useMemo(() => {
    const sum = (f: (c: Supplier) => boolean) => suppliers.filter(f).reduce((s, c) => s + Math.abs(c.balance), 0)
    return {
      all: { n: suppliers.length, sum: null as number | null },
      debt: { n: suppliers.filter((c) => c.balance > 0).length, sum: sum((c) => c.balance > 0) },
      urgent: { n: suppliers.filter(isUrgent).length, sum: sum(isUrgent) },
      clear: { n: suppliers.filter((c) => c.balance === 0).length, sum: null },
      credit: { n: suppliers.filter((c) => c.balance < 0).length, sum: sum((c) => c.balance < 0) },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers])
  const actCounts = React.useMemo(
    () => ({
      active: suppliers.filter((c) => matchActivity(c, 'active')).length,
      stalled: suppliers.filter((c) => matchActivity(c, 'stalled')).length,
      never: suppliers.filter((c) => matchActivity(c, 'never')).length,
      nophone: suppliers.filter((c) => matchActivity(c, 'nophone')).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers]
  )

  const shown = React.useMemo(() => {
    let rows = suppliers.filter((c) => matchStatus(c, status) && matchActivity(c, activity))
    if (sort !== 'default') {
      rows = [...rows].sort((x, y) => {
        if (sort === 'debt') return y.balance - x.balance
        if (sort === 'oldest') {
          // الأقدم تعاملاً أولاً (اللي عمره ما اشترى منه بيتحط في الآخر)
          const tx = x.lastPurchaseAt ? new Date(x.lastPurchaseAt).getTime() : Infinity
          const ty = y.lastPurchaseAt ? new Date(y.lastPurchaseAt).getTime() : Infinity
          return tx === ty ? 0 : tx < ty ? -1 : 1
        }
        if (sort === 'purchases') return (y.totalPurchases ?? 0) - (x.totalPurchases ?? 0)
        if (sort === 'recent')
          return (
            (y.lastPurchaseAt ? new Date(y.lastPurchaseAt).getTime() : 0) -
            (x.lastPurchaseAt ? new Date(x.lastPurchaseAt).getTime() : 0)
          )
        return x.name.localeCompare(y.name, 'ar')
      })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers, status, activity, sort])

  // خطة السداد — «معايا كام؟» نسدّد الأقدم الأول ونقفل حسابات كاملة بقدر الميزانية (عرض فقط)
  const plan = React.useMemo(() => {
    const b = parseFloat(budget)
    if (!(b > 0)) return null
    const debtors = suppliers
      .filter((c) => c.balance > 0)
      .sort((x, y) => {
        const tx = x.lastPurchaseAt ? new Date(x.lastPurchaseAt).getTime() : 0
        const ty = y.lastPurchaseAt ? new Date(y.lastPurchaseAt).getTime() : 0
        return tx - ty || y.balance - x.balance
      })
    let left = b
    const covered: Supplier[] = []
    let next: Supplier | null = null
    for (const d of debtors) {
      if (d.balance <= left) {
        covered.push(d)
        left -= d.balance
      } else if (!next) next = d
    }
    return {
      budget: b,
      covered,
      spent: b - left,
      left,
      next,
      totalDebtors: debtors.length,
      coveredIds: new Set(covered.map((c) => c.id)),
    }
  }, [budget, suppliers])

  const hasFilters = status !== 'all' || activity !== 'any' || sort !== 'default' || search.trim() !== ''
  const clearFilters = () => {
    setStatus('all')
    setActivity('any')
    setSort('default')
    setSearch('')
  }
  const shownOwed = shown.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0)
  const shownPurchases = shown.reduce((s, c) => s + (c.totalPurchases ?? 0), 0)

  const [statsOpen, setStatsOpen] = React.useState(true)
  const noData = loading && suppliers.length === 0
  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (c: Supplier) => {
    setEditing(c)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* ═════════ Hero — «بوليصة الاستلام»: إجمالي اللي عليك + أولويات السداد ═════════ */}
      <section className="animate-in-up motion-reduce:animate-none relative overflow-hidden rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50/70 to-white text-stone-900 shadow-sm dark:border-stone-800 dark:from-stone-900 dark:via-stone-900 dark:to-stone-950 dark:text-stone-50">
        {/* شريط تحذير الشحن — فاتح نهاراً وداكن ليلاً */}
        <div
          aria-hidden
          className="h-2 w-full dark:hidden"
          style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${ACCENT} 0 10px, #fed7aa 10px 20px)` }}
        />
        <div
          aria-hidden
          className="hidden h-2 w-full dark:block"
          style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${ACCENT} 0 10px, #1c1917 10px 20px)` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full opacity-20 blur-3xl dark:opacity-30"
          style={{ backgroundColor: ACCENT }}
        />
        {/* نقاط خفيفة كورق الشحن */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-30"
          style={{
            backgroundImage: 'radial-gradient(rgba(234,88,12,0.16) 1px, transparent 1.2px)',
            backgroundSize: '16px 16px',
            maskImage: 'linear-gradient(to left, black, transparent 60%)',
            WebkitMaskImage: 'linear-gradient(to left, black, transparent 60%)',
          }}
        />

        <div className="relative flex flex-wrap items-stretch gap-x-8 gap-y-5 p-5 sm:p-6">
          <div className="min-w-[230px]">
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-9 items-center justify-center rounded-xl text-white shadow-md"
                style={{ backgroundColor: ACCENT }}
              >
                <Truck className="size-[18px]" />
              </span>
              <div>
                <h1 className="text-lg font-extrabold leading-tight">الموردين</h1>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">سجل الموردين وأرصدتهم والدفعات الآجلة</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] font-medium text-stone-500 dark:text-stone-400">إجمالي المستحق للموردين</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tight tabular-nums text-orange-600 dark:text-orange-400">
                {noData ? '—' : num(totalOwed)}
              </span>
              <span className="text-base font-semibold text-stone-500 dark:text-stone-400">جنيه</span>
            </div>
            {!noData && base.length > 0 && (
              <p className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                {view.creditorsCount > 0
                  ? `على ${num(view.creditorsCount)} ${view.creditorsCount > 2 && view.creditorsCount < 11 ? 'موردين' : 'مورد'} من ${num(base.length)}`
                  : 'حسابك مع كل الموردين مسوّى'}
              </p>
            )}
          </div>

          <div className="min-w-[280px] flex-1">
            <PayPriority rows={view.top} total={totalOwed} hidden={noData} onPay={setPayTarget} />
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-col lg:items-stretch lg:justify-center">
            <Button
              size="lg"
              onClick={openAdd}
              className="border-0 bg-orange-600 text-white shadow-md shadow-orange-600/30 hover:bg-orange-500 dark:shadow-orange-900/40"
            >
              <Plus className="size-4" />
              مورد جديد
            </Button>
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={suppliers.length === 0}
              className="border-orange-300 bg-white/70 text-stone-800 hover:border-orange-400 hover:bg-orange-100 hover:text-stone-900 dark:border-stone-700 dark:bg-transparent dark:text-stone-100 dark:hover:border-stone-500 dark:hover:bg-stone-800 dark:hover:text-white"
            >
              <FileSpreadsheet className="size-4" />
              تصدير Excel
            </Button>
          </div>
        </div>
      </section>

      {/* ═════════ مركز الإحصائيات ═════════ */}
      {base.length > 0 && (
        <section className="animate-in-up motion-reduce:animate-none stagger-1 space-y-4">
          <button
            type="button"
            onClick={() => setStatsOpen((o) => !o)}
            aria-expanded={statsOpen}
            className="group flex w-full items-center gap-2.5 rounded-2xl border bg-card px-3.5 py-2.5 text-start shadow-sm transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/40 focus-visible:outline-none"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
              <BarChart3 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold leading-tight">إحصائيات الموردين</h2>
              <p className="text-[11px] text-muted-foreground">صورة سريعة عن مشترياتك وسدادك وأرصدة الموردين</p>
            </div>
            {!statsOpen && (
              <div className="hidden items-center gap-2 text-[11px] sm:flex">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  سداد {view.purchases > 0 ? `${Math.round(view.paidPct)}%` : '—'}
                </span>
                <span className="rounded-full bg-orange-500/10 px-2.5 py-1 font-semibold text-orange-600 dark:text-orange-400">
                  متأخر {num(view.oldDebt)}
                </span>
                <span className="rounded-full bg-stone-500/10 px-2.5 py-1 font-semibold text-stone-600 dark:text-stone-300">
                  خاملون {num(view.idleCount)}
                </span>
              </div>
            )}
            <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {statsOpen ? 'إخفاء' : 'عرض'}
              <ChevronDown className={cn('size-4 transition-transform duration-base', statsOpen && 'rotate-180')} />
            </span>
          </button>

          {statsOpen && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiTile
                  color="#ea580c" icon={ShoppingBag} label="إجمالي المشتريات"
                  value={num(view.purchases)} unit="جنيه"
                  sub={`${num(view.orders)} أمر شراء من ${num(base.length)} ${base.length > 2 && base.length < 11 ? 'موردين' : 'مورد'}`}
                />
                <KpiTile
                  color="#059669" icon={Percent} label="نسبة السداد"
                  value={view.purchases > 0 ? `${view.paidPct.toFixed(view.paidPct >= 10 ? 0 : 1)}%` : '—'}
                  sub={view.purchases > 0 ? `اتسدّد ${num(Math.max(view.purchases - totalOwed, 0))} جنيه` : 'لسه مفيش مشتريات'}
                  progress={view.purchases > 0 ? view.paidPct : undefined}
                />
                <KpiTile
                  color="#b45309" icon={Receipt} label="متوسط أمر الشراء"
                  value={num(Math.round(view.avgOrder))} unit="جنيه"
                  sub={`على ${num(view.orders)} أمر`}
                />
                <KpiTile
                  color="#7c3aed" icon={Boxes} label="متوسط مشتريات المورد"
                  value={num(Math.round(base.length > 0 ? view.purchases / base.length : 0))} unit="جنيه"
                  sub="لكل مورد في السجل"
                />
                <KpiTile
                  color="#be123c" icon={Clock} label="مستحقات قديمة +٣٠ يوم"
                  value={num(view.oldDebt)} unit="جنيه"
                  sub={view.oldCount > 0 ? `لـ ${num(view.oldCount)} ${view.oldCount > 2 && view.oldCount < 11 ? 'موردين' : 'مورد'} من غير شراء جديد` : 'مفيش مستحقات قديمة'}
                  progress={totalOwed > 0 ? (view.oldDebt / totalOwed) * 100 : undefined}
                  progressLabel={totalOwed > 0 ? `${Math.round((view.oldDebt / totalOwed) * 100)}% من المستحق` : undefined}
                />
                <KpiTile
                  color="#78716c" icon={PackageCheck} label="موردون خاملون +٣٠ يوم"
                  value={num(view.idleCount)} unit="مورد"
                  sub={base.length > 0 ? `${Math.round((view.idleCount / base.length) * 100)}% من الموردين من غير شراء` : ''}
                  progress={base.length > 0 ? (view.idleCount / base.length) * 100 : undefined}
                />
                <KpiTile
                  color="#0284c7" icon={Wallet} label="دفعنا زيادة لموردين"
                  value={num(view.overpaidSum)} unit="جنيه"
                  sub={view.overpaidCount > 0 ? `${num(view.overpaidCount)} مورد ليك فلوس عنده` : 'مفيش أرصدة زيادة'}
                />
                <KpiTile
                  color="#f59e0b" icon={HandCoins} label="موردون عليك لهم مستحق"
                  value={num(view.creditorsCount)} unit="مورد"
                  sub={base.length > 0 ? `${Math.round((view.creditorsCount / base.length) * 100)}% من الموردين` : ''}
                  progress={base.length > 0 ? (view.creditorsCount / base.length) * 100 : undefined}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {view.sources.length >= 2 && (
                  <TopSources rows={view.sources.slice(0, 5)} total={view.purchases} onOpen={(c) => setDetailSupplier(c)} />
                )}
                <div className={cn(view.sources.length < 2 && 'lg:col-span-2')}>
                  <PayableAging buckets={view.buckets} total={totalOwed} />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ═════════ الفلاتر — مصمَّمة لمنطق الموردين: إيه اللي عليّا أسدده؟ وإمتى؟ وبكام؟ ═════════ */}
      <div className="animate-in-up motion-reduce:animate-none stagger-2 space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="h-10 rounded-xl pr-10 pl-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 left-2.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="مسح البحث"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* الترتيب — قائمة منسدلة بدل الأقراص */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 rounded-xl">
                <ArrowUpDown className="size-4" />
                <span className="text-muted-foreground">ترتيب:</span>
                <span className="font-semibold">{SORT_LABELS[sort]}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSort(k)} className="justify-between gap-4">
                  {SORT_LABELS[k]}
                  {sort === k && <Check className="size-4 text-orange-600" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden items-center gap-0.5 rounded-xl border bg-background p-0.5 lg:flex" role="group" aria-label="طريقة العرض">
            {(
              [
                ['cards', 'بطاقات', LayoutGrid],
                ['list', 'قائمة', Rows3],
              ] as const
            ).map(([k, l, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                aria-pressed={mode === k}
                title={l}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors',
                  mode === k ? 'bg-orange-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* تبويبات الحساب — كل تبويب بيقولك كام مورد وكام جنيه */}
        <div role="tablist" aria-label="حالة الحساب" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ['all', 'كل الموردين', null, Truck, '#57534e'],
              ['debt', 'عليّا سداد', 'مستحق للمورد', HandCoins, TONES.debt.color],
              ['urgent', 'سداد عاجل', 'قديم +٣٠ يوم', Flame, '#be123c'],
              ['clear', 'حسابه مسوّى', 'مفيش بينا حاجة', CheckCircle2, TONES.clear.color],
              ['credit', 'ليّا عنده', 'دفعنا زيادة', Wallet, TONES.credit.color],
            ] as [StatusFilter, string, string | null, React.ComponentType<{ className?: string }>, string][]
          ).map(([k, label, hint, Icon, color]) => {
            const t = tabs[k]
            const on = status === k
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setStatus(on && k !== 'all' ? 'all' : k)}
                className={cn(
                  'relative overflow-hidden rounded-xl border p-3 text-start transition-all focus-visible:ring-[3px] focus-visible:ring-orange-500/40 focus-visible:outline-none',
                  on ? 'shadow-sm' : 'bg-background hover:bg-muted/50',
                  t.n === 0 && !on && 'opacity-55',
                )}
                style={on ? { borderColor: color, backgroundColor: `${color}12` } : undefined}
              >
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] transition-opacity" style={{ backgroundColor: color, opacity: on ? 1 : 0 }} />
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: on ? color : undefined }}>
                    <Icon className="size-3.5" />
                    {label}
                  </span>
                  <span
                    className="min-w-6 rounded-full px-1.5 text-center text-[11px] font-extrabold tabular-nums"
                    style={{ backgroundColor: `${color}1f`, color }}
                  >
                    {t.n}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-base font-extrabold tabular-nums" style={{ color: t.sum ? color : undefined }}>
                  {t.sum !== null ? num(t.sum) : t.n === 0 ? '—' : num(t.n)}
                  <span className="ms-1 text-[11px] font-medium text-muted-foreground">{t.sum !== null ? 'جنيه' : 'مورد'}</span>
                </p>
                {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
              </button>
            )
          })}
        </div>

        {/* آخر توريد + ميزانية السداد */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-[11px] font-semibold text-muted-foreground">آخر توريد</span>
            <FilterPill active={activity === 'active'} onClick={() => setActivity(activity === 'active' ? 'any' : 'active')} count={actCounts.active} color="#059669">
              بنشتغل معاه (٣٠ يوم)
            </FilterPill>
            <FilterPill active={activity === 'stalled'} onClick={() => setActivity(activity === 'stalled' ? 'any' : 'stalled')} count={actCounts.stalled} color="#78716c">
              وقفنا التوريد
            </FilterPill>
            <FilterPill active={activity === 'never'} onClick={() => setActivity(activity === 'never' ? 'any' : 'never')} count={actCounts.never} color="#7c3aed">
              لسه ماشتريناش منه
            </FilterPill>
            <FilterPill active={activity === 'nophone'} onClick={() => setActivity(activity === 'nophone' ? 'any' : 'nophone')} count={actCounts.nophone} color="#0369a1">
              من غير رقم
            </FilterPill>
          </div>

          <label className="ms-auto flex items-center gap-2 rounded-xl border bg-background px-3 py-1.5 text-xs focus-within:ring-[3px] focus-within:ring-orange-500/40">
            <Calculator className="size-4 text-orange-600 dark:text-orange-400" />
            <span className="font-semibold text-muted-foreground">معايا</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="ميزانية السداد"
              dir="ltr"
              className="w-28 bg-transparent text-center text-sm font-bold tabular-nums outline-none placeholder:text-xs placeholder:font-normal"
              aria-label="ميزانية السداد بالجنيه"
            />
            <span className="font-semibold text-muted-foreground">جنيه</span>
            {budget && (
              <button type="button" onClick={() => setBudget('')} className="text-muted-foreground hover:text-foreground" aria-label="مسح الميزانية">
                <X className="size-3.5" />
              </button>
            )}
          </label>
        </div>

        {plan && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-orange-300/60 bg-orange-50 px-3.5 py-2.5 text-xs text-stone-700 dark:border-orange-400/25 dark:bg-orange-500/10 dark:text-stone-200">
            <HandCoins className="size-4 shrink-0 text-orange-600 dark:text-orange-400" />
            {plan.totalDebtors === 0 ? (
              <span>مفيش مستحقات تتسدّد أصلاً.</span>
            ) : plan.covered.length === 0 ? (
              <span>
                الميزانية دي مش كفاية تقفل حساب أي مورد
                {plan.next && (
                  <>
                    {' '}— أصغر مستحق قدّامك <b className="tabular-nums">{num(plan.next.balance)}</b> ({plan.next.name}).
                  </>
                )}
              </span>
            ) : (
              <>
                <span>
                  بالميزانية دي تقفل حساب <b className="tabular-nums text-orange-700 dark:text-orange-300">{num(plan.covered.length)}</b> من{' '}
                  {num(plan.totalDebtors)} {plan.totalDebtors > 2 && plan.totalDebtors < 11 ? 'موردين' : 'مورد'} (الأقدم الأول) بمبلغ{' '}
                  <b className="tabular-nums">{num(plan.spent)}</b> جنيه
                </span>
                <span className="text-muted-foreground">
                  · يفضل <b className="tabular-nums text-foreground">{num(plan.left)}</b>
                </span>
                {plan.next && (
                  <span className="text-muted-foreground">
                    · اللي بعده: {plan.next.name} ({num(plan.next.balance)})
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {hasFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                النتائج: <b className="tabular-nums text-foreground">{num(shown.length)}</b> من {num(suppliers.length)} مورد
              </span>
              <span>
                مستحق: <b className="tabular-nums text-orange-600 dark:text-orange-400">{formatCurrency(shownOwed)}</b>
              </span>
              <span>
                مشتريات: <b className="tabular-nums text-foreground">{formatCurrency(shownPurchases)}</b>
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" />
              مسح الفلاتر
            </Button>
          </div>
        )}
      </div>

      {/* ═════════ القايمة ═════════ */}
      {loading && suppliers.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[330px] w-full rounded-3xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card className="animate-in-up motion-reduce:animate-none">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <Truck className="size-8" />
            </div>
            <div>
              <p className="text-base font-semibold">
                {hasFilters ? 'مفيش نتائج مطابقة' : 'لسه مفيش موردين'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters
                  ? 'جرّب تغيّر الفلاتر أو كلمة البحث'
                  : 'ضيف أول مورد علشان تسجّل مشترياتك وتتابع اللي عليك له'}
              </p>
            </div>
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                مسح الفلاتر
              </Button>
            ) : (
              <Button onClick={openAdd} className="border-0 bg-orange-600 text-white hover:bg-orange-500">
                <Plus className="size-4" />
                مورد جديد
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* بطاقات — الافتراضي، وهي الوحيدة على الموبايل */}
          <div
            className={cn(
              'grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5',
              mode === 'list' && 'lg:hidden',
              loading && 'opacity-60 transition-opacity',
            )}
          >
            {shown.map((c, i) => (
              <SupplierSlip
                key={c.id}
                c={c}
                index={i}
                onOpen={() => setDetailSupplier(c)}
                onPay={() => setPayTarget(c)}
                onEdit={() => openEdit(c)}
                onDelete={() => remove(c.id)}
              />
            ))}
            {!hasFilters && (
              <button
                type="button"
                onClick={openAdd}
                className="animate-in-up motion-reduce:animate-none group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-card/40 p-6 text-center transition-all duration-base ease-out hover:-translate-y-1.5 hover:border-orange-500/60 hover:bg-orange-500/5 focus-visible:ring-[3px] focus-visible:ring-orange-500/40 focus-visible:outline-none"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/25 transition-transform duration-base group-hover:scale-110 group-hover:rotate-90">
                  <Plus className="size-6" />
                </span>
                <span>
                  <span className="block text-sm font-bold">إضافة مورد جديد</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">سجّل اسمه ورقمه وابدأ حسابه</span>
                </span>
              </button>
            )}
          </div>

          {/* قائمة مضغوطة — للشاشات الكبيرة */}
          {mode === 'list' && (
            <div className={cn('hidden overflow-hidden rounded-2xl border bg-card shadow-sm lg:block', loading && 'opacity-60 transition-opacity')}>
              <div className="grid grid-cols-[2.2fr_1.2fr_1.1fr_1fr_.7fr_1.1fr_auto] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                <span>المورد</span>
                <span>الهاتف</span>
                <span>الحالة والمستحق</span>
                <span>إجمالي المشتريات</span>
                <span>الأوامر</span>
                <span>آخر تعامل</span>
                <span className="w-[116px] text-center">إجراءات</span>
              </div>
              <ul className="divide-y">
                {shown.map((c) => {
                  const tone = toneOf(c.balance)
                  const t = TONES[tone]
                  return (
                    <li
                      key={c.id}
                      className="group grid grid-cols-[2.2fr_1.2fr_1.1fr_1fr_.7fr_1.1fr_auto] items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-orange-500/[0.04]"
                    >
                      <button type="button" onClick={() => setDetailSupplier(c)} className="flex min-w-0 items-center gap-2.5 text-start focus-visible:outline-none">
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
                          style={{ backgroundColor: colorOf(c.name) }}
                        >
                          {c.name?.charAt(0) ?? '?'}
                        </span>
                        <span title={c.name} className="truncate font-semibold group-hover:text-orange-600 dark:group-hover:text-orange-400">{c.name}</span>
                      </button>
                      <PhoneTag phone={c.phone} size="sm" />
                      <span className="flex items-center gap-2">
                        <i className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                        <b className="tabular-nums" style={{ color: t.color }}>
                          {num(Math.abs(c.balance))}
                        </b>
                      </span>
                      <span className="tabular-nums">{num(c.totalPurchases ?? 0)}</span>
                      <span className="tabular-nums">{c._count?.purchaseOrders ?? 0}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.lastPurchaseAt ? <DateTimeCell date={c.lastPurchaseAt} /> : '—'}
                      </span>
                      <span className="flex w-[116px] items-center justify-center gap-0.5">
                        {c.balance > 0 && (
                          <Button variant="ghost" size="icon" className="size-8 text-orange-600 hover:bg-orange-500/10 hover:text-orange-600 dark:text-orange-400" onClick={() => setPayTarget(c)} title="سدّد دفعة" aria-label="سدّد دفعة">
                            <HandCoins className="size-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => setDetailSupplier(c)} title="كشف حساب" aria-label="كشف حساب">
                          <Eye className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(c)} title="تعديل" aria-label="تعديل">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => remove(c.id)} title="حذف" aria-label="حذف">
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {/* زر عائم للموبايل */}
      <Button
        size="icon-lg"
        onClick={openAdd}
        className="fixed bottom-5 left-5 z-30 rounded-full border-0 bg-orange-600 text-white shadow-xl hover:bg-orange-500 sm:hidden"
        aria-label="مورد جديد"
      >
        <Plus className="size-6" />
      </Button>

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={load}
      />

      <SupplierDetailDialog
        open={detailSupplier !== null}
        onOpenChange={(o) => !o && setDetailSupplier(null)}
        supplierId={detailSupplier?.id ?? null}
        supplierName={detailSupplier?.name}
      />

      {/* سداد سريع من الكارت — نفس نافذة الدفعات المستخدمة في كشف الحساب */}
      <SupplierPaymentDialog
        open={payTarget !== null}
        onOpenChange={(o) => !o && setPayTarget(null)}
        supplierId={payTarget?.id ?? null}
        supplierName={payTarget?.name ?? ''}
        currentBalance={payTarget?.balance ?? 0}
        onSaved={() => load()}
      />
    </div>
  )
}

/* ───────────────────────── مكوّنات صغيرة ───────────────────────── */

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

// لون ثابت لكل مورد (من الاسم) — نفس المورد دايماً بنفس اللون
const AVATAR_COLORS = ['#ea580c', '#b45309', '#0f766e', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#a21caf']
function colorOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

type StatusFilter = 'all' | 'debt' | 'urgent' | 'clear' | 'credit'
type ActivityFilter = 'any' | 'active' | 'stalled' | 'never' | 'nophone'
type SortKey = 'default' | 'debt' | 'oldest' | 'purchases' | 'recent' | 'name'
const SORT_LABELS: Record<SortKey, string> = {
  default: 'الأحدث إضافة',
  debt: 'الأعلى مستحقاً',
  oldest: 'الأقدم تعاملاً (يسدَّد الأول)',
  purchases: 'الأكثر مشتريات',
  recent: 'الأحدث تعاملاً',
  name: 'الاسم (أ – ي)',
}

const daysSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000

// أي رقم بيتعرض بأرقام إنجليزية (٠١٠… → 010…) حتى لو اتكتب بأرقام عربية
const toLatinDigits = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

/** الهاتف: شارة أيقونة حديثة (موبايل — مش سماعة بتتقلب في RTL) + الرقم بولد LTR */
function PhoneTag({
  phone,
  size = 'md',
  className,
}: {
  phone: string | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const sm = size === 'sm'
  if (!phone?.trim()) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground/70', className)}>
        <span className={cn('flex shrink-0 items-center justify-center rounded-md bg-muted', sm ? 'size-5' : 'size-6')}>
          <Smartphone className={sm ? 'size-3' : 'size-3.5'} />
        </span>
        بدون هاتف
      </span>
    )
  }
  return (
    <span dir="ltr" className={cn('inline-flex max-w-full items-center gap-1.5', className)}>
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md bg-orange-500/12 text-orange-600 dark:bg-orange-400/15 dark:text-orange-400',
          sm ? 'size-5' : 'size-6',
        )}
      >
        <Smartphone className={sm ? 'size-3' : 'size-3.5'} strokeWidth={2.25} />
      </span>
      <span className={cn('truncate font-bold tracking-wide tabular-nums text-foreground/90', sm ? 'text-xs' : 'text-[13px]')}>
        {toLatinDigits(phone.trim())}
      </span>
    </span>
  )
}

/** قرص فلتر بعدّاد */
function FilterPill({
  active,
  onClick,
  children,
  count,
  color,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-orange-500/40 focus-visible:outline-none',
        active
          ? color
            ? 'border-transparent text-white shadow-sm'
            : 'border-stone-900 bg-stone-900 text-white shadow-sm dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {color && !active && <i className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums',
            active ? 'bg-white/25' : 'bg-muted text-foreground/70',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** بطاقة مؤشر — حد جانبي ملوّن (بدل الحد العلوي في العملاء) + شريط تقدّم اختياري */
function KpiTile({
  color,
  icon: Icon,
  label,
  value,
  unit,
  sub,
  progress,
  progressLabel,
}: {
  color: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  value: string
  unit?: string
  sub?: string
  progress?: number
  progressLabel?: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-s-4 bg-card p-4 transition-shadow hover:shadow-md"
      style={{ borderInlineStartColor: color }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-2xl font-extrabold tabular-nums">
        {value}
        {unit && <span className="ms-1 text-[11px] font-medium text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: `${color}22` }}>
            <div
              className="h-full rounded-full transition-[width] duration-slow ease-out"
              style={{ width: `${Math.min(100, Math.max(progress, 2))}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
            {progressLabel ?? `${Math.round(progress)}%`}
          </span>
        </div>
      )}
    </div>
  )
}

/** أولويات السداد (داخل الـ Hero) — أعلى ٣ موردين مستحقاً + زر سداد مباشر */
function PayPriority({
  rows,
  total,
  hidden,
  onPay,
}: {
  rows: Supplier[]
  total: number
  hidden?: boolean
  onPay: (s: Supplier) => void
}) {
  if (hidden) return <div />
  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center gap-3 rounded-2xl border border-dashed border-orange-300 bg-white/60 p-4 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800/40 dark:text-stone-300">
        <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
        مفيش مستحقات على أي مورد حالياً
      </div>
    )
  }
  const list = rows.slice(0, 3)
  return (
    <div className="h-full min-w-0 rounded-2xl border border-orange-200 bg-white/70 p-3.5 backdrop-blur-sm dark:border-stone-700/80 dark:bg-stone-800/50">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-800 dark:text-stone-200">
          <Flame className="size-3.5 text-orange-600 dark:text-orange-400" />
          ابدأ بسداد
        </p>
        <p className="text-[11px] text-stone-500 dark:text-stone-400">
          {rows.length > list.length ? `و${num(rows.length - list.length)} كمان` : 'الأعلى مستحقاً'}
        </p>
      </div>
      <ul className="space-y-1.5">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5 rounded-xl bg-orange-50/80 p-2 dark:bg-stone-900/60">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
              style={{ backgroundColor: colorOf(r.name) }}
            >
              {r.name?.charAt(0) ?? '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p title={r.name} className="truncate text-[13px] font-semibold">{r.name}</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-orange-200/70 dark:bg-stone-700">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${total > 0 ? Math.max((r.balance / total) * 100, 4) : 0}%` }}
                />
              </div>
            </div>
            <b className="shrink-0 text-sm tabular-nums text-orange-700 dark:text-orange-300">{num(r.balance)}</b>
            <button
              type="button"
              onClick={() => onPay(r)}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-orange-500 focus-visible:ring-[3px] focus-visible:ring-orange-400/50 focus-visible:outline-none"
              aria-label={`سدّد دفعة لـ ${r.name}`}
            >
              <HandCoins className="size-3.5" />
              سدّد
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** حصة الموردين من المشتريات — أعمدة نسبية */
function TopSources({
  rows,
  total,
  onOpen,
}: {
  rows: Supplier[]
  total: number
  onOpen: (c: Supplier) => void
}) {
  const max = rows[0]?.totalPurchases ?? 0
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Boxes className="size-4 text-orange-500" />
          أكتر الموردين توريداً
        </h3>
        <span className="text-[11px] text-muted-foreground">اضغط لفتح كشف الحساب</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const v = r.totalPurchases ?? 0
          const color = colorOf(r.name)
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r)}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-start transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-orange-500/40 focus-visible:outline-none"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                  style={{ backgroundColor: color }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span title={r.name} className="truncate text-sm font-semibold">{r.name}</span>
                    <span className="shrink-0 text-sm font-extrabold tabular-nums">{num(v)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-slow ease-out"
                        style={{ width: `${max > 0 ? Math.max((v / max) * 100, 4) : 0}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="w-9 text-end text-[11px] tabular-nums text-muted-foreground">
                      {total > 0 ? `${Math.round((v / total) * 100)}%` : ''}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** أعمار المستحقات — اللي عليك موزّع حسب الوقت من آخر شراء من المورد */
function PayableAging({
  buckets,
  total,
}: {
  buckets: { label: string; color: string; sum: number; n: number }[]
  total: number
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <CalendarDays className="size-4 text-orange-500" />
          أعمار المستحقات
        </h3>
        <span className="text-[11px] text-muted-foreground">من آخر شراء من المورد</span>
      </div>
      {total <= 0 ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5 text-emerald-500" />
          مفيش مستحقات حالياً
        </div>
      ) : (
        <>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {buckets.map(
              (b) =>
                b.sum > 0 && (
                  <div
                    key={b.label}
                    title={`${b.label}: ${formatCurrency(b.sum)}`}
                    className="h-full min-w-[6px] transition-all duration-slow ease-out first:rounded-s-full last:rounded-e-full"
                    style={{ width: `${(b.sum / total) * 100}%`, backgroundColor: b.color }}
                  />
                ),
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {buckets.map((b) => (
              <li key={b.label} className={cn('flex items-center gap-2.5 text-sm transition-opacity', b.sum <= 0 && 'opacity-35')}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="flex-1 font-medium">{b.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {b.n} {b.n > 2 && b.n < 11 ? 'موردين' : 'مورد'}
                </span>
                <span className="w-24 text-end font-bold tabular-nums">{formatCurrency(b.sum)}</span>
                <span className="w-9 text-end text-[11px] tabular-nums text-muted-foreground">
                  {Math.round((b.sum / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** بوليصة المورد — شريط تحذير بلون الحالة، ختم، خط تقطيع بثقبين، وتحته الأرقام والأزرار */
function SupplierSlip({
  c,
  index,
  onOpen,
  onPay,
  onEdit,
  onDelete,
}: {
  c: Supplier
  index: number
  onOpen: () => void
  onPay: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const color = colorOf(c.name)
  const tone = toneOf(c.balance)
  const t = TONES[tone]
  const hasDebt = c.balance > 0
  const purchases = c.totalPurchases ?? 0
  const paidPct = hasDebt && purchases > 0 ? Math.min(Math.max(((purchases - c.balance) / purchases) * 100, 0), 100) : 0
  const orders = c._count?.purchaseOrders ?? 0
  const lastDeal = c.lastPurchaseAt
    ? new Date(c.lastPurchaseAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
    : '—'

  return (
    <article
      className="animate-in-up motion-reduce:animate-none group relative flex flex-col rounded-3xl border bg-card shadow-sm transition-all duration-base ease-out hover:-translate-y-1.5 hover:shadow-2xl"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* ═══ رأس البوليصة ═══ */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`كشف حساب ${c.name}`}
        className="relative block overflow-hidden rounded-t-3xl text-start outline-none focus-visible:ring-[3px] focus-visible:ring-orange-500/40"
      >
        <div
          aria-hidden
          className="h-2"
          style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${t.color} 0 8px, transparent 8px 16px)` }}
        />
        <div className="relative p-5 pb-6" style={{ backgroundImage: `linear-gradient(180deg, ${t.color}14, transparent)` }}>
          <div className="flex items-start gap-3">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold text-white shadow-md"
              style={{ backgroundColor: color }}
            >
              {c.name?.charAt(0) ?? '?'}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-lg font-extrabold leading-snug break-words [overflow-wrap:anywhere]">{c.name}</p>
              <PhoneTag phone={c.phone} className="mt-1.5" />
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">
                {hasDebt ? 'المستحق له عليك' : tone === 'credit' ? 'ليك عنده' : 'الرصيد'}
              </p>
              <p className="mt-0.5 text-4xl leading-none font-extrabold tracking-tight tabular-nums" style={{ color: t.color }}>
                {num(Math.abs(c.balance))}
                <span className="ms-1.5 text-sm font-semibold text-muted-foreground">جنيه</span>
              </p>
            </div>
            {/* الختم */}
            <span
              aria-hidden
              className="shrink-0 -rotate-6 rounded-lg border-2 px-2.5 py-1 text-[11px] font-extrabold tracking-wide transition-transform duration-base group-hover:-rotate-3 group-hover:scale-105"
              style={{ color: t.color, borderColor: t.color, backgroundColor: `${t.color}10` }}
            >
              {t.label}
            </span>
          </div>

          {hasDebt && purchases > 0 && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${t.color}26` }}>
                <div
                  className="h-full rounded-full transition-all duration-slow ease-out"
                  style={{ width: `${Math.max(paidPct, 3)}%`, backgroundColor: '#059669' }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                اتسدّد {paidPct.toFixed(paidPct >= 10 ? 0 : 1)}% من مشترياتك منه
              </p>
            </div>
          )}
        </div>
      </button>

      {/* ═══ خط التقطيع ═══ */}
      <div aria-hidden className="relative h-0 border-t-2 border-dashed border-border">
        <span className="absolute -start-2.5 top-0 size-5 -translate-y-1/2 rounded-full border bg-background shadow-inner" />
        <span className="absolute -end-2.5 top-0 size-5 -translate-y-1/2 rounded-full border bg-background shadow-inner" />
      </div>

      {/* ═══ كعب البوليصة ═══ */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="grid grid-cols-3 divide-x divide-x-reverse text-center">
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">الأوامر</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums">{num(orders)}</p>
          </div>
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">المشتريات</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums">{num(purchases)}</p>
          </div>
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">آخر تعامل</p>
            <p className="mt-0.5 text-sm font-extrabold">{lastDeal}</p>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2">
          {hasDebt ? (
            <Button
              onClick={onPay}
              className="flex-1 rounded-xl border-0 bg-orange-600 font-semibold text-white hover:bg-orange-500"
            >
              <HandCoins className="size-4" />
              سدّد دفعة
            </Button>
          ) : (
            <Button variant="outline" className="flex-1 rounded-xl font-semibold" onClick={onOpen}>
              <Eye className="size-4" />
              كشف الحساب
            </Button>
          )}
          {hasDebt && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl border text-muted-foreground"
              onClick={onOpen}
              title="كشف الحساب"
              aria-label="كشف الحساب"
            >
              <Eye className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl border text-muted-foreground"
            onClick={onEdit}
            title="تعديل"
            aria-label="تعديل"
          >
            <Pencil className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-xl border text-muted-foreground"
                aria-label="خيارات"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="size-4" />
                حذف
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  )
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: Supplier | null
  onSaved: () => void
}

function SupplierDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setPhone(initial?.phone ?? '')
    }
  }, [open, initial])

  const submit = async () => {
    if (!name.trim()) {
      toast.error('الاسم مطلوب')
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null }
      if (initial) {
        await api(`/api/suppliers/${initial.id}`, {
          method: 'PUT',
          body: payload,
        })
        toast.success('تم تحديث المورد')
      } else {
        await api('/api/suppliers', { method: 'POST', body: payload })
        toast.success('تمت إضافة المورد')
      }
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
        <div
          aria-hidden
          className="h-2 w-full"
          style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${ACCENT} 0 10px, transparent 10px 20px)` }}
        />
        <DialogHeader className="border-b bg-orange-500/[0.07] p-5 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
              {initial ? <Pencil className="size-5" /> : <Truck className="size-5" />}
            </span>
            {initial ? 'تعديل مورد' : 'مورد جديد'}
          </DialogTitle>
          <DialogDescription>
            {initial ? 'عدّل بيانات المورد — رصيده ومشترياته زي ما هم.' : 'سجّل بيانات المورد علشان تتابع مشترياتك منه واللي عليك له.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <Label htmlFor="s-name">
              الاسم <span className="text-destructive">*</span>
            </Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-phone">الهاتف</Label>
            <div className="relative">
              <Smartphone className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="s-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
                placeholder="اختياري"
                className="h-11 pr-9"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button
            size="lg"
            onClick={submit}
            disabled={saving}
            className="min-w-32 border-0 bg-orange-600 text-white hover:bg-orange-500"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
