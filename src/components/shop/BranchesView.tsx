'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Store,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Crown,
  MapPin,
  Smartphone,
  FileText,
  Search,
  X,
  Navigation,
  Power,
  MoreVertical,
  Check,
  Link2,
  CalendarDays,
  Hourglass,
  Wallet,
  TrendingUp,
  Receipt,
  Boxes,
} from 'lucide-react'
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

// 🛡️ v13: فك أي ظرف رد فيه حقل مصفوفة ({data:[...]} وأمثاله) — مستحيل
// تستقبل الشاشة غير مصفوفة من أي سيرفر أو كاش
function asArrayBranches<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['data', 'items', 'results', 'rows', 'list', 'branches']) {
      if (Array.isArray(o[k])) return o[k] as T[]
    }
    for (const k of Object.keys(o)) {
      if (Array.isArray(o[k])) return o[k] as T[]
    }
  }
  return []
}

/* ───────────────────────── هوية الصفحة ─────────────────────────
   «خط الفروع»: الفروع = محطات على خط واحد (زي خط المترو).
   العنوان هو أول المحطة، والفرع الرئيسي «محطة التبادل»، والفرع الموقوف محطة مغلقة
   (خط متقطّع). أخضر ليموني + فحمي — ومن غير لوحات ومؤشرات زيادة: كل فرع بياناته
   الأساسية بس (العنوان، الهاتف، المبيعات، الربح). */
const num = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/**
 * رقم مضغوط للعرض في الخانات الضيقة:
 *   < 1,000,000       → 999,999            (رقم كامل بفواصل)
 *   1M → 999.5M       → 5.47 مليون
 *   999.5M → 999.5B   → 1.23 مليار
 *   1B+               → 1.23 مليار
 *
 * الرقم الكامل دايمًا موجود في الـ tooltip عن طريق prop الـ `full`.
 */
const fmtBig = (n: number) => {
  const a = Math.abs(n)
  const s = n < 0 ? '−' : ''

  const compose = (div: number, word: string) => {
    const v = a / div
    const d = v >= 100 ? 0 : v >= 10 ? 1 : 2   // 123 / 12.3 / 1.23
    return `${s}${v.toFixed(d).replace(/\.?0+$/, '')} ${word}`
  }

  if (a < 1_000_000) return num(n)
  if (a < 1_000_000_000) {
    // لو هوصل 1000 مليون، اطلع للمليار على طول
    if (a >= 999_500_000) return compose(1_000_000_000, 'مليار')
    return compose(1_000_000, 'مليون')
  }
  return compose(1_000_000_000, 'مليار')
}

const toLatinDigits = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

const PRIMARY_BTN = 'border-0 bg-lime-400 text-stone-900 shadow-sm hover:bg-lime-300 focus-visible:ring-lime-500/40'

const LIME_RAMP = ['#4d7c0f', '#65a30d', '#84cc16', '#a3e635']
const UNASSIGNED_COLOR = '#a8a29e'

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

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [bs, rs] = await Promise.all([
        api<Branch[]>('/api/branches'),
        api<BranchReport[]>('/api/reports/branches'),
      ])
      // 🛡️ v13: تطبيع صارم — أي شكل رد ({data:[...]} أو مصفوفة) بينتهي مصفوفة
      // فمستحيل شاشة الفروع تقع على .map بأي شكل رد من السيرفر أو الكاش
      setBranches(Array.isArray(bs) ? bs : asArrayBranches<Branch>(bs))
      setReports(Array.isArray(rs) ? rs : asArrayBranches<BranchReport>(rs))
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الفروع')
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => { load() }, [load])

  useDataRefresh(['branches', 'sales'], load)

  const reloadBranchesOnly = React.useCallback(async (opts?: {
    added?: { id: number; name: string; isMain: boolean }
    deletedId?: number
    renamed?: { id: number; name: string }
  }) => {
    try {
      const bs = await api<Branch[]>('/api/branches')
      setBranches(bs)

      if (opts?.added) {
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
        const renamed = opts.renamed
        setReports((prev) =>
          prev.map((r) =>
            r.branchId === renamed.id ? { ...r, name: renamed.name } : r,
          ),
        )
      }
    } catch (e: any) {
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
        void reloadBranchesOnly({ renamed: { id: editing.id, name: form.name.trim() } })
      } else {
        const created = await api<Branch>('/api/branches', { method: 'POST', body: form })
        // 🛡️ v11: أوفلاين الرد بيبقى تأكيد حفظ محلي ({ok, offline:true}) من غير
        // id — والفرع بيتدمج تلقائياً في كاش /api/branches المحلي، فبنسيب
        // الإضافة المحلية اليدوية للرد الأونلاين بس.
        if ((created as any)?.offline) {
          toast.success('تم حفظ الفرع محلياً — سيتم المزامنة عند عودة الاتصال')
          setOpen(false)
          void reloadBranchesOnly({})
        } else {
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

  const totals = React.useMemo(() => {
    return reports.reduce((acc, r) => ({
      sales: acc.sales + r.totalSales,
      profit: acc.profit + r.totalProfit,
      count: acc.count + r.salesCount,
      products: acc.products + r.productCount,
    }), { sales: 0, profit: 0, count: 0, products: 0 })
  }, [reports])

  const exportPdf = () => {
    let pdfNo = 0
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
        rows: reports.map((r) => [
          r.branchId === 0 ? '—' : String(++pdfNo),
          r.branchId === 0 ? 'غير مسند لفرع' : r.name + (r.isMain ? ' (رئيسي)' : ''),
          r.branchId === 0 ? '—' : branches.find((b) => b.id === r.branchId)?.active === false ? 'موقوف' : 'نشط',
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

  const toggleActive = async (b: Branch) => {
    if (b.isMain) {
      toast.error('الفرع الرئيسي لازم يفضل مفتوح — عيّن فرعاً آخر كرئيسي أولاً')
      return
    }
    const next = !b.active
    setBranches((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: next } : x)))
    try {
      await api(`/api/branches/${b.id}`, { method: 'PATCH', body: { active: next } })
      toast.success(next ? `تم تفعيل ${b.name}` : `تم إيقاف ${b.name}`)
    } catch (e: any) {
      setBranches((prev) => prev.map((x) => (x.id === b.id ? { ...x, active: b.active } : x)))
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  const summary = React.useMemo(() => {
    let k = 0
    const segs = [...reports]
      .filter((r) => r.totalSales > 0)
      .sort((x, y) => y.totalSales - x.totalSales)
      .map((r) => ({
        id: r.branchId,
        name: r.branchId === 0 ? 'غير مسند لفرع' : r.name,
        unassigned: r.branchId === 0,
        sales: r.totalSales,
        count: r.salesCount,
        color: r.branchId === 0 ? UNASSIGNED_COLOR : LIME_RAMP[k++ % LIME_RAMP.length],
      }))
    const orphan = segs.find((g) => g.unassigned) ?? null
    const unassignedProducts = reports.find((r) => r.branchId === 0)?.productCount ?? 0
    return {
      segs,
      orphan,
      onlyOrphan: segs.length === 1 && segs[0].unassigned,
      branchProducts: totals.products - unassignedProducts,
      unassignedProducts,
      margin: totals.sales > 0 ? (totals.profit / totals.sales) * 100 : 0,
      avg: totals.count > 0 ? totals.sales / totals.count : 0,
    }
  }, [reports, totals])

  const [search, setSearch] = React.useState('')
  const showSearch = branches.length > 6
  const ordered = React.useMemo(
    () =>
      [...branches].sort(
        (x, y) => Number(y.isMain) - Number(x.isMain) || new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime(),
      ),
    [branches],
  )
  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ordered
    return ordered.filter((b) => `${b.name} ${b.address ?? ''} ${b.phone ?? ''}`.toLowerCase().includes(q))
  }, [ordered, search])

  const [drawn, setDrawn] = React.useState(false)
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  let stationNo = 0

  const orphanNotice = (mt: string) =>
    summary.orphan && (
      <div className={cn('flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed sm:items-center sm:px-3.5 sm:text-xs', mt)}>
        <Link2 className="mt-0.5 size-4 shrink-0 text-amber-600 sm:mt-0 dark:text-amber-400" />
        <p className="min-w-0" title={`${num(summary.orphan.count)} فاتورة بقيمة ${num(summary.orphan.sales)} جنيه`}>
          {summary.onlyOrphan ? 'كل مبيعاتك' : 'جزء من مبيعاتك'} اتسجّل من غير فرع.{' '}
          <Link href="/users" className="font-bold text-amber-700 underline underline-offset-2 hover:no-underline dark:text-amber-400">
            اربط المستخدمين بالفروع
          </Link>{' '}
          علشان تتحسب على كل فرع.
        </p>
      </div>
    )

  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-4">
      <ol className="relative">
        {/* ═════════ أول المحطة: العنوان + ملخص الأداء ═════════ */}
        <Row line drawn={drawn} index={0}>
          <span className="flex size-10 items-center justify-center rounded-full bg-lime-400 text-stone-900 shadow-md ring-4 ring-lime-400/25 sm:size-12">
            <Store className="size-5 sm:size-6" />
          </span>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 pb-1 pt-0.5 sm:gap-x-6">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">الفروع</h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                {loading && branches.length === 0
                  ? ' '
                  : branches.length === 0
                    ? 'ابدأ خطك بأول فرع'
                    : `${num(branches.length)} ${branches.length > 2 && branches.length < 11 ? 'فروع' : 'فرع'} على الخط`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openNew} className={PRIMARY_BTN} size="sm">
                <Plus className="size-4" />
                فرع جديد
              </Button>
              <Button variant="outline" size="icon" onClick={exportPdf} disabled={loading} title="تصدير PDF" aria-label="تصدير PDF" className="size-9">
                <FileText className="size-4" />
              </Button>
            </div>
          </div>

          {loading && reports.length === 0 ? (
            <Skeleton className="mt-3 h-[104px] w-full rounded-2xl" />
          ) : branches.length === 1 ? (
            orphanNotice('mt-3')
          ) : (
            branches.length > 1 && (
              <div className="relative mt-3 overflow-hidden rounded-2xl border bg-card p-3 pt-5 shadow-sm sm:p-4 sm:pt-5">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-lime-400 via-lime-500 to-lime-600" />
                <div className="grid grid-cols-2 gap-x-1 gap-y-4 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-x-reverse">
                  <Stat icon={Wallet} label="إجمالي المبيعات" value={fmtBig(totals.sales)} full={num(totals.sales)} unit="جنيه" big />
                  <Stat icon={TrendingUp} label="الأرباح" value={fmtBig(totals.profit)} full={num(totals.profit)} sub={totals.sales > 0 ? `هامش ${summary.margin.toFixed(summary.margin >= 10 ? 0 : 1)}%` : undefined} lime />
                  <Stat icon={Receipt} label="الفواتير" value={num(totals.count)} sub={totals.count > 0 ? `متوسط ${num(Math.round(summary.avg))} جنيه` : undefined} />
                  <Stat
                    icon={Boxes}
                    label="أصناف الفروع"
                    value={num(summary.branchProducts)}
                    sub={summary.unassignedProducts > 0 ? `+ ${num(summary.unassignedProducts)} غير مسندة لفرع` : `على ${num(branches.length)} ${branches.length > 2 && branches.length < 11 ? 'فروع' : 'فرع'}`}
                  />
                </div>

                {summary.segs.length > 0 && !summary.onlyOrphan && (
                  <div className="mt-4 border-t pt-3.5">
                    <p className="mb-2 text-[11px] font-semibold text-muted-foreground">مساهمة كل فرع في المبيعات</p>
                    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                      {summary.segs.map((g) => (
                        <div
                          key={g.id}
                          title={`${g.name}: ${formatCurrency(g.sales)}`}
                          className="h-full min-w-[6px] first:rounded-s-full last:rounded-e-full"
                          style={{ width: `${(g.sales / (totals.sales || 1)) * 100}%`, backgroundColor: g.color }}
                        />
                      ))}
                    </div>
                    <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 sm:gap-x-5">
                      {summary.segs.map((g) => (
                        <li key={g.id} className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                          <span className="font-medium">{g.name}</span>
                          <span className="tabular-nums text-muted-foreground">{Math.round((g.sales / (totals.sales || 1)) * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {orphanNotice(summary.onlyOrphan ? 'mt-4' : 'mt-3')}
              </div>
            )
          )}

          {showSearch && (
            <div className="relative mt-3 max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عن فرع..." className="h-10 rounded-xl pr-9 pl-9" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute top-1/2 left-2.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="مسح البحث">
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}
        </Row>

        {/* ═════════ المحطات ═════════ */}
        {loading && branches.length === 0
          ? Array.from({ length: 2 }).map((_, i) => (
              <Row key={i} line={i < 1} drawn={drawn} index={i + 1}>
                <span className="size-9 rounded-full border-[3px] border-lime-500/40 bg-background" />
                <Skeleton className="h-36 w-full rounded-2xl" />
              </Row>
            ))
          : shown.map((b, i) => {
              if (!b.isMain) stationNo += 1
              const next = shown[i + 1]
              return (
                <Row key={b.id} line drawn={drawn} index={i + 1} dashed={next ? !next.active : false}>
                  <StationNode main={b.isMain} active={b.active} no={stationNo} title={`افتُتح ${new Date(b.createdAt).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`} />
                  <Station
                    b={b}
                    r={reportMap.get(b.id)}
                    totalSales={totals.sales}
                    onEdit={() => openEdit(b)}
                    onDelete={() => remove(b)}
                    onToggle={() => toggleActive(b)}
                  />
                </Row>
              )
            })}

        {!loading && showSearch && search && shown.length === 0 && (
          <Row line={false} drawn={drawn} index={1}>
            <span className="size-9 rounded-full border-[3px] border-dashed border-muted-foreground/40 bg-background" />
            <p className="py-2.5 text-sm text-muted-foreground">مفيش فرع بالاسم ده</p>
          </Row>
        )}

        {/* ═════════ آخر الخط: محطة جديدة ═════════ */}
        {!(loading && branches.length === 0) && (
          <Row line={false} drawn={drawn} index={shown.length + 1}>
            <span className="flex size-9 items-center justify-center rounded-full border-2 border-dashed border-lime-500/70 bg-background text-lime-700 dark:text-lime-400">
              <Plus className="size-4" />
            </span>
            <button
              type="button"
              onClick={openNew}
              className="group flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-border px-3.5 py-3 text-start transition-colors hover:border-lime-500/70 hover:bg-lime-500/5 focus-visible:ring-[3px] focus-visible:ring-lime-500/40 focus-visible:outline-none sm:px-4 sm:py-3.5"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold">{branches.length === 0 ? 'افتح أول فرع' : 'محطة جديدة'}</span>
                <span className="block truncate text-xs text-muted-foreground">اسم وعنوان ورقم وابدأ تبيع</span>
              </span>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lime-400 text-stone-900 transition-transform group-hover:rotate-90">
                <Plus className="size-4" />
              </span>
            </button>
          </Row>
        )}
      </ol>

      {/* ═════════ نافذة الفرع ═════════ */}
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
          <DialogHeader className="border-b bg-gradient-to-br from-lime-400/20 to-lime-500/5 p-4 text-start sm:p-5">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="flex size-9 items-center justify-center rounded-full bg-lime-400 text-stone-900 shadow-sm">
                {editing ? <Pencil className="size-[18px]" /> : <Store className="size-[18px]" />}
              </span>
              {editing ? 'تعديل فرع' : 'فرع جديد'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editing ? 'عدّل بيانات الفرع — مبيعاته وأرباحه زي ما هي.' : 'اسم وعنوان ورقم، وهتبقى محطة جديدة على الخط.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-4 sm:space-y-5 sm:p-5">
            <div className="space-y-2">
              <Label htmlFor="b-name">
                اسم الفرع <span className="text-destructive">*</span>
              </Label>
              <Input
                id="b-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && !saving && save()}
                placeholder="مثال: فرع وسط البلد"
                autoFocus
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-address">العنوان</Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="b-address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && !saving && save()}
                  placeholder="اختياري"
                  className="h-11 pr-9"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="b-phone">رقم الهاتف</Label>
                <div className="relative">
                  <Smartphone className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="b-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && !saving && save()}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                    className="h-11 pr-9 text-left font-semibold tabular-nums"
                  />
                </div>
              </div>
              <label
                htmlFor="b-active"
                title="الفروع الموقوفة لا تظهر في الاختيارات الجديدة"
                className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 text-sm font-semibold"
              >
                {form.active ? 'مفتوح' : 'موقوف'}
                <Switch id="b-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              </label>
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-3 sm:justify-between sm:p-4">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button size="lg" onClick={save} disabled={saving} className={cn('min-w-32 sm:min-w-36', PRIMARY_BTN)}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing ? 'حفظ' : 'إنشاء الفرع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ───────────────────────── مكوّنات صغيرة ───────────────────────── */

function Row({
  children,
  line,
  dashed,
  drawn,
  index,
}: {
  children: React.ReactNode
  line: boolean
  dashed?: boolean
  drawn: boolean
  index: number
}) {
  const kids = React.Children.toArray(children)
  return (
    <li className="relative flex gap-2.5 pb-5 last:pb-0 sm:gap-4">
      {line && (
        <span
          aria-hidden
          className={cn(
            'absolute start-[19px] top-6 origin-top transition-transform duration-500 ease-out motion-reduce:transition-none sm:start-[22px]',
            dashed ? 'w-0 border-s-4 border-dashed border-stone-300 dark:border-stone-600' : 'w-1 rounded-full bg-lime-500 dark:bg-lime-400',
          )}
          style={{ bottom: -24, transform: drawn ? 'scaleY(1)' : 'scaleY(0)', transitionDelay: `${Math.min(index, 8) * 110}ms` }}
        />
      )}
      <div className="relative z-10 flex h-12 w-10 shrink-0 items-center justify-center sm:w-12">{kids[0]}</div>
      <div className="min-w-0 flex-1">{kids.slice(1)}</div>
    </li>
  )
}

function StationNode({ main, active, no, title }: { main: boolean; active: boolean; no: number; title: string }) {
  if (main) {
    return (
      <span
        title={`الفرع الرئيسي — ${title}`}
        className="flex size-10 items-center justify-center rounded-full border-[5px] border-lime-400 bg-stone-900 text-lime-400 ring-4 ring-lime-400/25 sm:size-11"
      >
        <Crown className="size-4" />
      </span>
    )
  }
  return (
    <span
      title={title}
      className={cn(
        'flex size-8 items-center justify-center rounded-full border-[3px] text-[11px] font-extrabold tabular-nums sm:size-9 sm:text-xs',
        active ? 'border-lime-400 bg-stone-900 text-lime-400' : 'border-dashed border-stone-400 bg-background text-muted-foreground dark:border-stone-500',
      )}
    >
      {no}
    </span>
  )
}

function PhoneTag({ phone }: { phone: string }) {
  return (
    <span dir="ltr" className="inline-flex max-w-full items-center gap-1.5">
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-lime-500/15 text-lime-700 dark:text-lime-400">
        <Smartphone className="size-3.5" strokeWidth={2.25} />
      </span>
      <span className="truncate text-[12px] font-bold tracking-wide tabular-nums text-foreground/90 sm:text-[13px]">{toLatinDigits(phone.trim())}</span>
    </span>
  )
}

function Stat({
  label, value, unit, sub, big, lime, full, icon: Icon,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: string
  unit?: string
  sub?: string
  big?: boolean
  lime?: boolean
  full?: string
}) {
  const zero = value === '0'
  return (
    <div className="min-w-0 px-1 text-center sm:px-3">
      {Icon && (
        <span className="mx-auto mb-1.5 flex size-7 items-center justify-center rounded-xl bg-lime-500/15 text-lime-700 sm:size-8 dark:text-lime-400">
          <Icon className="size-3.5 sm:size-4" />
        </span>
      )}
      <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-[11px]">{label}</p>
      <p
        title={full && full !== value ? `${full} جنيه` : undefined}
        className={cn(
          'mt-0.5 truncate leading-tight font-extrabold tabular-nums',
          big ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl',
          zero ? 'text-muted-foreground/60' : lime ? 'text-lime-700 dark:text-lime-400' : 'text-foreground',
        )}
      >
        {value}
        {unit && <span className="ms-1 text-[10px] font-medium text-muted-foreground sm:text-[11px]">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">{sub}</p>}
    </div>
  )
}

/** خانة إحصائية للجوال — بسيطة بدون أيقونة */
function MobileStat({ label, value, unit, sub, lime }: { label: string; value: string; unit?: string; sub?: React.ReactNode; lime?: boolean }) {
  const zero = value === '0'
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-0.5 truncate text-lg leading-tight font-extrabold tabular-nums',
        zero ? 'text-muted-foreground/60' : lime ? 'text-lime-700 dark:text-lime-400' : 'text-foreground',
      )}>
        {value}
        {unit && <span className="ms-1 text-[10px] font-medium text-muted-foreground">{unit}</span>}
      </p>
      {sub && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** صف اتصال للجوال — كامل العرض، التفاف طبيعي للكلام */
function MobileContactRow({
  icon: Icon, label, value, ltr, action,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  value: string
  ltr?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-background/70 px-2.5 py-2">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-lime-500/15 text-lime-700 dark:text-lime-400">
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
        <p
          dir={ltr ? 'ltr' : undefined}
          className={cn('text-[12px] font-semibold leading-snug break-words', ltr && 'text-left tracking-wide tabular-nums')}
        >
          {value}
        </p>
      </div>
      {action}
    </div>
  )
}

const pctText = (v: number) => (v > 0 && v < 1 ? '<1%' : `${v.toFixed(v >= 10 ? 0 : 1).replace(/\.0$/, '')}%`)

function LiveDot() {
  return (
    <span className="relative flex size-2 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime-500 opacity-60 motion-reduce:hidden" />
      <span className="relative inline-flex size-2 rounded-full bg-lime-500" />
    </span>
  )
}

function Mini({ label, value, sub, lime, full }: { label: string; value: string; sub?: React.ReactNode; lime?: boolean; full?: string }) {
  const zero = value === '0'
  return (
    <div className="min-w-0 px-2 text-center">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        title={full && full !== value ? `${full} جنيه` : undefined}
        className={cn(
          'mt-0.5 truncate text-xl leading-tight font-extrabold tabular-nums',
          zero ? 'text-muted-foreground/60' : lime ? 'text-lime-700 dark:text-lime-400' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {sub && <div className="mt-1 truncate text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function ContactChip({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border bg-background/70 py-1 ps-1.5 pe-2.5 text-[13px]">
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-lime-500/15 text-lime-700 dark:text-lime-400">
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
      {children}
    </span>
  )
}

/* ─────────────────────── البطاقة (تخطيطان) ─────────────────────── */

function Station({
  b, r, totalSales, onEdit, onDelete, onToggle,
}: {
  b: Branch
  r: BranchReport | undefined
  totalSales: number
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const sales = r?.totalSales ?? 0
  const profit = r?.totalProfit ?? 0
  const count = r?.salesCount ?? 0
  const products = r?.productCount ?? 0
  const margin = sales > 0 ? (profit / sales) * 100 : 0
  const avg = count > 0 ? sales / count : 0
  const share = totalSales > 0 ? (sales / totalSales) * 100 : 0
  const hasSales = sales > 0 || count > 0
  const edge = b.active ? '#84cc16' : '#a8a29e'
  const opened = new Date(b.createdAt).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
  const mapsHref = b.address?.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`
    : undefined

  const badges = (
    <>
      {b.isMain && (
        <span className="inline-flex items-center gap-1 rounded-full bg-lime-400/25 px-2 py-0.5 text-[10px] font-bold text-lime-800 sm:px-2.5 sm:text-[11px] dark:text-lime-300">
          <Crown className="size-3" />
          الفرع الرئيسي
        </span>
      )}
      {b.active ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-500/10 px-2 py-0.5 text-[10px] font-bold text-lime-700 sm:px-2.5 sm:text-[11px] dark:text-lime-400">
          <LiveDot />
          شغّال
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-stone-500/15 px-2 py-0.5 text-[10px] font-bold text-stone-600 sm:px-2.5 sm:text-[11px] dark:text-stone-300">
          <Power className="size-3" />
          موقوف
        </span>
      )}
    </>
  )

  const actions = (
    <>
      <Button variant="outline" size="icon" className="size-8 rounded-lg lg:size-9 lg:rounded-xl" onClick={onEdit} title="تعديل" aria-label="تعديل الفرع">
        <Pencil className="size-3.5 lg:size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 rounded-lg lg:size-9 lg:rounded-xl" aria-label="خيارات الفرع">
            <MoreVertical className="size-3.5 lg:size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {!b.isMain && (
            <DropdownMenuItem onClick={onToggle}>
              <Power className="size-4" />
              {b.active ? 'إيقاف الفرع' : 'تفعيل الفرع'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={onDelete}
            disabled={b.isMain}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="size-4" />
            {b.isMain ? 'الرئيسي لا يُحذف' : 'حذف الفرع'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  return (
    <article
      className={cn(
        'animate-in-up motion-reduce:animate-none relative rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0',
        !b.active && 'bg-muted/40',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 start-0 w-2.5 rounded-s-[15px] sm:w-3"
        style={{
          backgroundColor: edge,
          backgroundImage: 'radial-gradient(rgba(0,0,0,0.22) 1.3px, transparent 1.6px)',
          backgroundSize: '7px 7px',
        }}
      />
      <span aria-hidden className="absolute -start-[17px] top-[22px] h-1 w-[17px] rounded-full sm:-start-[21px] sm:w-[21px]" style={{ backgroundColor: edge }} />

      {/* ══════════════ 🖥️ ديسكتوب — التخطيط الأفقي (lg+) ══════════════ */}
      <div className="hidden lg:grid gap-6 p-4 ps-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_auto] lg:items-center">
        {/* عمود 1: الهوية والاتصال */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h2 className="text-xl font-extrabold leading-snug break-words [overflow-wrap:anywhere]">{b.name}</h2>
            {badges}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {b.address?.trim() ? (
              <ContactChip icon={MapPin}>
                <span className="min-w-0 break-words">{b.address}</span>
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-lime-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-lime-700 hover:bg-lime-500/20 focus-visible:ring-[3px] focus-visible:ring-lime-500/40 focus-visible:outline-none dark:text-lime-400"
                >
                  <Navigation className="size-3" />
                  خريطة
                </a>
              </ContactChip>
            ) : (
              <AddChip icon={MapPin} label="أضف العنوان" onClick={onEdit} />
            )}
            {b.phone?.trim() ? (
              <span className="inline-flex max-w-full items-center rounded-xl border bg-background/70 py-1 ps-1.5 pe-2.5">
                <PhoneTag phone={b.phone} />
              </span>
            ) : (
              <AddChip icon={Smartphone} label="أضف رقم الهاتف" onClick={onEdit} />
            )}
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3" />
            افتُتح {opened}
          </p>
        </div>

        {/* عمود 2: لوحة الأرقام */}
        <div className="rounded-xl border border-lime-500/20 bg-lime-500/[0.06] p-3.5 dark:bg-lime-400/[0.07]">
          {hasSales ? (
            <div className="grid gap-x-4 gap-y-3.5 grid-cols-[1.15fr_2fr] items-center">
              <div className="min-w-0 border-e border-lime-500/20 pe-4">
                <p className="text-[11px] font-medium text-muted-foreground">المبيعات</p>
                <p title={`${num(sales)} جنيه`} className="mt-0.5 truncate text-3xl leading-tight font-extrabold tabular-nums">
                  {fmtBig(sales)}
                  <span className="ms-1 text-[11px] font-medium text-muted-foreground">جنيه</span>
                </p>
                <div className="mt-2" title="نسبة الفرع من إجمالي مبيعات المحل">
                  <div className="h-1.5 overflow-hidden rounded-full bg-lime-500/15">
                    <div
                      className="h-full rounded-full bg-lime-500 transition-[width] duration-500 ease-out dark:bg-lime-400"
                      style={{ width: `${share > 0 ? Math.max(share, 3) : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold tabular-nums text-muted-foreground">{pctText(share)} من مبيعات المحل</p>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-x-reverse divide-lime-500/20">
                <Mini
                  lime
                  label="الأرباح"
                  value={fmtBig(profit)}
                  full={num(profit)}
                  sub={
                    sales > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-lime-500/15 px-1.5 py-px font-bold text-lime-800 dark:text-lime-300">
                        <TrendingUp className="size-2.5" />
                        هامش {margin.toFixed(margin >= 10 ? 0 : 1)}%
                      </span>
                    ) : undefined
                  }
                />
                <Mini label="الفواتير" value={num(count)} sub={count > 0 ? `متوسط ${num(Math.round(avg))} جنيه` : undefined} />
                <Mini label="الأصناف" value={num(products)} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lime-500/15 text-lime-700 dark:text-lime-400">
                  <Hourglass className="size-4" />
                </span>
                لسه مفيش مبيعات من الفرع ده — أرقامه هتظهر هنا أول ما يبيع
              </p>
              <div className="shrink-0 border-s border-lime-500/20 ps-4">
                <Mini label="الأصناف" value={num(products)} />
              </div>
            </div>
          )}
        </div>

        {/* عمود 3: الإجراءات */}
        <div className="flex flex-col items-center gap-1">
          {actions}
        </div>
      </div>

      {/* ══════════════ 📱 موبايل/تابلت — تخطيط عمودي ══════════════ */}
      <div className="lg:hidden p-3.5 ps-5 sm:p-4 sm:ps-6">
        {/* رأس: اسم + شارات + إجراءات */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-base font-extrabold leading-snug break-words sm:text-lg">{b.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {badges}
            </div>
          </div>
          <div className="-me-1 -mt-1 flex shrink-0 items-center gap-0.5">
            {actions}
          </div>
        </div>

        {/* اتصال: صفوف كاملة العرض */}
        {(b.address?.trim() || b.phone?.trim()) && (
          <div className="mt-3 space-y-2">
            {b.address?.trim() && (
              <MobileContactRow
                icon={MapPin}
                label="العنوان"
                value={b.address}
                action={
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-lime-500/10 px-2 py-1 text-[10px] font-semibold text-lime-700 hover:bg-lime-500/20 focus-visible:ring-[3px] focus-visible:ring-lime-500/40 focus-visible:outline-none dark:text-lime-400"
                  >
                    <Navigation className="size-3" />
                    خريطة
                  </a>
                }
              />
            )}
            {!b.address?.trim() && (
              <AddChip icon={MapPin} label="أضف العنوان" onClick={onEdit} />
            )}
            {b.phone?.trim() && (
              <MobileContactRow
                icon={Smartphone}
                label="الهاتف"
                value={toLatinDigits(b.phone.trim())}
                ltr
              />
            )}
            {!b.phone?.trim() && (
              <AddChip icon={Smartphone} label="أضف رقم الهاتف" onClick={onEdit} />
            )}
          </div>
        )}

        {/* إحصائيات: 2×2 على الموبايل */}
        <div className="mt-3 overflow-hidden rounded-xl border border-lime-500/20 bg-lime-500/[0.06] dark:bg-lime-400/[0.07]">
          {hasSales ? (
            <div className="grid grid-cols-2">
              <div className="border-b border-e border-lime-500/20 p-3">
                <MobileStat label="إجمالي المبيعات" value={fmtBig(sales)} unit="جنيه" />
              </div>
              <div className="border-b border-lime-500/20 p-3">
                <MobileStat
                  lime
                  label="الأرباح"
                  value={fmtBig(profit)}
                  sub={sales > 0 ? `هامش ${margin.toFixed(margin >= 10 ? 0 : 1)}%` : undefined}
                />
              </div>
              <div className="border-e border-lime-500/20 p-3">
                <MobileStat
                  label="الفواتير"
                  value={num(count)}
                  sub={count > 0 ? `متوسط ${num(Math.round(avg))} جنيه` : undefined}
                />
              </div>
              <div className="p-3">
                <MobileStat label="الأصناف" value={num(products)} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lime-500/15 text-lime-700 dark:text-lime-400">
                <Hourglass className="size-4" />
              </span>
              <p className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                لسه مفيش مبيعات — الأرقام هتظهر هنا أول ما يبيع
              </p>
            </div>
          )}
        </div>

        {/* تاريخ الافتتاح */}
        <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground sm:text-[11px]">
          <CalendarDays className="size-3" />
          افتُتح {opened}
        </p>
      </div>
    </article>
  )
}

function AddChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-2.5 py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-lime-500/70 hover:bg-lime-500/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-lime-500/40 focus-visible:outline-none sm:w-auto sm:py-1.5 sm:text-xs"
    >
      <Plus className="size-3" />
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}