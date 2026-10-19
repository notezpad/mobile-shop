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
  Users,
  UserPlus,
  Phone,
  MoreVertical,
  Check,
  X,
  ShoppingBag,
  CheckCircle2,
  Crown,
  ReceiptText,
  BarChart3,
  Percent,
  Receipt,
  UserCheck,
  UserX,
  Clock,
  Wallet,
  AlertCircle,
  CalendarDays,
  ArrowUpDown,
  ChevronDown,
  HandCoins,
} from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { formatCurrency, formatArabicDate } from '@/lib/format'
import { useConfirm } from './ConfirmDialogProvider'
import { CustomerDetailDialog } from './CustomerDetailDialog'
import { PaymentDialog } from './PaymentDialog'
import { DialogHero as CustomerHero } from './customer-dialog-ui'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Customer {
  id: number
  name: string
  phone: string | null
  balance: number
  _count?: { sales: number }
  totalPurchases?: number
  lastSaleAt?: string | null
}

export function CustomersView() {
  const confirm = useConfirm()
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Customer | null>(null)
  const [detailCustomer, setDetailCustomer] = React.useState<Customer | null>(
    null
  )

  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : ''
      const data = await api<Customer[]>(`/api/customers${params}`)
      if (Array.isArray(data)) setCustomers(data)
    } catch (e: any) {
      // ⚡ Offline: don't show scary error — data stays as-is
      if (!e?.message?.includes('لا توجد بيانات')) {
        toast.error(e?.message || 'فشل تحميل العملاء')
      }
    } finally {
      setLoading(false)
    }
  }, [search])

  React.useEffect(() => {
    // ⚡ v10: الديباونس للتايبينج بس — أول تحميل (مفيش بحث) يبدأ فوراً.
    // مع كاش SWR (api-offline.ts) الزيارة المتكررة بترجع من الميموري فوراً أصلاً.
    const t = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh — e.g. a payment added from
  // CustomerDetailDialog (which sits on top of this list) now updates the
  // balance shown here instantly, no hard refresh needed.
  useDataRefresh(['customers'], load)

  const exportExcel = () => {
    if (customers.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('قائمة-العملاء'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'قائمة العملاء',
      sheetName: 'العملاء',
      columns: [
        { header: 'الاسم', key: 'name', format: 'text' },
        { header: 'الهاتف', key: 'phone', format: 'text' },
        { header: 'عدد الفواتير', key: 'salesCount', format: 'int' },
        { header: 'إجمالي المشتريات', key: 'totalPurchases', format: 'currency' },
        { header: 'الرصيد المستحق', key: 'balance', format: 'currency' },
        { header: 'آخر عملية شراء', key: 'lastSaleAt', format: 'text' },
      ],
      rows: customers.map((c) => ({
        name: c.name,
        phone: c.phone || '-',
        salesCount: c._count?.sales ?? 0,
        totalPurchases: c.totalPurchases ?? 0,
        balance: c.balance,
        lastSaleAt: c.lastSaleAt ? new Date(c.lastSaleAt).toLocaleDateString('ar-EG') : '-',
      })),
      totals: {
        name: 'الإجمالي',
        totalPurchases: customers.reduce((s, c) => s + (c.totalPurchases ?? 0), 0),
        balance: customers.reduce((s, c) => s + c.balance, 0),
      },
    })
  }

  const remove = async (id: number) => {
    // 🛡️ 2026-09-30 (N4 + C7): تحذير واضح قبل الحذف — والسيرفر نفسه بيمنع
    // حذف أي عميل عليه رصيد أو له سجل فواتير/دفعات (أدمن بس كمان).
    const target = customers.find((c) => c.id === id)
    if (target && Math.abs(target.balance) > 0.005) {
      toast.error(
        target.balance > 0
          ? `العميل ${target.name} عليه مديونية ${target.balance.toFixed(2)} — صفّي الحساب الأول (النظام ممنوع يحذفه)`
          : `العميل ${target.name} له رصيد دائن ${Math.abs(target.balance).toFixed(2)} — ارجع له الفلوس الأول`,
      )
      return
    }
    if (target && (target._count?.sales ?? 0) > 0) {
      toast.error(
        `العميل ${target.name} له سجل فواتير (${target._count?.sales}) — لا يمكن حذفه حفاظاً على الحسابات`,
      )
      return
    }
    if (!(await confirm('حذف العميل؟ (الحذف متاح فقط لعملاء بدون أي سجل مالي)'))) return
    // ⚡ Optimistic: remove from list immediately
    const removed = customers.find((c) => c.id === id)
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    try {
      await api(`/api/customers/${id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      if (typeof navigator === 'undefined' || navigator.onLine) load()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم الحذف (offline — سيتم المزامنة لاحقاً)')
      } else {
        if (removed) setCustomers((prev) => [removed, ...prev])
        toast.error(e?.message || 'فشل الحذف')
      }
    }
  }

  // آخر نسخة كاملة من القائمة (من غير بحث) — الإحصائيات بتعتمد عليها علشان متتغيّرش وقت البحث
  const [fullList, setFullList] = React.useState<Customer[]>([])
  React.useEffect(() => {
    if (!search.trim()) setFullList(customers)
  }, [customers, search])
  const base = fullList.length > 0 ? fullList : customers

  // Total outstanding debt = sum of positive balances
  const totalDebt = React.useMemo(
    () => base.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0),
    [base]
  )

  /* ───────── أرقام العرض فقط (مشتقة من نفس البيانات — بدون أي منطق جديد) ───────── */
  const view = React.useMemo(() => {
    const debtors = base.filter((c) => c.balance > 0)
    const top = [...debtors].sort((x, y) => y.balance - x.balance)
    const purchases = base.reduce((s, c) => s + (c.totalPurchases ?? 0), 0)
    const salesCount = base.reduce((s, c) => s + (c._count?.sales ?? 0), 0)
    const credits = base.filter((c) => c.balance < 0)
    const age = (c: Customer) => (c.lastSaleAt ? daysSince(c.lastSaleAt) : Infinity)
    const lateDebtors = debtors.filter((c) => age(c) > 30)
    const idle = base.filter((c) => age(c) > 30)
    const buckets = [
      { label: 'حتى ٧ أيام', color: '#10b981', sum: 0, n: 0 },
      { label: '٨ – ٣٠ يوم', color: '#f59e0b', sum: 0, n: 0 },
      { label: '٣١ – ٩٠ يوم', color: '#f97316', sum: 0, n: 0 },
      { label: 'أكتر من ٩٠ يوم', color: '#f43f5e', sum: 0, n: 0 },
    ]
    for (const c of debtors) {
      const d = age(c)
      const i = d <= 7 ? 0 : d <= 30 ? 1 : d <= 90 ? 2 : 3
      buckets[i].sum += c.balance
      buckets[i].n += 1
    }
    const buyers = [...base]
      .filter((c) => (c.totalPurchases ?? 0) > 0)
      .sort((x, y) => (y.totalPurchases ?? 0) - (x.totalPurchases ?? 0))
    return {
      debtorsCount: debtors.length,
      top,
      maxDebt: top[0]?.balance ?? 0,
      purchases,
      salesCount,
      avgInvoice: salesCount > 0 ? purchases / salesCount : 0,
      avgCustomer: base.length > 0 ? purchases / base.length : 0,
      collectionPct: purchases > 0 ? Math.min(Math.max(((purchases - totalDebt) / purchases) * 100, 0), 100) : 0,
      lateDebt: lateDebtors.reduce((s, c) => s + c.balance, 0),
      lateCount: lateDebtors.length,
      idleCount: idle.length,
      creditSum: credits.reduce((s, c) => s + Math.abs(c.balance), 0),
      creditCount: credits.length,
      buckets,
      buyers,
      // أفضل عميل = الأعلى مشتريات (بيظهر بس لو فيه أكتر من عميل)
      topBuyerId: base.length >= 2 && buyers[0] ? buyers[0].id : null,
    }
  }, [base, totalDebt])

  /* ───────── الفلاتر والترتيب (عرض فقط على القايمة اللي اتحمّلت) ───────── */
  const [status, setStatus] = React.useState<StatusFilter>('all')

  // 🆕 2026-10-20: جاي من الداشبورد (المركز المالي ← ديون العملاء) بـ ?status=debt
  // → الفلتر بيتفعّل لوحده والعميل يلاقي المديونين قدامه
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('status') === 'debt') {
        url.searchParams.delete('status')
        window.history.replaceState(null, '', url.pathname + url.search)
        setStatus('debt')
        toast.info('العملاء اللي عليهم آجل قدامك')
      }
    } catch { /* ignore */ }
  }, [])

  // 🆕 2026-10-20: تحصيل فوري من كارت العميل — بدل 3 ضغطات (كشف الحساب ← الدفعات ← تسجيل دفعة)
  const [payTarget, setPayTarget] = React.useState<{ id: number; name: string; balance: number } | null>(null)
  const [sort, setSort] = React.useState<SortKey>('default')
  const counts = React.useMemo(
    () => ({
      all: customers.length,
      debt: customers.filter((c) => c.balance > 0).length,
      clear: customers.filter((c) => c.balance === 0).length,
      credit: customers.filter((c) => c.balance < 0).length,
      idle: customers.filter((c) => (c.lastSaleAt ? daysSince(c.lastSaleAt) : Infinity) > 30).length,
    }),
    [customers]
  )
  const shown = React.useMemo(() => {
    let rows = customers.filter((c) => {
      if (status === 'debt') return c.balance > 0
      if (status === 'clear') return c.balance === 0
      if (status === 'credit') return c.balance < 0
      if (status === 'idle') return (c.lastSaleAt ? daysSince(c.lastSaleAt) : Infinity) > 30
      return true
    })
    if (sort !== 'default') {
      rows = [...rows].sort((x, y) => {
        if (sort === 'debt') return y.balance - x.balance
        if (sort === 'purchases') return (y.totalPurchases ?? 0) - (x.totalPurchases ?? 0)
        if (sort === 'recent')
          return (y.lastSaleAt ? new Date(y.lastSaleAt).getTime() : 0) - (x.lastSaleAt ? new Date(x.lastSaleAt).getTime() : 0)
        return x.name.localeCompare(y.name, 'ar')
      })
    }
    return rows
  }, [customers, status, sort])
  const hasFilters = status !== 'all' || sort !== 'default' || search.trim() !== ''
  const clearFilters = () => {
    setStatus('all')
    setSort('default')
    setSearch('')
  }
  const shownDebt = shown.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0)
  const shownPurchases = shown.reduce((s, c) => s + (c.totalPurchases ?? 0), 0)

  const [statsOpen, setStatsOpen] = React.useState(true)
  const noData = loading && customers.length === 0
  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (c: Customer) => {
    setEditing(c)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═════════ Hero — "دفتر الديون": لوحة مضغوطة بصف واحد ═════════ */}
      <section
        className="animate-in-up relative overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm"
        style={{
          background:
            'radial-gradient(620px 240px at 100% 0%, rgba(14,165,233,0.15), transparent), radial-gradient(520px 240px at 0% 100%, rgba(99,102,241,0.10), transparent)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage: 'radial-gradient(rgba(14,165,233,0.16) 1px, transparent 1.2px)',
            backgroundSize: '16px 16px',
            maskImage: 'linear-gradient(to left, black, transparent 65%)',
            WebkitMaskImage: 'linear-gradient(to left, black, transparent 65%)',
          }}
        />

        {/* 📱 موبايل: العنوان + الرقم + صحة التحصيل + الأزرار (كل واحد بعرض كامل)
            من sm+ وفوق: صف أفقي واحد زي الأصل */}
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 p-4 sm:gap-x-8 sm:gap-y-5 sm:p-6">
          <div className="w-full min-w-0 sm:w-auto sm:min-w-[230px]">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-md shadow-sky-500/25">
                <Users className="size-[18px]" />
              </span>
              <div>
                <h1 className="text-lg font-extrabold leading-tight">العملاء</h1>
                <p className="text-[11px] text-muted-foreground">سجل العملاء وأرصدتهم والدفعات</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-medium text-muted-foreground sm:mt-4">إجمالي المستحق عند العملاء</p>
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-l from-sky-600 to-indigo-600 bg-clip-text text-4xl font-extrabold tracking-tight tabular-nums text-transparent sm:text-5xl dark:from-sky-300 dark:to-indigo-300">
                {noData ? '—' : num(totalDebt)}
              </span>
              <span className="text-sm font-semibold text-muted-foreground sm:text-base">جنيه</span>
            </div>
          </div>

          <div className="w-full min-w-0 sm:min-w-[300px] sm:flex-1">
            <HealthPanel
              hidden={noData}
              collected={Math.max(view.purchases - totalDebt, 0)}
              recent={Math.max(totalDebt - view.lateDebt, 0)}
              late={view.lateDebt}
              topDebtor={view.top[0]}
            />
          </div>

          {/* 📱 موبايل: زرارين جنب بعض بنفس العرض — من sm+ وفوق: صف أفقي عادي */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto lg:flex-col lg:items-stretch">
            <Button variant="gradient" size="lg" onClick={openAdd} className="w-full sm:w-auto lg:w-auto">
              <Plus className="size-4" />
              عميل جديد
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={customers.length === 0} className="w-full sm:w-auto lg:w-auto">
              <FileSpreadsheet className="size-4" />
              تصدير Excel
            </Button>
          </div>
        </div>
      </section>

      {/* ═════════ مركز الإحصائيات ═════════ */}
      {base.length > 0 && (
        <section className="animate-in-up stagger-1 space-y-3 sm:space-y-4">
          <button
            type="button"
            onClick={() => setStatsOpen((o) => !o)}
            aria-expanded={statsOpen}
            className="group flex w-full items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5 text-start shadow-sm transition-colors hover:bg-muted/40 sm:px-3.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <BarChart3 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold leading-tight sm:text-base">إحصائيات العملاء</h2>
              <p className="text-[11px] text-muted-foreground">صورة سريعة عن ديونك ومبيعاتك وعملائك</p>
            </div>
            {/* ملخص مختصر يظهر وقت الطي — مخفي على الموبايل الضيق */}
            {!statsOpen && (
              <div className="hidden items-center gap-2 text-[11px] md:flex">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  تحصيل {view.purchases > 0 ? `${Math.round(view.collectionPct)}%` : '—'}
                </span>
                <span className="rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-600 dark:text-rose-400">
                  متأخر {num(view.lateDebt)}
                </span>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-600 dark:text-amber-400">
                  خاملون {num(view.idleCount)}
                </span>
              </div>
            )}
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {statsOpen ? 'إخفاء' : 'عرض'}
              <ChevronDown className={cn('size-4 transition-transform duration-base', statsOpen && 'rotate-180')} />
            </span>
          </button>

          {statsOpen && (
            <div className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                <KpiTile
                  color="#6366f1" icon={ShoppingBag} label="إجمالي المشتريات"
                  value={num(view.purchases)} unit="جنيه"
                  sub={`${num(view.salesCount)} فاتورة من ${num(base.length)} ${base.length > 2 && base.length < 11 ? 'عملاء' : 'عميل'}`}
                />
                <KpiTile
                  color="#10b981" icon={Percent} label="نسبة التحصيل"
                  value={view.purchases > 0 ? `${view.collectionPct.toFixed(view.collectionPct >= 10 ? 0 : 1)}%` : '—'}
                  sub={view.purchases > 0 ? `اتحصّل ${num(Math.max(view.purchases - totalDebt, 0))} جنيه` : 'لسه مفيش مشتريات'}
                  progress={view.purchases > 0 ? view.collectionPct : undefined}
                />
                <KpiTile
                  color="#14b8a6" icon={Receipt} label="متوسط قيمة الفاتورة"
                  value={num(Math.round(view.avgInvoice))} unit="جنيه"
                  sub={`على ${num(view.salesCount)} فاتورة`}
                />
                <KpiTile
                  color="#8b5cf6" icon={UserCheck} label="متوسط مشتريات العميل"
                  value={num(Math.round(view.avgCustomer))} unit="جنيه"
                  sub="لكل عميل في السجل"
                />
                <KpiTile
                  color="#f43f5e" icon={Clock} label="ديون متأخرة +٣٠ يوم"
                  value={num(view.lateDebt)} unit="جنيه"
                  sub={view.lateCount > 0 ? `على ${num(view.lateCount)} ${view.lateCount > 2 && view.lateCount < 11 ? 'عملاء' : 'عميل'} من غير تعامل` : 'مفيش ديون متأخرة'}
                  progress={totalDebt > 0 ? (view.lateDebt / totalDebt) * 100 : undefined}
                  progressLabel={totalDebt > 0 ? `${Math.round((view.lateDebt / totalDebt) * 100)}% من الديون` : undefined}
                />
                <KpiTile
                  color="#f59e0b" icon={UserX} label="عملاء خاملون +٣٠ يوم"
                  value={num(view.idleCount)} unit="عميل"
                  sub={base.length > 0 ? `${Math.round((view.idleCount / base.length) * 100)}% من العملاء من غير تعامل` : ''}
                  progress={base.length > 0 ? (view.idleCount / base.length) * 100 : undefined}
                />
                <KpiTile
                  color="#0ea5e9" icon={Wallet} label="أرصدة دائنة للعملاء"
                  value={num(view.creditSum)} unit="جنيه"
                  sub={view.creditCount > 0 ? `${num(view.creditCount)} عميل ليهم فلوس عندك` : 'مفيش أرصدة دائنة'}
                />
                <KpiTile
                  color="#ec4899" icon={AlertCircle} label="عملاء عليهم آجل"
                  value={num(view.debtorsCount)} unit="عميل"
                  sub={base.length > 0 ? `${Math.round((view.debtorsCount / base.length) * 100)}% من العملاء` : ''}
                  progress={base.length > 0 ? (view.debtorsCount / base.length) * 100 : undefined}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <TopBuyers rows={view.buyers.slice(0, 5)} total={view.purchases} onOpen={(c) => setDetailCustomer(c)} />
                <DebtAging buckets={view.buckets} total={totalDebt} />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ═════════ الفلاتر ═════════ */}
      <div className="animate-in-up stagger-2 space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        {/* البحث + العدّاد */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
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
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
            <Users className="size-3.5" />
            <span className="tabular-nums text-foreground">{num(shown.length)}</span>
            من {num(customers.length)}
          </span>
        </div>

        {/* حالة الحساب — 📱 موبايل: العنوان فوق والأقراص تلف بشكل مرتب.
            من sm+ وفوق: العنوان جنب الأقراص زي الأصل. */}
        <div className="space-y-1.5 sm:flex sm:items-center sm:gap-1.5 sm:space-y-0">
          <span className="block text-[11px] font-semibold text-muted-foreground sm:me-1 sm:shrink-0 sm:self-auto">
            الحالة
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={status === 'all'} onClick={() => setStatus('all')} count={counts.all}>
              الكل
            </FilterPill>
            <FilterPill active={status === 'debt'} onClick={() => setStatus(status === 'debt' ? 'all' : 'debt')} count={counts.debt} color="#f43f5e">
              عليهم آجل
            </FilterPill>
            <FilterPill active={status === 'clear'} onClick={() => setStatus(status === 'clear' ? 'all' : 'clear')} count={counts.clear} color="#10b981">
              مسوّى
            </FilterPill>
            <FilterPill active={status === 'credit'} onClick={() => setStatus(status === 'credit' ? 'all' : 'credit')} count={counts.credit} color="#0ea5e9">
              رصيد دائن
            </FilterPill>
            <FilterPill active={status === 'idle'} onClick={() => setStatus(status === 'idle' ? 'all' : 'idle')} count={counts.idle} color="#f59e0b">
              خاملون +٣٠ يوم
            </FilterPill>
          </div>
        </div>

        {/* الترتيب — نفس المنطق */}
        <div className="space-y-1.5 sm:flex sm:items-center sm:gap-1.5 sm:space-y-0">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground sm:me-1 sm:shrink-0 sm:self-auto">
            <ArrowUpDown className="size-3" />
            ترتيب
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['debt', 'الأعلى مديونية'],
                ['purchases', 'الأكثر مشتريات'],
                ['recent', 'الأحدث تعاملاً'],
                ['name', 'الاسم (أ – ي)'],
              ] as [SortKey, string][]
            ).map(([k, l]) => (
              <FilterPill key={k} active={sort === k} onClick={() => setSort(sort === k ? 'default' : k)} color="#6366f1">
                {l}
              </FilterPill>
            ))}
          </div>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                النتائج: <b className="tabular-nums text-foreground">{num(shown.length)}</b> عميل
              </span>
              <span>
                مستحق: <b className="tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(shownDebt)}</b>
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

      {/* ═════════ كروت العملاء ═════════ */}
      {loading && customers.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[340px] w-full rounded-3xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card className="animate-in-up">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
              <Users className="size-8" />
            </div>
            <div>
              <p className="text-base font-semibold">
                {hasFilters ? 'مفيش نتائج مطابقة' : 'لسه مفيش عملاء'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters
                  ? 'جرّب تغيّر الفلاتر أو كلمة البحث'
                  : 'ضيف أول عميل علشان تتابع حسابه ومشترياته'}
              </p>
            </div>
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                مسح الفلاتر
              </Button>
            ) : (
              <Button variant="gradient" onClick={openAdd}>
                <Plus className="size-4" />
                عميل جديد
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] sm:gap-5',
            loading && 'opacity-60 transition-opacity',
          )}
        >
          {shown.map((c, i) => (
            <CustomerCard
              key={c.id}
              c={c}
              index={i}
              isTop={c.id === view.topBuyerId}
              onOpen={() => setDetailCustomer(c)}
              onEdit={() => openEdit(c)}
              onDelete={() => remove(c.id)}
              onPay={c.balance > 0 ? () => setPayTarget({ id: c.id, name: c.name, balance: c.balance }) : undefined}
            />
          ))}
          {!hasFilters && (
            <button
              type="button"
              onClick={openAdd}
              className="animate-in-up group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-card/40 p-6 text-center transition-all duration-base ease-out hover:-translate-y-1.5 hover:border-sky-500/60 hover:bg-sky-500/5"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg shadow-sky-500/25 transition-transform duration-base group-hover:scale-110 group-hover:rotate-90">
                <Plus className="size-6" />
              </span>
              <span>
                <span className="block text-sm font-bold">إضافة عميل جديد</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">سجّل اسمه ورقمه وابدأ حسابه</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* زر عائم للموبايل */}
      <Button
        variant="gradient"
        size="icon-lg"
        onClick={openAdd}
        className="fixed bottom-5 left-5 z-30 rounded-full shadow-xl sm:hidden"
        aria-label="عميل جديد"
      >
        <Plus className="size-6" />
      </Button>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={() => {
          // ⚡ Optimistic: if offline, load() will fail — but we can try
          load()
        }}
      />

      <CustomerDetailDialog
        open={detailCustomer !== null}
        onOpenChange={(o) => !o && setDetailCustomer(null)}
        customerId={detailCustomer?.id ?? null}
        customerName={detailCustomer?.name}
      />
      {/* 🆕 2026-10-20: تحصيل فوري من كارت العميل — نفس نافذة الدفعة المستعملة في كشف الحساب */}
      <PaymentDialog
        open={payTarget !== null}
        onOpenChange={(o) => { if (!o) setPayTarget(null) }}
        customerId={payTarget?.id ?? null}
        customerName={payTarget?.name ?? ''}
        currentBalance={payTarget?.balance ?? 0}
        onSaved={() => setPayTarget(null)}
      />
    </div>
  )
}

/* ───────────────────────── مكوّنات صغيرة ───────────────────────── */

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

// لون ثابت لكل عميل (من الاسم) — نفس العميل دايماً بنفس اللون
const AVATAR_COLORS = ['#0ea5e9', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#f97316']
function colorOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

type StatusFilter = 'all' | 'debt' | 'clear' | 'credit' | 'idle'
type SortKey = 'default' | 'debt' | 'purchases' | 'recent' | 'name'

const daysSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000

/** قرص فلتر بعدّاد — نفس عائلة أقراص الخزنة بس بلون لكل حالة */
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
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-xs',
        active
          ? color
            ? 'border-transparent text-white shadow-sm'
            : 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {color && !active && <i className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'min-w-5 rounded-full px-1.5 text-center text-[10px] font-bold tabular-nums',
            active ? 'bg-white/25' : 'bg-muted text-foreground/70',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** بطاقة مؤشر إحصائي — حد علوي ملوّن + علامة مائية + شريط تقدّم اختياري */
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
      className="relative overflow-hidden rounded-2xl border border-t-2 bg-card p-3 transition-shadow hover:shadow-md sm:p-4"
      style={{ borderTopColor: color, backgroundImage: `linear-gradient(135deg, ${color}14, transparent 60%)` }}
    >
      <Icon
        strokeWidth={1.25}
        className="pointer-events-none absolute -bottom-4 -start-3 size-20 opacity-[0.07] sm:size-24"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-xl sm:size-8"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon className="size-3.5 sm:size-4" />
          </span>
        </div>
        <p className="mt-1.5 truncate text-xl font-extrabold tabular-nums sm:mt-2 sm:text-2xl">
          {value}
          {unit && <span className="ms-1 text-[10px] font-medium text-muted-foreground sm:text-[11px]">{unit}</span>}
        </p>
        {sub && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground sm:mt-1 sm:text-[11px]">{sub}</p>}
        {progress !== undefined && (
          <div className="mt-2 flex items-center gap-2 sm:mt-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: `${color}22` }}>
              <div
                className="h-full rounded-full transition-[width] duration-slow ease-out"
                style={{ width: `${Math.min(100, Math.max(progress, 2))}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
              {progressLabel ?? `${Math.round(progress)}%`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** أفضل العملاء بالمشتريات — ترتيب بميداليات وأعمدة نسبية */
function TopBuyers({
  rows,
  total,
  onOpen,
}: {
  rows: Customer[]
  total: number
  onOpen: (c: Customer) => void
}) {
  const medals = ['#f59e0b', '#94a3b8', '#c2410c']
  const max = rows[0]?.totalPurchases ?? 0
  return (
    <div className="rounded-2xl border bg-card p-3.5 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Crown className="size-4 shrink-0 text-amber-500" />
          أفضل العملاء بالمشتريات
        </h3>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">اضغط لفتح كشف الحساب</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">لسه مفيش مشتريات مسجّلة</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const v = r.totalPurchases ?? 0
            const color = medals[i] ?? '#0ea5e9'
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  className="flex w-full items-center gap-2.5 rounded-xl p-2 text-start transition-colors hover:bg-muted/60 sm:gap-3"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white sm:size-8"
                    style={{ backgroundColor: color }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{r.name}</span>
                      <span className="shrink-0 text-sm font-extrabold tabular-nums">{num(v)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-slow ease-out"
                          style={{ width: `${max > 0 ? Math.max((v / max) * 100, 4) : 0}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="w-9 text-end text-[10px] tabular-nums text-muted-foreground">
                        {total > 0 ? `${Math.round((v / total) * 100)}%` : ''}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** أعمار الديون — المديونية موزّعة حسب الوقت من آخر تعامل مع العميل */
function DebtAging({
  buckets,
  total,
}: {
  buckets: { label: string; color: string; sum: number; n: number }[]
  total: number
}) {
  return (
    <div className="rounded-2xl border bg-card p-3.5 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <CalendarDays className="size-4 shrink-0 text-rose-500" />
          أعمار الديون
        </h3>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">من آخر تعامل مع العميل</span>
      </div>
      {total <= 0 ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5 text-emerald-500" />
          مفيش ديون حالياً
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
              <li key={b.label} className={cn('flex items-center gap-2 text-sm transition-opacity sm:gap-2.5', b.sum <= 0 && 'opacity-35')}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="flex-1 truncate font-medium">{b.label}</span>
                <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
                  {b.n} {b.n > 2 && b.n < 11 ? 'عملاء' : 'عميل'}
                </span>
                <span className="text-xs font-bold tabular-nums sm:w-24 sm:text-end sm:text-sm">{formatCurrency(b.sum)}</span>
                <span className="w-9 shrink-0 text-end text-[11px] tabular-nums text-muted-foreground">
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

/** صحة التحصيل — عدّاد دائري + شريط واحد يقسّم مشتريات العملاء: محصّل / مستحق حديث / متأخر */
function HealthPanel({
  collected,
  recent,
  late,
  topDebtor,
  hidden,
}: {
  collected: number
  recent: number
  late: number
  topDebtor?: Customer
  hidden?: boolean
}) {
  if (hidden) return <div />
  const denom = collected + recent + late
  if (denom <= 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-card/60 p-3 text-sm text-muted-foreground sm:p-4">
        <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
        <span className="text-[12px] sm:text-sm">لسه مفيش مشتريات مسجّلة — أول فاتورة هتظهر هنا صحة التحصيل</span>
      </div>
    )
  }
  const pct = (collected / denom) * 100
  const R = 38
  const C = 2 * Math.PI * R
  const segs = [
    { label: 'محصّل', short: 'محصّل', value: collected, color: '#10b981' },
    { label: 'مستحق حديث', short: 'مستحق', value: recent, color: '#f59e0b' },
    { label: 'متأخر +٣٠ يوم', short: 'متأخر', value: late, color: '#f43f5e' },
  ]

  return (
    <div className="rounded-2xl border bg-card/70 p-3.5 sm:p-4">
      {/* ═══ الصف الأول: الدائرة + العنوان + أكبر مدين (كله في صف واحد) ═══ */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* العدّاد الدائري */}
        <div className="relative size-[78px] shrink-0 sm:size-[104px]">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth="11" className="stroke-muted" />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="11"
              strokeLinecap="round"
              stroke="#10b981"
              strokeDasharray={C}
              strokeDashoffset={C - (C * Math.max(pct, 1)) / 100}
              className="transition-[stroke-dashoffset] duration-slow ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-extrabold leading-none tabular-nums sm:text-2xl">
              {pct.toFixed(pct >= 10 ? 0 : 1)}
              <span className="text-[9px] font-bold sm:text-xs">%</span>
            </span>
            <span className="mt-0.5 text-[9px] text-muted-foreground sm:mt-1 sm:text-[10px]">تحصيل</span>
          </div>
        </div>

        {/* العنوان + أكبر مدين */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground/85 sm:text-base">صحة التحصيل</p>
          {topDebtor ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">
              أكبر مدين:{' '}
              <b className="font-bold text-foreground/80">{topDebtor.name}</b>{' '}
              <span className="tabular-nums text-rose-600 dark:text-rose-400">{num(topDebtor.balance)}</span>
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">مفيش مدينين حالياً</p>
          )}
        </div>
      </div>

      {/* ═══ الشريط — بعرض كامل تحتهم ═══ */}
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full sm:mt-4">
        {segs.map(
          (g) =>
            g.value > 0 && (
              <div
                key={g.label}
                title={`${g.label}: ${formatCurrency(g.value)}`}
                className="h-full min-w-[6px] transition-all duration-slow ease-out first:rounded-s-full last:rounded-e-full"
                style={{ width: `${(g.value / denom) * 100}%`, backgroundColor: g.color }}
              />
            ),
        )}
      </div>

      {/* ═══ المفتاح — 3 أعمدة دايماً حتى على الموبايل ═══ */}
      <ul className="mt-3 grid grid-cols-3 gap-x-2 sm:gap-x-4">
        {segs.map((g) => (
          <li key={g.label} className={cn('min-w-0', g.value <= 0 && 'opacity-40')}>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground sm:text-[11px]">
              <span className="size-1.5 shrink-0 rounded-full sm:size-2" style={{ backgroundColor: g.color }} />
              <span className="truncate">
                <span className="sm:hidden">{g.short}</span>
                <span className="hidden sm:inline">{g.label}</span>
              </span>
            </span>
            <span className="mt-0.5 block text-sm font-extrabold leading-tight tabular-nums text-foreground sm:text-base">
              {num(g.value)}
            </span>
            <span className="text-[9px] tabular-nums text-muted-foreground sm:text-[10px]">
              {Math.round((g.value / denom) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** يغمّق لون hex بنسبة (0–1) — لتدرج وجه البطاقة */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** كارت العميل — بطاقة حساب: وجه بلون العميل (شريحة + اسم + هاتف + رصيد) وتحته ظهر بالأرقام والأزرار */
function CustomerCard({
  c,
  index,
  isTop,
  onOpen,
  onEdit,
  onDelete,
  onPay,
}: {
  c: Customer
  index: number
  isTop?: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onPay?: () => void
}) {
  const color = colorOf(c.name)
  const hasDebt = c.balance > 0
  const hasCredit = c.balance < 0
  const tone = hasDebt ? '#e11d48' : hasCredit ? '#0284c7' : '#059669'
  const purchases = c.totalPurchases ?? 0
  const unpaidPct = hasDebt && purchases > 0 ? Math.min((c.balance / purchases) * 100, 100) : 0
  const sales = c._count?.sales ?? 0
  const lastDeal = c.lastSaleAt
    ? new Date(c.lastSaleAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
    : '—'

  return (
    <article
      className="animate-in-up group flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-base ease-out hover:-translate-y-1.5 hover:shadow-2xl"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* ═══ وجه البطاقة ═══ */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`كشف حساب ${c.name}`}
        className="relative block overflow-hidden p-4 text-start text-white outline-none sm:p-5"
        style={{ background: `linear-gradient(135deg, ${color} 0%, ${shade(color, 0.38)} 100%)` }}
      >
        {/* زخارف */}
        <span aria-hidden className="absolute -top-16 -left-12 size-48 rounded-full bg-white/10 transition-transform duration-slow ease-out group-hover:scale-110" />
        <span aria-hidden className="absolute -bottom-24 right-6 size-56 rounded-full bg-white/[0.07]" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

        <div className="relative flex items-start justify-between gap-3">
          {/* الشريحة */}
          <span aria-hidden className="flex h-7 w-10 flex-col justify-center gap-[3px] rounded-md bg-gradient-to-br from-amber-200 to-amber-400 px-1.5 shadow-inner">
            <span className="h-px bg-amber-700/40" />
            <span className="h-px bg-amber-700/40" />
            <span className="h-px bg-amber-700/40" />
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold shadow-sm"
            style={{ color: tone }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: tone }} />
            {hasDebt ? 'عليه آجل' : hasCredit ? 'رصيد دائن' : 'مسوّى'}
          </span>
        </div>

        {/* الرصيد */}
        <div className="relative mt-4 sm:mt-6">
          <p className="text-[11px] font-medium text-white/75">
            {hasDebt ? 'المستحق عليه' : hasCredit ? 'رصيده الدائن' : 'الرصيد'}
          </p>
          <p className="mt-0.5 text-3xl font-extrabold leading-none tracking-tight tabular-nums drop-shadow-sm sm:text-4xl">
            {num(Math.abs(c.balance))}
            <span className="ms-1.5 text-sm font-semibold text-white/75">جنيه</span>
          </p>
          {hasDebt && purchases > 0 && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-all duration-slow ease-out"
                  style={{ width: `${Math.max(unpaidPct, 4)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-white/75">
                {unpaidPct.toFixed(unpaidPct >= 10 ? 0 : 1)}% من مشترياته لسه مدفعش
              </p>
            </div>
          )}
        </div>

        {/* الاسم + الهاتف */}
        <div className="relative mt-4 flex items-end justify-between gap-3 sm:mt-6">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold leading-tight sm:text-lg">{c.name}</p>
            <p dir="ltr" className="mt-1 truncate text-start font-mono text-[11px] tracking-[0.14em] text-white/80 sm:text-xs">
              {c.phone ?? '— — —'}
            </p>
          </div>
          {isTop ? (
            <span
              title="أفضل عميل — الأعلى مشتريات"
              className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 px-2.5 text-[10px] font-extrabold text-amber-900 shadow-md sm:h-10 sm:gap-1.5 sm:px-3 sm:text-[11px]"
            >
              <Crown className="size-3.5 sm:size-4" />
              أفضل عميل
            </span>
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur sm:size-10">
              <ReceiptText className="size-4 sm:size-[18px]" />
            </span>
          )}
        </div>
      </button>

      {/* ═══ ظهر البطاقة ═══ */}
      <div className="flex flex-1 flex-col gap-3 p-3.5 sm:p-4">
        <div className="grid grid-cols-3 divide-x divide-x-reverse text-center">
          <div className="px-1">
            <p className="text-[10px] text-muted-foreground">الفواتير</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums">{num(sales)}</p>
          </div>
          <div className="px-1">
            <p className="text-[10px] text-muted-foreground">المشتريات</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums">{num(purchases)}</p>
          </div>
          <div className="px-1">
            <p className="text-[10px] text-muted-foreground">آخر تعامل</p>
            <p className="mt-0.5 text-sm font-extrabold">{lastDeal}</p>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2">
          {/* 🆕 2026-10-20: للعميل المديون — زر التحصيل هو الأول (نفس نمط الموردين setPayTarget) */}
          {onPay && (
            <Button
              className="flex-1 rounded-xl border-0 bg-rose-600 font-extrabold text-white hover:bg-rose-700"
              onClick={onPay}
            >
              <HandCoins className="size-4" />
              سدد الآن
            </Button>
          )}
          <Button variant="outline" className="flex-1 rounded-xl font-semibold" onClick={onOpen}>
            <Eye className="size-4" />
            كشف الحساب
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-xl border text-muted-foreground"
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
                className="size-9 shrink-0 rounded-xl border text-muted-foreground"
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
  initial: Customer | null
  onSaved: () => void
}

function CustomerDialog({ open, onOpenChange, initial, onSaved }: Props) {
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
        await api(`/api/customers/${initial.id}`, {
          method: 'PUT',
          body: payload,
        })
        toast.success('تم تحديث العميل')
      } else {
        await api('/api/customers', { method: 'POST', body: payload })
        toast.success('تمت إضافة العميل')
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
      <DialogContent mobileSheet className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <CustomerHero
          icon={initial ? Pencil : UserPlus}
          title={initial ? 'تعديل عميل' : 'عميل جديد'}
          subtitle={initial ? 'عدّل بيانات العميل — رصيده ومشترياته زي ما هم.' : 'سجّل بيانات العميل علشان تتابع حسابه ومشترياته.'}
        />

        <DialogBody className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="c-name">
              الاسم <span className="text-destructive">*</span>
            </Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
              className="h-11 rounded-xl focus-visible:border-sky-600 focus-visible:ring-sky-500/20"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-phone">الهاتف</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="c-phone"
                dir="ltr"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
                placeholder="اختياري"
                className="h-11 rounded-xl pr-9 text-right focus-visible:border-sky-600 focus-visible:ring-sky-500/20"
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button size="lg" onClick={submit} disabled={saving} className="min-w-32 rounded-xl border-0 bg-sky-950 font-extrabold text-sky-50 hover:bg-sky-900 dark:bg-sky-700 dark:hover:bg-sky-600">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}