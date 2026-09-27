'use client'

import * as React from 'react'
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Star,
  Phone,
  MapPin,
  TrendingUp,
  DollarSign,
  Package,
  ShoppingCart,
  Crown,
  FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            إدارة الفروع
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أنشئ فروع متجرك وتابع أداء كل فرع على حدة (مبيعات، أرباح، أصناف).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPdf} disabled={loading}>
            <FileText className="size-4" />
            تصدير PDF
          </Button>
          <Button onClick={openNew}>
            <Plus className="ml-1 size-4" />
            فرع جديد
          </Button>
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<ShoppingCart className="size-4" />}
          label="إجمالي المبيعات"
          value={formatCurrency(totals.sales)}
          tone="primary"
          loading={loading}
        />
        <StatCard
          icon={<DollarSign className="size-4" />}
          label="إجمالي الأرباح"
          value={formatCurrency(totals.profit)}
          tone="emerald"
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="عدد الفواتير"
          value={String(totals.count)}
          tone="default"
          loading={loading}
        />
        <StatCard
          icon={<Package className="size-4" />}
          label="إجمالي الأصناف"
          value={String(totals.products)}
          tone="default"
          loading={loading}
        />
      </div>

      <Tabs defaultValue="cards" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cards">بطاقات الفروع</TabsTrigger>
          <TabsTrigger value="report">تقرير الأداء</TabsTrigger>
        </TabsList>

        {/* Cards view */}
        <TabsContent value="cards" className="space-y-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56" />
              ))
            ) : branches.length === 0 ? (
              <div className="md:col-span-2 xl:col-span-3">
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <Building2 className="mb-3 size-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">لا توجد فروع بعد</p>
                    <Button className="mt-4" onClick={openNew}>
                      <Plus className="ml-1 size-4" />
                      إنشاء أول فرع
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              branches.map(b => {
                const r = reportMap.get(b.id)
                return (
                  <Card key={b.id} className={b.isMain ? 'border-primary/40 ring-1 ring-primary/20' : ''}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <div className={`flex size-9 items-center justify-center rounded-lg ${b.isMain ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {b.isMain ? <Crown className="size-4" /> : <Building2 className="size-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              {b.name}
                              {b.isMain && (
                                <Badge variant="outline" className="border-primary/30 bg-primary/5 px-1 text-[10px] text-primary">
                                  <Star className="ml-0.5 size-2.5" />
                                  رئيسي
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs font-normal text-muted-foreground">
                              أُنشئ <DateTimeCell date={b.createdAt} showTime={false} className="align-middle" />
                            </div>
                          </div>
                        </span>
                        {!b.active && (
                          <Badge variant="destructive" className="text-[10px]">موقوف</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {b.address ? (
                          <p className="flex items-center gap-1.5">
                            <MapPin className="size-3" />
                            {b.address}
                          </p>
                        ) : (
                          <p className="flex items-center gap-1.5 opacity-60">
                            <MapPin className="size-3" />
                            لا يوجد عنوان
                          </p>
                        )}
                        {b.phone ? (
                          <p className="flex items-center gap-1.5" dir="ltr">
                            <Phone className="size-3" />
                            {b.phone}
                          </p>
                        ) : (
                          <p className="flex items-center gap-1.5 opacity-60" dir="ltr">
                            <Phone className="size-3" />
                            لا يوجد هاتف
                          </p>
                        )}
                      </div>

                      {/* Mini stats */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-muted/50 p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">مبيعات</div>
                          <div className="text-xs font-bold">{formatCurrency(r?.totalSales ?? 0)}</div>
                        </div>
                        <div className="rounded-lg bg-success-subtle p-2 text-center dark:bg-success-subtle/30">
                          <div className="text-[10px] text-muted-foreground">أرباح</div>
                          <div className="text-xs font-bold text-success-subtle-foreground dark:text-success-subtle-foreground">
                            {formatCurrency(r?.totalProfit ?? 0)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">أصناف</div>
                          <div className="text-xs font-bold">{r?.productCount ?? 0}</div>
                        </div>
                      </div>

                      <div className="flex gap-2 border-t pt-3">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(b)}>
                          <Pencil className="ml-1 size-3" />
                          تعديل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive-subtle-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
                          onClick={() => remove(b)}
                          disabled={b.isMain}
                          title={b.isMain ? 'لا يمكن حذف الفرع الرئيسي' : 'حذف الفرع'}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </TabsContent>

        {/* Report table */}
        <TabsContent value="report" className="space-y-0">
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">تقرير أداء الفروع</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden overflow-auto lg:block">
                <Table fixed>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الفرع</TableHead>
                      <TableHead className="w-32 text-center">عدد الفواتير</TableHead>
                      <TableHead className="w-40 text-center">إجمالي المبيعات</TableHead>
                      <TableHead className="w-36 text-center">الأرباح</TableHead>
                      <TableHead className="w-28 text-center">عدد المنتجات</TableHead>
                      <TableHead className="w-36 text-center">متوسط الفاتورة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          <Building2 className="mx-auto mb-2 size-8 opacity-40" />
                          لا يوجد بيانات بعد
                        </TableCell>
                      </TableRow>
                    ) : (
                      reports.map(r => {
                        const avg = r.salesCount > 0 ? r.totalSales / r.salesCount : 0
                        return (
                          <TableRow key={r.branchId} className={r.isMain ? 'bg-primary/5' : ''}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {r.isMain && <Crown className="size-3.5 text-primary" />}
                                {r.name}
                                {r.isMain && (
                                  <Badge variant="outline" className="border-primary/30 bg-primary/5 px-1 text-[10px] text-primary">
                                    رئيسي
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{r.salesCount}</TableCell>
                            <TableCell className="text-center font-medium">{formatCurrency(r.totalSales)}</TableCell>
                            <TableCell className="text-center font-medium text-success-subtle-foreground dark:text-success-subtle-foreground">
                              {formatCurrency(r.totalProfit)}
                            </TableCell>
                            <TableCell className="text-center">{r.productCount}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{formatCurrency(avg)}</TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                  {reports.length > 0 && (
                    <tfoot className="bg-muted/50 font-medium">
                      <TableRow>
                        <TableCell className="font-bold">الإجمالي</TableCell>
                        <TableCell className="text-center font-bold">{totals.count}</TableCell>
                        <TableCell className="text-center font-bold">{formatCurrency(totals.sales)}</TableCell>
                        <TableCell className="text-center font-bold text-success-subtle-foreground dark:text-success-subtle-foreground">
                          {formatCurrency(totals.profit)}
                        </TableCell>
                        <TableCell className="text-center font-bold">{totals.products}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </tfoot>
                  )}
                </Table>
              </div>

              {/*
                نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg.
              */}
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
                {reports.length === 0 ? (
                  <p className="col-span-full py-10 text-center text-muted-foreground">
                    <Building2 className="mx-auto mb-2 size-8 opacity-40" />
                    لا يوجد بيانات بعد
                  </p>
                ) : (
                  reports.map(r => {
                    const avg = r.salesCount > 0 ? r.totalSales / r.salesCount : 0
                    return (
                      <div
                        key={r.branchId}
                        className={cn(
                          'rounded-lg border bg-card p-3',
                          r.isMain && 'bg-primary/5'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {r.isMain && <Crown className="size-3.5 text-primary" />}
                            <p className="font-medium leading-tight">{r.name}</p>
                          </div>
                          {r.isMain && (
                            <Badge variant="outline" className="border-primary/30 bg-primary/5 px-1 text-[10px] text-primary">
                              رئيسي
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-2 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">عدد الفواتير</p>
                            <p className="text-sm font-semibold tabular-nums">{r.salesCount}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">المبيعات</p>
                            <p className="text-sm font-medium tabular-nums">{formatCurrency(r.totalSales)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">الأرباح</p>
                            <p className="text-sm font-medium tabular-nums text-success-subtle-foreground dark:text-success-subtle-foreground">
                              {formatCurrency(r.totalProfit)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">المنتجات</p>
                            <p className="text-sm tabular-nums">{r.productCount}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[10px] text-muted-foreground">متوسط الفاتورة</p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(avg)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              {editing ? 'تعديل فرع' : 'فرع جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>اسم الفرع <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: فرع وسط البلد"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>العنوان</Label>
              <Input
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="العنوان التفصيلي..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>رقم الهاتف</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="01xxxxxxxxx"
                dir="ltr"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="cursor-pointer">الفرع مُفعّل</Label>
                <p className="text-[11px] text-muted-foreground">
                  الفروع الموقوفة لا تظهر في الاختيارات الجديدة
                </p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="ml-1 size-4 animate-spin" />}
              {editing ? 'حفظ التعديلات' : 'إنشاء الفرع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone = 'default',
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: 'default' | 'primary' | 'emerald'
  loading?: boolean
}) {
  const toneClasses =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'emerald'
      ? 'bg-success-subtle text-success-subtle-foreground dark:bg-success-subtle/30 dark:text-success-subtle-foreground'
      : 'bg-muted text-muted-foreground'
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClasses}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-20" />
          ) : (
            <div className="truncate text-base font-bold">{value}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
