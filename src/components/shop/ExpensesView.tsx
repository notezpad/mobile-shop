'use client'

import * as React from 'react'
import {
  Loader2,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  FileSpreadsheet,
  Home,
  Zap,
  Users,
  Truck,
  Wrench,
  Wifi,
  Coffee,
  PackageX,
  MoreHorizontal,
  Search,
  X,
  Lock,
  Receipt,
  Calculator,
  Crown,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DonutChart } from '@/components/charts/donut-chart'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatArabicDate } from '@/lib/format'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'
import { cn } from '@/lib/utils'

/* ───────────────────────── الأنواع والثوابت ───────────────────────── */

// ⚠️ لازم تفضل مطابقة لقايمة الأنواع في /api/expenses (السيرفر بيرفض أي نوع برّاها)
const CATEGORIES = [
  'إيجار',
  'كهرباء ومياه',
  'مرتبات',
  'نقل ومواصلات',
  'صيانة المحل',
  'إنترنت واتصالات',
  'ضيافة',
  'هالك وتالف',
  'أخرى',
] as const

const CATEGORY_META: Record<string, { icon: LucideIcon; color: string }> = {
  'إيجار': { icon: Home, color: '#6366f1' },
  'كهرباء ومياه': { icon: Zap, color: '#f59e0b' },
  'مرتبات': { icon: Users, color: '#10b981' },
  'نقل ومواصلات': { icon: Truck, color: '#0ea5e9' },
  'صيانة المحل': { icon: Wrench, color: '#f97316' },
  'إنترنت واتصالات': { icon: Wifi, color: '#8b5cf6' },
  'ضيافة': { icon: Coffee, color: '#a16207' },
  'هالك وتالف': { icon: PackageX, color: '#ef4444' },
  'أخرى': { icon: MoreHorizontal, color: '#64748b' },
}

const metaOf = (cat: string) =>
  CATEGORY_META[cat] ?? { icon: Receipt, color: '#64748b' }

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000]

interface ExpenseRow {
  id: number
  category: string
  amount: number
  note: string | null
  userName?: string | null
  source?: string | null
  createdAt: string
}

interface ExpensesResponse {
  expenses: ExpenseRow[]
  total: number
  byCategory: Record<string, number>
}

type Period = 'all' | 'today' | 'week' | 'month'

/* ───────────────────────── أدوات مساعدة ───────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0')
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function periodRange(p: Period): { from: string; to: string } {
  const now = new Date()
  if (p === 'today') return { from: toISODate(now), to: toISODate(now) }
  if (p === 'week') {
    const s = new Date(now)
    s.setDate(s.getDate() - 6)
    return { from: toISODate(s), to: toISODate(now) }
  }
  if (p === 'month') {
    return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) }
  }
  return { from: '', to: '' }
}

function dayLabel(key: string): string {
  const today = toISODate(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (key === today) return 'اليوم'
  if (key === toISODate(y)) return 'أمس'
  const [yy, mm, dd] = key.split('-').map(Number)
  return formatArabicDate(new Date(yy, mm - 1, dd))
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** أيقونة التصنيف داخل مربع ملوّن (اللون بيتحدد من ألوان التصنيف الثابتة) */
function CategoryIcon({
  category,
  size = 'md',
}: {
  category: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const { icon: Icon, color } = metaOf(category)
  const box = size === 'lg' ? 'size-12 rounded-2xl' : size === 'sm' ? 'size-8 rounded-lg' : 'size-10 rounded-xl'
  const ic = size === 'lg' ? 'size-6' : size === 'sm' ? 'size-4' : 'size-5'
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center', box)}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <Icon className={ic} />
    </div>
  )
}

/* ───────────────────────── الصفحة ───────────────────────── */

export function ExpensesView() {
  const [data, setData] = React.useState<ExpensesResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  // نموذج الإضافة
  const [addOpen, setAddOpen] = React.useState(false)
  const [category, setCategory] = React.useState<string>(CATEGORIES[0])
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // الفلاتر
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [filterCategory, setFilterCategory] = React.useState('all')
  const [search, setSearch] = React.useState('')

  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (filterCategory !== 'all') params.set('category', filterCategory)
      const res = await api<ExpensesResponse>(`/api/expenses?${params.toString()}`)
      setData(res)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المصروفات')
    } finally {
      setLoading(false)
    }
  }, [from, to, filterCategory])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['expenses'], load)

  const resetForm = () => {
    setAmount('')
    setNote('')
  }

  const submit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر')
      return
    }
    setSaving(true)
    // ⚡ Optimistic: add to local list immediately
    const tempId = Date.now()
    const newExpense: ExpenseRow = {
      id: tempId,
      category,
      amount: amt,
      note: note.trim() || null,
      userName: null,
      source: null,
      createdAt: new Date().toISOString(),
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            expenses: [newExpense, ...(prev.expenses || [])],
            total: (prev.total || 0) + amt,
            byCategory: {
              ...(prev.byCategory || {}),
              [category]: (prev.byCategory?.[category] || 0) + amt,
            },
          }
        : prev,
    )

    try {
      await api('/api/expenses', {
        method: 'POST',
        body: { category, amount: amt, note: note.trim() || null },
      })
      toast.success('تم تسجيل المصروف')
      resetForm()
      setAddOpen(false)
      if (typeof navigator === 'undefined' || navigator.onLine) load()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم تسجيل المصروف (offline — سيتم المزامنة لاحقاً)')
        resetForm()
        setAddOpen(false)
      } else {
        // Revert on real error
        setData((prev) =>
          prev
            ? {
                ...prev,
                expenses: (prev.expenses || []).filter((x) => x.id !== tempId),
                total: Math.max(0, (prev.total || 0) - amt),
                byCategory: {
                  ...(prev.byCategory || {}),
                  [category]: Math.max(0, (prev.byCategory?.[category] || 0) - amt),
                },
              }
            : prev,
        )
        toast.error(e?.message || 'فشل الحفظ')
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    // ⚡ Optimistic: remove from list immediately
    const deleted = data?.expenses?.find((e) => e.id === deleteId)
    setData((prev) =>
      prev
        ? {
            ...prev,
            expenses: (prev.expenses || []).filter((e) => e.id !== deleteId),
            total: Math.max(0, (prev.total || 0) - (deleted?.amount || 0)),
            byCategory: deleted
              ? {
                  ...(prev.byCategory || {}),
                  [deleted.category]: Math.max(
                    0,
                    (prev.byCategory?.[deleted.category] || 0) - deleted.amount,
                  ),
                }
              : prev.byCategory,
          }
        : prev,
    )

    try {
      await api(`/api/expenses/${deleteId}`, { method: 'DELETE' })
      toast.success('تم حذف المصروف')
      setDeleteId(null)
      if (typeof navigator === 'undefined' || navigator.onLine) load()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم حذف المصروف (offline — سيتم المزامنة لاحقاً)')
        setDeleteId(null)
      } else {
        // Revert: أعد تحميل القايمة من السيرفر
        if (deleted) load()
        toast.error(e?.message || 'فشل الحذف')
        setDeleteId(null)
      }
    } finally {
      setDeleting(false)
    }
  }

  /* ───── بيانات مشتقة ───── */

  const expenses = data?.expenses ?? []
  const total = data?.total ?? 0
  const count = expenses.length
  const average = count > 0 ? total / count : 0

  const breakdown = React.useMemo(
    () =>
      Object.entries(data?.byCategory ?? {})
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]),
    [data],
  )
  const topCategory = breakdown[0]

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return expenses
    return expenses.filter(
      (e) =>
        e.category.toLowerCase().includes(q) ||
        (e.note ?? '').toLowerCase().includes(q) ||
        (e.userName ?? '').toLowerCase().includes(q),
    )
  }, [expenses, search])

  const groups = React.useMemo(() => {
    const map = new Map<string, ExpenseRow[]>()
    for (const e of visible) {
      const k = toISODate(new Date(e.createdAt))
      const arr = map.get(k)
      if (arr) arr.push(e)
      else map.set(k, [e])
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => ({
        key,
        items,
        sum: items.reduce((s, x) => s + x.amount, 0),
      }))
  }, [visible])

  const activePeriod: Period | null = (() => {
    for (const p of ['all', 'today', 'week', 'month'] as Period[]) {
      const r = periodRange(p)
      if (r.from === from && r.to === to) return p
    }
    return null
  })()

  const hasFilters = !!(from || to || filterCategory !== 'all' || search)

  const clearFilters = () => {
    setFrom('')
    setTo('')
    setFilterCategory('all')
    setSearch('')
  }

  const applyPeriod = (p: Period) => {
    const r = periodRange(p)
    setFrom(r.from)
    setTo(r.to)
  }

  const periodText =
    from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات'

  const exportExcel = () => {
    if (!data || data.expenses.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('سجل-المصروفات'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل المصروفات',
      periodLabel: from || to ? periodText : undefined,
      sheetName: 'المصروفات',
      columns: [
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'التصنيف', key: 'category', format: 'text' },
        { header: 'المبلغ', key: 'amount', format: 'currency' },
        { header: 'ملاحظة', key: 'note', format: 'text' },
        { header: 'بواسطة', key: 'user', format: 'text' },
      ],
      rows: data.expenses.map((e) => ({
        date: new Date(e.createdAt).toLocaleString('ar-EG'),
        category: e.category,
        amount: e.amount,
        note: e.note || '-',
        user: e.userName || '-',
      })),
      totals: { date: 'الإجمالي', amount: data.total },
    })
  }

  /* ───── إحصائيات الهيرو ───── */
  const todayKey = toISODate(new Date())
  const stats = (() => {
    const perDay = new Map<string, number>()
    let todaySum = 0
    let todayCount = 0
    let maxExpense = 0
    for (const e of expenses) {
      const k = toISODate(new Date(e.createdAt))
      perDay.set(k, (perDay.get(k) ?? 0) + e.amount)
      if (k === todayKey) {
        todaySum += e.amount
        todayCount += 1
      }
      if (e.amount > maxExpense) maxExpense = e.amount
    }
    const activeDays = perDay.size
    const otherDays = activeDays - (todaySum > 0 ? 1 : 0)
    const avgOther = otherDays > 0 ? (total - todaySum) / otherDays : 0
    const vsAvg = todaySum > 0 && avgOther > 0 ? ((todaySum - avgOther) / avgOther) * 100 : null
    const week = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const key = toISODate(d)
      return {
        key,
        label: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
        sum: perDay.get(key) ?? 0,
        isToday: key === todayKey,
      }
    })
    return { todaySum, todayCount, maxExpense, activeDays, vsAvg, week }
  })()
  const topShare = topCategory && total > 0 ? (topCategory[1] / total) * 100 : 0
  const topColor = topCategory ? metaOf(topCategory[0]).color : '#ef4444'
  const noData = loading && !data

  const donutData = breakdown.map(([cat, v]) => ({
    label: cat,
    value: v,
    color: metaOf(cat).color,
  }))

  /* ───────────────────────── الواجهة ───────────────────────── */

  return (
    <div className="space-y-5">
      {/* ═════════ Hero ═════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-500/10 via-transparent to-amber-500/10" />
        <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 size-72 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative space-y-6 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <TrendingDown className="size-4" />
                </span>
                المصروفات
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight tabular-nums text-foreground sm:text-5xl">
                  {loading && !data ? '—' : num(total)}
                </span>
                <span className="text-lg font-semibold text-muted-foreground">جنيه</span>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" />
                {periodText}
              </p>
            </div>

            <WeekBars days={stats.week} />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={exportExcel}
                disabled={!data || data.expenses.length === 0}
                className="bg-background/60 backdrop-blur"
              >
                <FileSpreadsheet className="size-4" />
                تصدير Excel
              </Button>
              <Button variant="gradient" size="lg" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                مصروف جديد
              </Button>
            </div>
          </div>

          {/* إحصائيات سريعة */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon={CalendarDays}
              label="مصروف اليوم"
              accent="#f43f5e"
              value={noData ? '—' : num(stats.todaySum)}
              unit="جنيه"
              foot={
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">{num(stats.todayCount)} عملية</span>
                  {stats.vsAvg !== null && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
                        stats.vsAvg > 0
                          ? 'bg-destructive-subtle text-destructive-subtle-foreground'
                          : 'bg-success-subtle text-success-subtle-foreground',
                      )}
                      title="مقارنة بمتوسط الأيام السابقة"
                    >
                      {stats.vsAvg > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                      {Math.abs(Math.round(stats.vsAvg))}%
                    </span>
                  )}
                </span>
              }
            />
            <StatTile
              icon={Receipt}
              label="عدد العمليات"
              accent="#0ea5e9"
              value={noData ? '—' : num(count)}
              unit="عملية"
              foot={<span className="text-muted-foreground">موزّعة على {num(stats.activeDays)} يوم</span>}
            />
            <StatTile
              icon={Calculator}
              label="متوسط المصروف"
              accent="#f59e0b"
              value={noData ? '—' : num(Math.round(average * 100) / 100)}
              unit="جنيه"
              foot={
                <span className="text-muted-foreground">
                  أكبر عملية: <span className="font-semibold tabular-nums text-foreground">{num(stats.maxExpense)}</span>
                </span>
              }
            />
            <StatTile
              icon={Crown}
              label="أكبر بند"
              accent={topColor}
              value={topCategory ? topCategory[0] : '—'}
              foot={
                topCategory ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between tabular-nums">
                      <span className="font-semibold text-foreground">{formatCurrency(topCategory[1])}</span>
                      <span className="text-muted-foreground">{topShare.toFixed(topShare >= 10 ? 0 : 1)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-slow ease-out"
                        style={{ width: `${Math.max(topShare, 3)}%`, backgroundColor: topColor }}
                      />
                    </div>
                  </div>
                ) : undefined
              }
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ═════════ القايمة (يمين) ═════════ */}
        <div className="space-y-4 lg:col-span-2">
          {/* الفلاتر */}
          <Card className="animate-in-up stagger-1 gap-4 py-4">
            <CardContent className="space-y-3 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ابحث في الملاحظات أو النوع أو الموظف…"
                    className="pr-9"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['all', 'الكل'],
                      ['today', 'اليوم'],
                      ['week', '٧ أيام'],
                      ['month', 'هذا الشهر'],
                    ] as [Period, string][]
                  ).map(([p, label]) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => applyPeriod(p)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        activePeriod === p
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="exp-from" className="text-xs text-muted-foreground">
                    من
                  </Label>
                  <Input
                    id="exp-from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-8 w-[9.5rem] text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="exp-to" className="text-xs text-muted-foreground">
                    إلى
                  </Label>
                  <Input
                    id="exp-to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-8 w-[9.5rem] text-xs"
                  />
                </div>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    <X className="size-3.5" />
                    مسح الفلاتر
                  </Button>
                )}
              </div>

              {/* شرائح الأنواع */}
              <div className="flex flex-wrap gap-1.5">
                <CategoryChip
                  active={filterCategory === 'all'}
                  onClick={() => setFilterCategory('all')}
                  label="كل الأنواع"
                />
                {CATEGORIES.map((c) => (
                  <CategoryChip
                    key={c}
                    active={filterCategory === c}
                    onClick={() => setFilterCategory(filterCategory === c ? 'all' : c)}
                    label={c}
                    color={metaOf(c).color}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* السجل مجمّع باليوم */}
          {loading && !data ? (
            <Card className="gap-0 py-0">
              <CardContent className="space-y-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </CardContent>
            </Card>
          ) : groups.length === 0 ? (
            <Card className="animate-in-up">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
                  <Receipt className="size-8" />
                </div>
                <div>
                  <p className="text-base font-semibold">
                    {hasFilters ? 'مفيش نتائج مطابقة' : 'لسه مفيش مصروفات'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hasFilters
                      ? 'جرّب تغيّر الفلاتر أو الفترة الزمنية'
                      : 'سجّل أول مصروف علشان تتابع مصاريف المحل'}
                  </p>
                </div>
                {hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    مسح الفلاتر
                  </Button>
                ) : (
                  <Button variant="gradient" onClick={() => setAddOpen(true)}>
                    <Plus className="size-4" />
                    مصروف جديد
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className={cn('space-y-5', loading && 'opacity-60 transition-opacity')}>
              {groups.map((g) => (
                <section key={g.key} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <span className="size-1.5 rounded-full bg-primary" />
                      {dayLabel(g.key)}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {g.items.length} {g.items.length > 2 && g.items.length < 11 ? 'عمليات' : 'عملية'}
                      </span>
                    </h3>
                    <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      − {formatCurrency(g.sum)}
                    </span>
                  </div>

                  <Card className="gap-0 divide-y overflow-hidden py-0">
                    {g.items.map((e) => {
                      const locked = e.source === 'damage'
                      return (
                        <div
                          key={e.id}
                          className="group relative flex items-center gap-3 p-3 transition-colors hover:bg-muted/40 sm:p-4"
                        >
                          <span
                            className="absolute inset-y-3 start-0 w-1 rounded-e-full"
                            style={{ backgroundColor: metaOf(e.category).color }}
                          />
                          <CategoryIcon category={e.category} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="font-semibold leading-tight">{e.category}</p>
                              {locked && (
                                <Badge variant="warning" size="sm">
                                  <Lock />
                                  تلقائي
                                </Badge>
                              )}
                            </div>
                            {e.note && (
                              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                                {e.note}
                              </p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                              <span dir="ltr" className="tabular-nums">
                                {timeLabel(e.createdAt)}
                              </span>
                              {e.userName && (
                                <>
                                  <span>•</span>
                                  <span>{e.userName}</span>
                                </>
                              )}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <div className="text-end">
                              <p className="text-base font-bold tabular-nums text-rose-600 dark:text-rose-400 sm:text-lg">
                                − {num(e.amount)}
                                <span className="ms-1 text-[11px] font-medium text-muted-foreground">جنيه</span>
                              </p>
                              {total > 0 && (
                                <p className="text-[10px] tabular-nums text-muted-foreground">
                                  {((e.amount / total) * 100).toFixed(e.amount / total >= 0.1 ? 0 : 1)}% من الإجمالي
                                </p>
                              )}
                            </div>
                            {locked ? (
                              <span
                                title="مصروف هالك مرتبط بحركة مخزون — لا يُحذف من هنا"
                                className="flex size-8 items-center justify-center text-muted-foreground/60"
                              >
                                <Lock className="size-4" />
                              </span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                onClick={() => setDeleteId(e.id)}
                                title="حذف"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </Card>
                </section>
              ))}

              {expenses.length >= 500 && (
                <p className="text-center text-xs text-muted-foreground">
                  تم عرض آخر ٥٠٠ عملية فقط — ضيّق الفترة الزمنية لعرض باقي السجل
                </p>
              )}
            </div>
          )}
        </div>

        {/* ═════════ التوزيع (يسار) ═════════ */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card className="animate-in-up stagger-2 gap-5 py-5">
            <CardContent className="space-y-5 px-5">
              <div>
                <h2 className="text-base font-bold">توزيع المصروفات</h2>
                <p className="text-xs text-muted-foreground">اضغط على أي نوع لتصفية القايمة</p>
              </div>

              {loading && !data ? (
                <div className="flex justify-center py-6">
                  <Skeleton className="size-40 rounded-full" />
                </div>
              ) : breakdown.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  لا توجد بيانات لعرضها
                </div>
              ) : (
                <>
                  <div className="flex justify-center">
                    <DonutChart
                      data={donutData}
                      size={168}
                      thickness={20}
                      centerLabel="الإجمالي"
                      centerValue={num(total)}
                    />
                  </div>

                  <ul className="space-y-1.5">
                    {breakdown.map(([cat, value]) => {
                      const pct = total > 0 ? (value / total) * 100 : 0
                      const { color } = metaOf(cat)
                      const active = filterCategory === cat
                      return (
                        <li key={cat}>
                          <button
                            type="button"
                            onClick={() => setFilterCategory(active ? 'all' : cat)}
                            className={cn(
                              'w-full rounded-xl p-2.5 text-start transition-colors hover:bg-muted/60',
                              active && 'bg-muted ring-1 ring-border',
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <CategoryIcon category={cat} size="sm" />
                              <span className="flex-1 truncate text-sm font-medium">{cat}</span>
                              <span className="text-sm font-bold tabular-nums">{num(value)}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full transition-all duration-slow ease-out"
                                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                                />
                              </div>
                              <span className="w-10 text-end text-[11px] tabular-nums text-muted-foreground">
                                {pct.toFixed(pct >= 10 ? 0 : 1)}%
                              </span>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* زر عائم للموبايل */}
      <Button
        variant="gradient"
        size="icon-lg"
        onClick={() => setAddOpen(true)}
        className="fixed bottom-5 left-5 z-30 rounded-full shadow-xl sm:hidden"
        aria-label="مصروف جديد"
      >
        <Plus className="size-6" />
      </Button>

      {/* ═════════ نافذة إضافة مصروف ═════════ */}
      <Dialog open={addOpen} onOpenChange={(o) => !saving && setAddOpen(o)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="border-b bg-gradient-to-br from-rose-500/10 to-amber-500/10 p-5 text-start">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <Receipt className="size-5" />
              </span>
              تسجيل مصروف جديد
            </DialogTitle>
            <DialogDescription>هيتخصم المبلغ من الخزنة مباشرة.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 p-5">
            {/* المبلغ */}
            <div className="space-y-2">
              <Label htmlFor="exp-amount">المبلغ</Label>
              <div className="relative">
                <Input
                  id="exp-amount"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
                  placeholder="0.00"
                  dir="ltr"
                  autoFocus
                  className="h-14 pe-16 text-left text-2xl font-bold tabular-nums"
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  جنيه
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(String((parseFloat(amount) || 0) + a))}
                    className="rounded-full border bg-background px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:border-primary hover:bg-primary-subtle hover:text-primary-subtle-foreground"
                  >
                    + {a}
                  </button>
                ))}
              </div>
            </div>

            {/* النوع */}
            <div className="space-y-2">
              <Label>النوع</Label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((c) => {
                  const active = category === c
                  const { color } = metaOf(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center text-xs font-medium transition-all',
                        active ? 'shadow-sm' : 'bg-background text-muted-foreground hover:bg-muted/60',
                      )}
                      style={
                        active
                          ? { borderColor: color, backgroundColor: `${color}14`, color }
                          : undefined
                      }
                    >
                      <CategoryIcon category={c} size="sm" />
                      <span className="leading-tight">{c}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ملاحظة */}
            <div className="space-y-2">
              <Label htmlFor="exp-note">ملاحظات</Label>
              <Input
                id="exp-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
                placeholder="اختياري — مثال: فاتورة شهر أكتوبر"
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="gradient" size="lg" onClick={submit} disabled={saving} className="min-w-36">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              حفظ المصروف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═════════ تأكيد الحذف ═════════ */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم عكس القيد في الخزنة وإرجاع المبلغ. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ───────────────────────── مكوّنات صغيرة ───────────────────────── */

function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  foot,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  foot?: React.ReactNode
  accent: string
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border p-4 shadow-xs transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-md"
      style={{
        borderColor: `${accent}33`,
        background: `linear-gradient(135deg, ${accent}1f 0%, transparent 70%)`,
      }}
    >
      {/* أيقونة كبيرة شفافة في الخلفية */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -22,
          left: -22,
          opacity: 0.08,
          color: accent,
          pointerEvents: 'none',
        }}
      >
        <Icon style={{ width: 96, height: 96 }} strokeWidth={1.5} />
      </div>
      {/* شريط لوني علوي */}
      <span
        className="absolute inset-x-4 top-0 h-0.5 rounded-b-full"
        style={{ backgroundColor: accent }}
      />

      <div className="relative flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}26`, color: accent }}
        >
          <Icon className="size-[18px]" />
        </div>
      </div>

      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span className="truncate text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl">{value}</span>
        {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>

      {foot && <div className="relative mt-2.5 text-[11px]">{foot}</div>}
    </div>
  )
}

/** رسم أعمدة صغير لمصروفات آخر ٧ أيام */
function WeekBars({
  days,
}: {
  days: { key: string; label: string; sum: number; isToday: boolean }[]
}) {
  const BAR_AREA = 64 // px
  const max = Math.max(...days.map((d) => d.sum), 1)
  return (
    <div className="hidden min-w-[240px] max-w-sm flex-1 md:block">
      <p className="mb-2 text-[11px] font-semibold text-muted-foreground">آخر ٧ أيام</p>
      <div className="flex items-end gap-2">
        {days.map((d) => {
          const h = d.sum > 0 ? Math.max(Math.round((d.sum / max) * BAR_AREA), 6) : 4
          return (
            <div
              key={d.key}
              className="group/bar flex flex-1 flex-col items-center justify-end gap-1"
              title={`${d.label}: ${formatCurrency(d.sum)}`}
            >
              <span
                className={cn(
                  'h-3 text-[9px] font-semibold leading-3 tabular-nums transition-opacity',
                  d.isToday && d.sum > 0 ? 'opacity-100' : 'opacity-0 group-hover/bar:opacity-100',
                )}
              >
                {d.sum > 0 ? num(d.sum) : ''}
              </span>
              <div
                className={cn(
                  'w-full rounded-t-md transition-all duration-slow ease-out',
                  d.sum === 0
                    ? 'bg-muted'
                    : d.isToday
                      ? 'bg-gradient-to-t from-rose-600 to-rose-400'
                      : 'bg-rose-500/30 group-hover/bar:bg-rose-500/60',
                )}
                style={{ height: h }}
              />
              <span
                className={cn(
                  'text-[10px]',
                  d.isToday ? 'font-bold text-foreground' : 'text-muted-foreground',
                )}
              >
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CategoryChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {color && (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
    </button>
  )
}
