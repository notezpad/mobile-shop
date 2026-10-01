'use client'

import * as React from 'react'
import {
  Store,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Crown,
  MapPin,
  Smartphone,
  Trophy,
  ShoppingCart,
  DollarSign,
  Package,
  Receipt,
  Percent,
  FileText,
  Search,
  X,
  ArrowUpDown,
  ChevronDown,
  Check,
  BarChart3,
  LayoutGrid,
  Rows3,
  Navigation,
  Power,
  CalendarDays,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { printListReportHtml, openPrintWindow } from '@/lib/print'
import { useShopStore } from '@/lib/store'
import { useConfirm } from './ConfirmDialogProvider'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Branch {
  id: number
  name: string
  address: string | null
  phone: string | null
  active: boolean
  isMain: boolean
  createdAt: string
}

interface BranchReport {
  branchId: number
  name: string
  isMain: boolean
  salesCount: number
  totalSales: number
  totalProfit: number
  productCount: number
}

/* ───────────────────────── هوية الصفحة ─────────────────────────
   «واجهة المحل»: الفروع = محلات على الشارع.
   كل فرع له مظلة مقوّسة بخطوط (بلون الفرع) + لافتة باسمه + علامة «مفتوح/مغلق».
   بنفسجي للهوية العامة · ذهبي للفرع الرئيسي · رمادي للفرع الموقوف. */
const ACCENT = '#7c3aed'
const GOLD = '#d97706'
const MUTED = '#78716c'
const PALETTE = ['#7c3aed', '#0891b2', '#db2777', '#059669', '#ea580c', '#2563eb', '#ca8a04', '#9333ea']
const branchColor = (id: number, isMain: boolean) => (isMain ? GOLD : PALETTE[id % PALETTE.length])

const num = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const toLatinDigits = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

type StatusFilter = 'all' | 'active' | 'stopped' | 'idle' | 'incomplete'
type SortKey = 'default' | 'sales' | 'profit' | 'products' | 'margin' | 'newest' | 'name'
const SORT_LABELS: Record<SortKey, string> = {
  default: 'الرئيسي أولاً',
  sales: 'الأعلى مبيعاً',
  profit: 'الأعلى ربحاً',
  margin: 'الأعلى هامش ربح',
  products: 'الأكثر أصنافاً',
  newest: 'الأحدث افتتاحاً',
  name: 'الاسم (أ – ي)',
}
type RankMetric = 'sales' | 'profit' | 'count' | 'products'

export function BranchesView() {
  const confirm = useConfirm()
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [reports, setReports] = React.useState<BranchReport[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Branch | null>(null)
  const [form, setForm] = React.useState({ name: '', address: '', phone: '', active: true })
  const [saving, setSaving] = React.useState(false)

  /**
   * Load BOTH the branches list AND the per-branch reports (sales/profit).
   * Used on initial mount to fully populate the page.
   *
   * 🚀 2026-09-13: After the /api/reports/branches SQL-aggregate fix, this
   * endpoint is now ~150-300ms instead of 3-6s. So we can safely fetch both
   * in parallel on initial load.
   */
  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [bs, rs] = await Promise.all([
        api<Branch[]>('/api/branches'),
        api<BranchReport[]>('/api/reports/branches'),
      ])
      setBranches(bs); setReports(rs)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الفروع')
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => { load() }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['branches', 'sales'], load)

  /**
   * Lightweight reload — fetches ONLY the branches list (single fast query).
   * Used after save/delete when we know the reports haven't materially
   * changed (the new branch has zero sales). Refreshes the list instantly
   * without waiting for the (now fast but still unnecessary) reports fetch.
   *
   * We also patch the local `reports` array to keep the UI consistent:
   *   - Added a branch? Append a zero-stats entry.
   *   - Deleted a branch? Remove its entry from reports.
   *   - Edited? Just update the name in the existing entry.
   */
  const reloadBranchesOnly = React.useCallback(async (opts?: {
    added?: { id: number; name: string; isMain: boolean }
    deletedId?: number
    renamed?: { id: number; name: string }
  }) => {
    try {
      const bs = await api<Branch[]>('/api/branches')
      setBranches(bs)

      if (opts?.added) {
        // New branch starts with zero sales — patch the reports array so the
        // table shows it without needing to refetch /api/reports/branches.
        const placeholder: BranchReport = {
          branchId: opts.added.id,
          name: opts.added.name,
          isMain: opts.added.isMain,
          salesCount: 0,
          totalSales: 0,
          totalProfit: 0,
          productCount: 0,
        }
        setReports((prev) => [...prev, placeholder])
      } else if (opts?.deletedId !== undefined) {
        setReports((prev) => prev.filter((r) => r.branchId !== opts.deletedId))
      } else if (opts?.renamed) {
        setReports((prev) =>
          prev.map((r) =>
            r.branchId === opts.renamed.id ? { ...r, name: opts.renamed.name } : r,
          ),
        )
      }
    } catch (e: any) {
      // If the lightweight reload fails, fall back to a full load.
      load()
    }
  }, [load])

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', address: '', phone: '', active: true })
    setOpen(true)
  }
  const openEdit = (b: Branch) => {
    setEditing(b)
    setForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '', active: b.active })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('اسم الفرع مطلوب'); return }
    setSaving(true)
    try {
      if (editing) {
        await api(`/api/branches/${editing.id}`, { method: 'PATCH', body: form })
        toast.success('تم تحديث الفرع')
        setOpen(false)
        // 🚀 Only refetch branches list (fast) + patch the reports array
        // in-place. The new branch's stats haven't changed.
        void reloadBranchesOnly({ renamed: { id: editing.id, name: form.name.trim() } })
      } else {
        const created = await api<Branch>('/api/branches', { method: 'POST', body: form })
        toast.success('تم إنشاء الفرع')
        setOpen(false)
        void reloadBranchesOnly({
          added: {
            id: created.id,
            name: created.name,
            isMain: created.isMain,
          },
        })
      }
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (b: Branch) => {
    if (b.isMain) {
      toast.error('لا يمكن حذف الفرع الرئيسي — عيّن فرعاً آخر كرئيسي أولاً')
      return
    }
    if (!(await confirm({
      title: `حذف الفرع "${b.name}"؟`,
      description: 'سيتم فك ارتباط منتجاته وموظفيه به.',
    }))) return
    try {
      await api(`/api/branches/${b.id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      void reloadBranchesOnly({ deletedId: b.id })
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  const reportMap = new Map(reports.map(r => [r.branchId, r]))

  // Aggregate stats
  const totals = React.useMemo(() => {
    return reports.reduce((acc, r) => ({
      sales: acc.sales + r.totalSales,
      profit: acc.profit + r.totalProfit,
      count: acc.count + r.salesCount,
      products: acc.products + r.productCount,
    }), { sales: 0, profit: 0, count: 0, products: 0 })
  }, [reports])

  const exportPdf = () => {
    const html = printListReportHtml(
      {
        title: 'إدارة الفروع',
        subtitle: 'أداء كل فرع: مبيعات، أرباح، أصناف',
        columns: [
          { header: '#' },
          { header: 'الفرع', align: 'right' },
          { header: 'الحالة' },
          { header: 'عدد الفواتير' },
          { header: 'إجمالي المبيعات' },
          { header: 'إجمالي الأرباح' },
          { header: 'عدد الأصناف' },
        ],
        rows: reports.map((r, i) => [
          String(i + 1),
          r.name + (r.isMain ? ' (رئيسي)' : ''),
          branches.find((b) => b.id === r.branchId)?.active === false ? 'موقوف' : 'نشط',
          String(r.salesCount),
          formatCurrency(r.totalSales),
          formatCurrency(r.totalProfit),
          String(r.productCount),
        ]),
        kpis: [
          { label: 'عدد الفروع', value: String(branches.length) },
          { label: 'إجمالي المبيعات', value: formatCurrency(totals.sales) },
          { label: 'إجمالي الأرباح', value: formatCurrency(totals.profit), emphasize: true },
          { label: 'إجمالي الفواتير', value: String(totals.count) },
        ],
        emptyMessage: 'لا توجد فروع',
      },
      {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
        logo: shopBranding.logoPath || undefined,
      }
    )
    openPrintWindow(html, () => toast.error('الرجاء السماح بالنوافذ المنبثقة'))
  }

  /* ───────── فتح/غلق سريع للفرع من اللافتة — نفس PATCH بتاع التعديل (active بس) ───────── */
  const toggleActive = async (b: Branch) => {
    if (b.isMain) {
      toast.error('الفرع الرئيسي لازم يفضل مفتوح — عيّن فرعاً آخر كرئيسي أولاً')
      return
    }
    const next = !b.active
    setBranches((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: next } : x))) // ⚡ optimistic
    try {
      await api(`/api/branches/${b.id}`, { method: 'PATCH', body: { active: next } })
      toast.success(next ? `تم فتح ${b.name}` : `تم إيقاف ${b.name}`)
    } catch (e: any) {
      setBranches((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: b.active } : x)))
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  /* ───────── أرقام العرض فقط (مشتقة من نفس البيانات — بدون أي منطق جديد) ───────── */
  const view = React.useMemo(() => {
    const ranked = [...reports].filter((r) => r.totalSales > 0).sort((a, b) => b.totalSales - a.totalSales)
    const rankOf = new Map(ranked.map((r, i) => [r.branchId, i + 1]))
    const margin = totals.sales > 0 ? (totals.profit / totals.sales) * 100 : 0
    const activeCount = branches.filter((b) => b.active).length
    return {
      ranked,
      rankOf,
      margin,
      avgInvoice: totals.count > 0 ? totals.sales / totals.count : 0,
      activeCount,
      stoppedCount: branches.length - activeCount,
      best: ranked[0] ?? null,
    }
  }, [reports, totals, branches])

  /* ───────── الفلاتر والترتيب (عرض فقط) ───────── */
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [sort, setSort] = React.useState<SortKey>('default')
  const [mode, setMode] = React.useState<'cards' | 'compare'>('cards')
  const [statsOpen, setStatsOpen] = React.useState(true)
  const [metric, setMetric] = React.useState<RankMetric>('sales')

  const isIdle = (b: Branch) => (reportMap.get(b.id)?.salesCount ?? 0) === 0
  const isIncomplete = (b: Branch) => !b.address?.trim() || !b.phone?.trim()
  const counts = {
    all: branches.length,
    active: branches.filter((b) => b.active).length,
    stopped: branches.filter((b) => !b.active).length,
    idle: branches.filter(isIdle).length,
    incomplete: branches.filter(isIncomplete).length,
  }
  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = branches.filter((b) => {
      if (q && !`${b.name} ${b.address ?? ''} ${b.phone ?? ''}`.toLowerCase().includes(q)) return false
      if (status === 'active') return b.active
      if (status === 'stopped') return !b.active
      if (status === 'idle') return (reportMap.get(b.id)?.salesCount ?? 0) === 0
      if (status === 'incomplete') return !b.address?.trim() || !b.phone?.trim()
      return true
    })
    if (sort !== 'default') {
      const r = (b: Branch) => reportMap.get(b.id)
      const m = (b: Branch) => ((r(b)?.totalSales ?? 0) > 0 ? (r(b)!.totalProfit / r(b)!.totalSales) * 100 : 0)
      rows = [...rows].sort((x, y) => {
        if (sort === 'sales') return (r(y)?.totalSales ?? 0) - (r(x)?.totalSales ?? 0)
        if (sort === 'profit') return (r(y)?.totalProfit ?? 0) - (r(x)?.totalProfit ?? 0)
        if (sort === 'margin') return m(y) - m(x)
        if (sort === 'products') return (r(y)?.productCount ?? 0) - (r(x)?.productCount ?? 0)
        if (sort === 'newest') return new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
        return x.name.localeCompare(y.name, 'ar')
      })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, reports, search, status, sort])
  const hasFilters = search.trim() !== '' || status !== 'all' || sort !== 'default'
  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setSort('default')
  }
  const noData = loading && branches.length === 0
  const zero: BranchReport = { branchId: 0, name: '', isMain: false, salesCount: 0, totalSales: 0, totalProfit: 0, productCount: 0 }

  return (
    <div className="space-y-5">
      {/* ═════════ Hero — «واجهة المحل»: إجمالي مبيعات كل الفروع + مساهمة كل فرع ═════════ */}
      <section className="animate-in-up motion-reduce:animate-none relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50/60 to-white text-stone-900 shadow-sm dark:border-violet-950 dark:from-slate-900 dark:via-violet-950/50 dark:to-slate-950 dark:text-stone-50">
        <Awning color={ACCENT} height={22} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-30"
          style={{
            backgroundImage: 'radial-gradient(rgba(124,58,237,0.16) 1px, transparent 1.2px)',
            backgroundSize: '16px 16px',
            maskImage: 'linear-gradient(to left, black, transparent 60%)',
            WebkitMaskImage: 'linear-gradient(to left, black, transparent 60%)',
          }}
        />
        <div className="relative flex flex-wrap items-stretch gap-x-8 gap-y-5 p-5 pt-6 sm:p-6 sm:pt-7">
          <div className="min-w-[230px]">
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-9 items-center justify-center rounded-xl text-white shadow-md"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, #c026d3)` }}
              >
                <Store className="size-[18px]" />
              </span>
              <div>
                <h1 className="text-lg font-extrabold leading-tight">إدارة الفروع</h1>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">فروع متجرك وأداء كل فرع على حدة</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] font-medium text-stone-500 dark:text-stone-400">إجمالي مبيعات كل الفروع</p>
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-l from-violet-700 to-fuchsia-600 bg-clip-text text-5xl font-extrabold tracking-tight tabular-nums text-transparent dark:from-violet-300 dark:to-fuchsia-300">
                {noData ? '—' : num(totals.sales)}
              </span>
              <span className="text-base font-semibold text-stone-500 dark:text-stone-400">جنيه</span>
            </div>
            {!noData && branches.length > 0 && (
              <p className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                {num(branches.length)} {branches.length > 2 && branches.length < 11 ? 'فروع' : 'فرع'} · {num(view.activeCount)} شغّال
                {view.stoppedCount > 0 && ` · ${num(view.stoppedCount)} موقوف`}
              </p>
            )}
          </div>

          <div className="min-w-[280px] flex-1">
            <SalesSpread rows={view.ranked} total={totals.sales} hidden={noData} branchesCount={branches.length} />
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-col lg:items-stretch lg:justify-center">
            <Button
              size="lg"
              onClick={openNew}
              className="border-0 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/30 hover:from-violet-500 hover:to-fuchsia-500"
            >
              <Plus className="size-4" />
              فرع جديد
            </Button>
            <Button
              variant="outline"
              onClick={exportPdf}
              disabled={loading}
              className="border-violet-300 bg-white/70 text-stone-800 hover:border-violet-400 hover:bg-violet-100 dark:border-violet-900 dark:bg-transparent dark:text-stone-100 dark:hover:bg-violet-950"
            >
              <FileText className="size-4" />
              تصدير PDF
            </Button>
          </div>
        </div>
      </section>

      {/* ═════════ مركز الإحصائيات ═════════ */}
      {branches.length > 0 && (
        <section className="animate-in-up motion-reduce:animate-none stagger-1 space-y-4">
          <button
            type="button"
            onClick={() => setStatsOpen((o) => !o)}
            aria-expanded={statsOpen}
            className="group flex w-full items-center gap-2.5 rounded-2xl border bg-card px-3.5 py-2.5 text-start shadow-sm transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-violet-500/40 focus-visible:outline-none"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <BarChart3 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold leading-tight">أداء الفروع</h2>
              <p className="text-[11px] text-muted-foreground">مبيعات وأرباح وترتيب كل فرع في لمحة</p>
            </div>
            {!statsOpen && (
              <div className="hidden items-center gap-2 text-[11px] sm:flex">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  أرباح {num(totals.profit)}
                </span>
                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-semibold text-violet-600 dark:text-violet-400">
                  هامش {totals.sales > 0 ? `${view.margin.toFixed(0)}%` : '—'}
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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <KpiTile color="#059669" icon={DollarSign} label="إجمالي الأرباح" value={num(totals.profit)} unit="جنيه" loading={loading} />
                <KpiTile
                  color="#7c3aed" icon={Percent} label="هامش الربح"
                  value={totals.sales > 0 ? `${view.margin.toFixed(view.margin >= 10 ? 0 : 1)}%` : '—'}
                  progress={totals.sales > 0 ? view.margin : undefined} loading={loading}
                />
                <KpiTile color="#0891b2" icon={ShoppingCart} label="عدد الفواتير" value={num(totals.count)} loading={loading} />
                <KpiTile color="#db2777" icon={Receipt} label="متوسط الفاتورة" value={num(Math.round(view.avgInvoice))} unit="جنيه" loading={loading} />
                <KpiTile
                  color="#ea580c" icon={Package} label="إجمالي الأصناف" value={num(totals.products)}
                  sub={branches.length > 0 ? `بمتوسط ${num(Math.round(totals.products / branches.length))} للفرع` : undefined} loading={loading}
                />
                <KpiTile
                  color={view.stoppedCount > 0 ? MUTED : '#2563eb'} icon={Store} label="الفروع الشغّالة"
                  value={`${num(view.activeCount)} / ${num(branches.length)}`}
                  sub={view.stoppedCount > 0 ? `${num(view.stoppedCount)} موقوف` : 'كلهم شغّالين'}
                  progress={branches.length > 0 ? (view.activeCount / branches.length) * 100 : undefined} loading={loading}
                />
              </div>

              <RankPanel
                reports={reports}
                metric={metric}
                onMetric={setMetric}
                totals={totals}
                loading={loading}
              />
            </div>
          )}
        </section>
      )}

      {/* ═════════ الفلاتر ═════════ */}
      {branches.length > 0 && (
        <div className="animate-in-up motion-reduce:animate-none stagger-2 space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو العنوان أو الهاتف..."
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-xl">
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
                    {sort === k && <Check className="size-4 text-violet-600" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-0.5 rounded-xl border bg-background p-0.5" role="group" aria-label="طريقة العرض">
              {(
                [
                  ['cards', 'واجهات الفروع', LayoutGrid],
                  ['compare', 'مقارنة الأداء', Rows3],
                ] as const
              ).map(([k, l, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode(k)}
                  aria-pressed={mode === k}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors',
                    mode === k ? 'bg-violet-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-[11px] font-semibold text-muted-foreground">الحالة</span>
            {(
              [
                ['all', 'كل الفروع', undefined],
                ['active', 'شغّالة', '#059669'],
                ['stopped', 'موقوفة', MUTED],
                ['idle', 'لسه من غير مبيعات', '#0891b2'],
                ['incomplete', 'بياناتها ناقصة', '#ea580c'],
              ] as [StatusFilter, string, string | undefined][]
            ).map(([k, label, color]) => (
              <FilterPill
                key={k}
                active={status === k}
                onClick={() => setStatus(status === k && k !== 'all' ? 'all' : k)}
                count={counts[k]}
                color={color}
              >
                {label}
              </FilterPill>
            ))}
          </div>

          {hasFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
              <span>
                النتائج: <b className="tabular-nums text-foreground">{num(shown.length)}</b> من {num(branches.length)} فرع
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="size-4" />
                مسح الفلاتر
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ═════════ القايمة ═════════ */}
      {loading && branches.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[400px] w-full rounded-3xl" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <Card className="animate-in-up motion-reduce:animate-none overflow-hidden">
          <Awning color={ACCENT} height={18} />
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Store className="size-8" />
            </div>
            <div>
              <p className="text-base font-semibold">لسه مفيش فروع</p>
              <p className="mt-1 text-sm text-muted-foreground">أنشئ أول فرع علشان تتابع مبيعاته وأرباحه وأصنافه لوحده</p>
            </div>
            <Button onClick={openNew} className="border-0 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500">
              <Plus className="size-4" />
              إنشاء أول فرع
            </Button>
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <Card className="animate-in-up motion-reduce:animate-none">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Search className="size-6" />
            </div>
            <div>
              <p className="text-base font-semibold">مفيش فروع مطابقة</p>
              <p className="mt-1 text-sm text-muted-foreground">جرّب تغيّر الفلاتر أو كلمة البحث</p>
            </div>
            <Button variant="outline" onClick={clearFilters}>مسح الفلاتر</Button>
          </CardContent>
        </Card>
      ) : mode === 'cards' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-5">
          {shown.map((b, i) => (
            <BranchStore
              key={b.id}
              b={b}
              r={reportMap.get(b.id)}
              index={i}
              rank={view.rankOf.get(b.id)}
              rankedCount={view.ranked.length}
              totalSales={totals.sales}
              onEdit={() => openEdit(b)}
              onDelete={() => remove(b)}
              onToggle={() => toggleActive(b)}
            />
          ))}
          {!hasFilters && (
            <button
              type="button"
              onClick={openNew}
              className="animate-in-up motion-reduce:animate-none group flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-card/40 p-6 text-center transition-all duration-base ease-out hover:-translate-y-1.5 hover:border-violet-500/60 hover:bg-violet-500/5 focus-visible:ring-[3px] focus-visible:ring-violet-500/40 focus-visible:outline-none"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/25 transition-transform duration-base group-hover:scale-110 group-hover:rotate-90">
                <Plus className="size-6" />
              </span>
              <span>
                <span className="block text-sm font-bold">افتح فرع جديد</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">اسم وعنوان ورقم وابدأ تبيع</span>
              </span>
            </button>
          )}
        </div>
      ) : (
        <ComparePanel
          rows={shown.map((b) => ({ b, r: reportMap.get(b.id) ?? { ...zero, branchId: b.id, name: b.name, isMain: b.isMain } }))}
          totals={totals}
        />
      )}

      {/* زر عائم للموبايل */}
      <Button
        size="icon-lg"
        onClick={openNew}
        className="fixed bottom-5 left-5 z-30 rounded-full border-0 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl sm:hidden"
        aria-label="فرع جديد"
      >
        <Plus className="size-6" />
      </Button>

      {/* ═════════ نافذة الفرع ═════════ */}
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[480px]">
          <Awning color={editing ? branchColor(editing.id, editing.isMain) : ACCENT} height={18} />
          <DialogHeader className="border-b bg-violet-500/[0.06] p-5 text-start">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                {editing ? <Pencil className="size-5" /> : <Store className="size-5" />}
              </span>
              {editing ? 'تعديل فرع' : 'فرع جديد'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'عدّل بيانات الفرع — مبيعاته وأصنافه زي ما هم.' : 'سجّل بيانات الفرع وهيظهر فوراً في الاختيارات وتقارير الأداء.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 p-5">
            {/* معاينة اللافتة */}
            <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${editing ? branchColor(editing.id, editing.isMain) : ACCENT}, ${shade(editing ? branchColor(editing.id, editing.isMain) : ACCENT, 0.35)})` }}
              >
                {editing?.isMain ? <Crown className="size-5" /> : <Store className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">شكل اللافتة</p>
                <p className="text-base font-extrabold leading-snug break-words [overflow-wrap:anywhere]">
                  {form.name.trim() || 'اسم الفرع'}
                </p>
              </div>
              <span
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-bold',
                  form.active
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-stone-400/40 bg-stone-500/10 text-stone-600 dark:text-stone-300',
                )}
              >
                {form.active ? 'مفتوح' : 'مغلق'}
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="b-name">
                اسم الفرع <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Store className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="b-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && !saving && save()}
                  placeholder="مثال: فرع وسط البلد"
                  autoFocus
                  className="h-11 pr-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-address">العنوان</Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="b-address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="العنوان التفصيلي..."
                  className="h-11 pr-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-phone">رقم الهاتف</Label>
              <div className="relative">
                <Smartphone className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="b-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                  className="h-11 pr-9 text-left font-semibold tabular-nums"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border p-3.5">
              <div className="min-w-0">
                <Label htmlFor="b-active" className="cursor-pointer text-sm font-semibold">
                  الفرع مُفعّل
                </Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">الفروع الموقوفة لا تظهر في الاختيارات الجديدة</p>
              </div>
              <Switch
                id="b-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button
              size="lg"
              onClick={save}
              disabled={saving}
              className="min-w-36 border-0 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing ? 'حفظ التعديلات' : 'إنشاء الفرع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ───────────────────────── مكوّنات صغيرة ───────────────────────── */

/** يغمّق لون hex بنسبة (0–1) */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** مظلة المحل — خطوط بلون الفرع وحافة مقوّسة (كل قوس = خط) */
function Awning({ color, height = 28 }: { color: string; height?: number }) {
  const light = `color-mix(in srgb, ${color} 22%, white)`
  const stripes = `repeating-linear-gradient(90deg, ${color} 0 28px, ${light} 28px 56px)`
  return (
    <div aria-hidden className="relative w-full">
      <div style={{ height: height - 10, backgroundImage: stripes }} />
      <div
        style={{
          height: 14,
          backgroundImage: stripes,
          WebkitMaskImage: 'radial-gradient(circle at 14px 0, #000 13.5px, transparent 14.5px)',
          maskImage: 'radial-gradient(circle at 14px 0, #000 13.5px, transparent 14.5px)',
          WebkitMaskSize: '28px 14px',
          maskSize: '28px 14px',
          WebkitMaskRepeat: 'repeat-x',
          maskRepeat: 'repeat-x',
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-b from-black/10 via-transparent to-transparent" />
    </div>
  )
}

/** الهاتف: شارة موبايل + الرقم بولد LTR بأرقام إنجليزية */
function PhoneTag({ phone, color }: { phone: string | null; color?: string }) {
  if (!phone?.trim()) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
          <Smartphone className="size-3.5" />
        </span>
        بدون هاتف
      </span>
    )
  }
  return (
    <span dir="ltr" className="inline-flex max-w-full items-center gap-1.5">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${color ?? ACCENT}1f`, color: color ?? ACCENT }}
      >
        <Smartphone className="size-3.5" strokeWidth={2.25} />
      </span>
      <span className="truncate text-[13px] font-bold tracking-wide tabular-nums text-foreground/90">
        {toLatinDigits(phone.trim())}
      </span>
    </span>
  )
}

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
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-violet-500/40 focus-visible:outline-none',
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
        <span className={cn('min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums', active ? 'bg-white/25' : 'bg-muted text-foreground/70')}>
          {count}
        </span>
      )}
    </button>
  )
}

/** بطاقة مؤشر — «رف» ملوّن أسفل البطاقة */
function KpiTile({
  color,
  icon: Icon,
  label,
  value,
  unit,
  sub,
  progress,
  loading,
}: {
  color: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  unit?: string
  sub?: string
  progress?: number
  loading?: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-b-4 bg-card p-4 transition-shadow hover:shadow-md" style={{ borderBottomColor: color }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1f`, color }}>
          <Icon className="size-4" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-2 truncate text-2xl font-extrabold tabular-nums">
          {value}
          {unit && <span className="ms-1 text-[11px] font-medium text-muted-foreground">{unit}</span>}
        </p>
      )}
      {sub && <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{sub}</p>}
      {progress !== undefined && !loading && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${color}22` }}>
          <div className="h-full rounded-full transition-[width] duration-slow ease-out" style={{ width: `${Math.min(100, Math.max(progress, 2))}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  )
}

/** مساهمة كل فرع في المبيعات (داخل الـ Hero) */
function SalesSpread({
  rows,
  total,
  hidden,
  branchesCount,
}: {
  rows: BranchReport[]
  total: number
  hidden?: boolean
  branchesCount: number
}) {
  if (hidden) return <div />
  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center gap-3 rounded-2xl border border-dashed border-violet-300 bg-white/60 p-4 text-sm text-stone-600 dark:border-violet-900 dark:bg-white/5 dark:text-stone-300">
        <Sparkles className="size-5 shrink-0 text-violet-600 dark:text-violet-400" />
        {branchesCount === 0 ? 'أنشئ أول فرع وابدأ تتابع أداءه' : 'لسه مفيش مبيعات مسجّلة على أي فرع'}
      </div>
    )
  }
  const list = rows.slice(0, 5)
  const restSum = rows.slice(5).reduce((s, r) => s + r.totalSales, 0)
  return (
    <div className="h-full min-w-0 rounded-2xl border border-violet-200 bg-white/70 p-4 backdrop-blur-sm dark:border-violet-900/70 dark:bg-white/5">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">مساهمة كل فرع في المبيعات</p>
        <p className="text-[11px] text-stone-500 dark:text-stone-400">
          {rows.length === 1 ? 'فرع واحد بيبيع' : `${rows.length} فروع بتبيع`}
        </p>
      </div>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
        {list.map((r) => (
          <div
            key={r.branchId}
            title={`${r.name}: ${formatCurrency(r.totalSales)}`}
            className="h-full min-w-[6px] rounded-sm transition-all duration-slow ease-out first:rounded-s-full"
            style={{ width: `${(r.totalSales / (total || 1)) * 100}%`, backgroundColor: branchColor(r.branchId, r.isMain) }}
          />
        ))}
        {restSum > 0 && (
          <div className="h-full min-w-[6px] rounded-e-full bg-stone-400/50" style={{ width: `${(restSum / (total || 1)) * 100}%` }} title={`فروع أخرى: ${formatCurrency(restSum)}`} />
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {list.map((r) => (
          <li key={r.branchId} className="flex items-center gap-1.5 text-[11px]">
            <span className="size-2 rounded-full" style={{ backgroundColor: branchColor(r.branchId, r.isMain) }} />
            <span title={r.name} className="max-w-[110px] truncate font-medium text-stone-700 dark:text-stone-300">{r.name}</span>
            <span className="tabular-nums text-stone-500 dark:text-stone-400">{((r.totalSales / (total || 1)) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** ترتيب الفروع — بدّل المعيار (مبيعات / أرباح / فواتير / أصناف) وشوف مين الأول */
function RankPanel({
  reports,
  metric,
  onMetric,
  totals,
  loading,
}: {
  reports: BranchReport[]
  metric: RankMetric
  onMetric: (m: RankMetric) => void
  totals: { sales: number; profit: number; count: number; products: number }
  loading: boolean
}) {
  const cfg: Record<RankMetric, { label: string; get: (r: BranchReport) => number; total: number; money: boolean }> = {
    sales: { label: 'المبيعات', get: (r) => r.totalSales, total: totals.sales, money: true },
    profit: { label: 'الأرباح', get: (r) => r.totalProfit, total: totals.profit, money: true },
    count: { label: 'الفواتير', get: (r) => r.salesCount, total: totals.count, money: false },
    products: { label: 'الأصناف', get: (r) => r.productCount, total: totals.products, money: false },
  }
  const c = cfg[metric]
  const rows = [...reports].sort((a, b) => c.get(b) - c.get(a))
  const max = rows[0] ? c.get(rows[0]) : 0
  const medals = ['#d97706', '#94a3b8', '#b45309']
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Trophy className="size-4 text-amber-500" />
          ترتيب الفروع
        </h3>
        <div className="flex items-center gap-0.5 rounded-xl border bg-background p-0.5" role="group" aria-label="معيار الترتيب">
          {(Object.keys(cfg) as RankMetric[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onMetric(k)}
              aria-pressed={metric === k}
              className={cn(
                'h-7 rounded-lg px-2.5 text-xs font-semibold transition-colors',
                metric === k ? 'bg-violet-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {cfg[k].label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">لسه مفيش بيانات</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const v = c.get(r)
            const color = branchColor(r.branchId, r.isMain)
            return (
              <li key={r.branchId} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                  style={{ backgroundColor: v > 0 ? (medals[i] ?? color) : MUTED }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                      {r.isMain && <Crown className="size-3.5 shrink-0 text-amber-500" />}
                      <span title={r.name} className="truncate">{r.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-extrabold tabular-nums">
                      {num(v)}
                      <span className="ms-1 text-[11px] font-medium text-muted-foreground">{c.money ? 'جنيه' : ''}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-slow ease-out"
                        style={{ width: `${max > 0 ? Math.max((v / max) * 100, v > 0 ? 4 : 0) : 0}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="w-9 text-end text-[11px] tabular-nums text-muted-foreground">
                      {c.total > 0 ? `${Math.round((v / c.total) * 100)}%` : ''}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** واجهة الفرع — مظلة + لافتة + علامة مفتوح/مغلق + أرقام الأداء */
function BranchStore({
  b,
  r,
  index,
  rank,
  rankedCount,
  totalSales,
  onEdit,
  onDelete,
  onToggle,
}: {
  b: Branch
  r: BranchReport | undefined
  index: number
  rank?: number
  rankedCount: number
  totalSales: number
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const color = b.active ? branchColor(b.id, b.isMain) : MUTED
  const sales = r?.totalSales ?? 0
  const profit = r?.totalProfit ?? 0
  const count = r?.salesCount ?? 0
  const products = r?.productCount ?? 0
  const margin = sales > 0 ? (profit / sales) * 100 : 0
  const share = totalSales > 0 ? (sales / totalSales) * 100 : 0
  const avg = count > 0 ? sales / count : 0
  const isBest = rank === 1 && rankedCount >= 2

  return (
    <article
      className={cn(
        'animate-in-up motion-reduce:animate-none group relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-base ease-out hover:-translate-y-1.5 hover:shadow-2xl',
        !b.active && 'bg-muted/30',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className={cn(!b.active && 'grayscale')}>
        <Awning color={color} height={30} />
      </div>

      {/* اللافتة */}
      <div className="flex items-start gap-3 px-5 pt-3">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, 0.35)})` }}
        >
          {b.isMain ? <Crown className="size-6" /> : <Store className="size-6" />}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-lg font-extrabold leading-snug break-words [overflow-wrap:anywhere]">{b.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3" />
            افتُتح <DateTimeCell date={b.createdAt} showTime={false} className="align-middle" />
          </p>
        </div>

        {/* علامة مفتوح/مغلق — بتتقلب بالضغط */}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={b.active}
          title={b.isMain ? 'الفرع الرئيسي لازم يفضل مفتوح' : b.active ? 'اضغط لإيقاف الفرع' : 'اضغط لفتح الفرع'}
          className={cn(
            'group/sign flex shrink-0 items-center gap-1.5 rounded-lg border-2 px-2 py-1 text-[11px] font-extrabold transition-all focus-visible:ring-[3px] focus-visible:ring-violet-500/40 focus-visible:outline-none',
            b.active
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400'
              : 'border-stone-400/50 bg-stone-500/10 text-stone-600 hover:bg-stone-500/20 dark:text-stone-300',
            b.isMain && 'cursor-not-allowed hover:bg-emerald-500/10',
          )}
        >
          <Power className="size-3" />
          {b.active ? 'مفتوح' : 'مغلق'}
        </button>
      </div>

      {/* شارات */}
      {(b.isMain || isBest || (rank && rankedCount >= 2 && !isBest)) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-5">
          {b.isMain && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
              <Crown className="size-3" />
              الفرع الرئيسي
            </span>
          )}
          {isBest ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:text-violet-300">
              <Trophy className="size-3" />
              الأعلى مبيعاً
            </span>
          ) : (
            rank &&
            rankedCount >= 2 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                رقم {rank} في المبيعات
              </span>
            )
          )}
        </div>
      )}

      {/* العنوان والهاتف */}
      <div className="mt-3 space-y-2 px-5">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <MapPin className="size-3.5" />
          </span>
          {b.address ? (
            <>
              <p className="min-w-0 flex-1 text-[13px] leading-snug break-words text-foreground/90 [overflow-wrap:anywhere]">{b.address}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-violet-500/40 focus-visible:outline-none"
                title="افتح في الخريطة"
                aria-label="افتح العنوان في الخريطة"
              >
                <Navigation className="size-3.5" />
              </a>
            </>
          ) : (
            <p className="flex-1 pt-0.5 text-xs text-muted-foreground/70">لا يوجد عنوان</p>
          )}
        </div>
        <PhoneTag phone={b.phone} color={color} />
      </div>

      {/* خط التقطيع */}
      <div aria-hidden className="relative mt-4 h-0 border-t-2 border-dashed border-border" />

      {/* الأداء */}
      <div className="flex flex-1 flex-col gap-3.5 p-5 pt-4">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">إجمالي المبيعات</p>
          <div className="flex items-end justify-between gap-2">
            <p className="text-3xl leading-none font-extrabold tracking-tight tabular-nums" style={{ color: sales > 0 ? color : undefined }}>
              {num(sales)}
              <span className="ms-1.5 text-sm font-semibold text-muted-foreground">جنيه</span>
            </p>
            {sales > 0 && (
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                style={{ backgroundColor: '#05966914', color: '#059669' }}
                title="هامش الربح"
              >
                هامش {margin.toFixed(margin >= 10 ? 0 : 1)}%
              </span>
            )}
          </div>
          {totalSales > 0 && (
            <div className="mt-2.5">
              <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${color}22` }}>
                <div className="h-full rounded-full transition-all duration-slow ease-out" style={{ width: `${sales > 0 ? Math.max(share, 3) : 0}%`, backgroundColor: color }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {sales > 0 ? `${share.toFixed(share >= 10 ? 0 : 1)}% من مبيعات كل الفروع` : 'لسه مفيش مبيعات على الفرع ده'}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 divide-x divide-x-reverse text-center">
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">الأرباح</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{num(profit)}</p>
          </div>
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">الفواتير</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums">{num(count)}</p>
          </div>
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">الأصناف</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums">{num(products)}</p>
          </div>
        </div>
        {count > 0 && (
          <p className="-mt-1 text-center text-[11px] text-muted-foreground">
            متوسط الفاتورة <b className="tabular-nums text-foreground">{num(Math.round(avg))}</b> جنيه
          </p>
        )}

        <div className="mt-auto flex items-center gap-2">
          <Button variant="outline" className="flex-1 rounded-xl font-semibold" onClick={onEdit}>
            <Pencil className="size-4" />
            تعديل الفرع
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl border text-destructive hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground"
            onClick={onDelete}
            disabled={b.isMain}
            title={b.isMain ? 'لا يمكن حذف الفرع الرئيسي' : 'حذف الفرع'}
            aria-label="حذف الفرع"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

/** مقارنة الأداء — جدول بأعمدة نسبية (شاشات كبيرة) وكروت مضغوطة (موبايل) */
function ComparePanel({
  rows,
  totals,
}: {
  rows: { b: Branch; r: BranchReport }[]
  totals: { sales: number; profit: number; count: number; products: number }
}) {
  const maxSales = Math.max(0, ...rows.map((x) => x.r.totalSales))
  const shownTotals = rows.reduce(
    (a, { r }) => ({ sales: a.sales + r.totalSales, profit: a.profit + r.totalProfit, count: a.count + r.salesCount, products: a.products + r.productCount }),
    { sales: 0, profit: 0, count: 0, products: 0 },
  )
  const cols = 'grid-cols-[2fr_.8fr_1.6fr_1.2fr_.8fr_1fr_.8fr]'
  return (
    <div className="animate-in-up motion-reduce:animate-none overflow-hidden rounded-2xl border bg-card shadow-sm">
      <Awning color={ACCENT} height={16} />

      {/* جدول */}
      <div className="hidden lg:block">
        <div className={cn('grid items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground', cols)}>
          <span>الفرع</span>
          <span>الفواتير</span>
          <span>المبيعات</span>
          <span>الأرباح</span>
          <span>الأصناف</span>
          <span>متوسط الفاتورة</span>
          <span>الهامش</span>
        </div>
        <ul className="divide-y">
          {rows.map(({ b, r }) => {
            const color = branchColor(b.id, b.isMain)
            const avg = r.salesCount > 0 ? r.totalSales / r.salesCount : 0
            const margin = r.totalSales > 0 ? (r.totalProfit / r.totalSales) * 100 : 0
            return (
              <li key={b.id} className={cn('grid items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-violet-500/[0.04]', cols, b.isMain && 'bg-amber-500/[0.04]')}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: b.active ? color : MUTED }}>
                    {b.isMain ? <Crown className="size-4" /> : <Store className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span title={b.name} className="block truncate font-semibold">{b.name}</span>
                    {!b.active && <span className="text-[11px] text-muted-foreground">موقوف</span>}
                  </span>
                </span>
                <span className="tabular-nums">{num(r.salesCount)}</span>
                <span className="min-w-0">
                  <b className="tabular-nums">{num(r.totalSales)}</b>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full" style={{ width: `${maxSales > 0 ? Math.max((r.totalSales / maxSales) * 100, r.totalSales > 0 ? 4 : 0) : 0}%`, backgroundColor: color }} />
                  </span>
                </span>
                <b className="tabular-nums text-emerald-600 dark:text-emerald-400">{num(r.totalProfit)}</b>
                <span className="tabular-nums">{num(r.productCount)}</span>
                <span className="tabular-nums text-muted-foreground">{num(Math.round(avg))}</span>
                <span className="tabular-nums text-muted-foreground">{r.totalSales > 0 ? `${margin.toFixed(0)}%` : '—'}</span>
              </li>
            )
          })}
        </ul>
        <div className={cn('grid items-center gap-3 border-t-2 bg-muted/50 px-4 py-3 text-sm font-extrabold', cols)}>
          <span>الإجمالي {rows.length !== 0 && shownTotals.sales !== totals.sales && <span className="text-[11px] font-medium text-muted-foreground">(للنتائج)</span>}</span>
          <span className="tabular-nums">{num(shownTotals.count)}</span>
          <span className="tabular-nums">{num(shownTotals.sales)}</span>
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{num(shownTotals.profit)}</span>
          <span className="tabular-nums">{num(shownTotals.products)}</span>
          <span className="tabular-nums text-muted-foreground">{shownTotals.count > 0 ? num(Math.round(shownTotals.sales / shownTotals.count)) : '—'}</span>
          <span className="tabular-nums text-muted-foreground">{shownTotals.sales > 0 ? `${((shownTotals.profit / shownTotals.sales) * 100).toFixed(0)}%` : '—'}</span>
        </div>
      </div>

      {/* كروت مضغوطة للموبايل */}
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
        {rows.map(({ b, r }) => {
          const color = branchColor(b.id, b.isMain)
          const avg = r.salesCount > 0 ? r.totalSales / r.salesCount : 0
          return (
            <div key={b.id} className="rounded-2xl border bg-card p-3.5" style={{ borderInlineStartWidth: 4, borderInlineStartColor: b.active ? color : MUTED }}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 font-bold leading-snug break-words [overflow-wrap:anywhere]">
                  {b.isMain && <Crown className="size-3.5 shrink-0 text-amber-500" />}
                  {b.name}
                </p>
                {!b.active && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">موقوف</span>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-2.5 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground">المبيعات</p>
                  <p className="text-sm font-extrabold tabular-nums">{num(r.totalSales)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">الأرباح</p>
                  <p className="text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{num(r.totalProfit)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">الفواتير</p>
                  <p className="text-sm font-semibold tabular-nums">{num(r.salesCount)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">الأصناف</p>
                  <p className="text-sm font-semibold tabular-nums">{num(r.productCount)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground">متوسط الفاتورة</p>
                  <p className="text-xs font-semibold tabular-nums text-muted-foreground">{num(Math.round(avg))} جنيه</p>
                </div>
              </div>
            </div>
          )
        })}
        <div className="col-span-full rounded-2xl border-2 bg-muted/40 p-3.5 text-center text-sm font-extrabold">
          الإجمالي: <span className="tabular-nums">{num(shownTotals.sales)}</span> مبيعات ·{' '}
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{num(shownTotals.profit)}</span> أرباح
        </div>
      </div>
    </div>
  )
}
