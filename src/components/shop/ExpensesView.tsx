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
  CalendarDays,
  Clock,
  MoreVertical,
  Pencil,
  SlidersHorizontal,
  Repeat,
  AlertTriangle,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Calendar } from '@/components/ui/calendar'
import { ar } from 'date-fns/locale'
import { DonutChart } from '@/components/charts/donut-chart'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatArabicDate } from '@/lib/format'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'
import { cn } from '@/lib/utils'
import { ListPager, usePager } from './ListPager'
import { ExpenseHero, ROSE_BTN } from './expense-dialog-ui'

/* ───────────────────────── الأنواع والثوابت ───────────────────────── */

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

const FORM_CATEGORIES = CATEGORIES.filter((c) => c !== 'هالك وتالف')

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000]

// ترتيب شرائح الفلتر — بنوزّع الطويلة على الصفوف عشان الصف الأخير ميبقاش فيه شريحة لوحدها
const FILTER_CHIP_ORDER: readonly string[] = [
  'إيجار',
  'ضيافة',
  'أخرى',
  'مرتبات',
  'نقل ومواصلات',
  'إنترنت واتصالات',
  'صيانة المحل',
  'هالك وتالف',
  'كهرباء ومياه',
]

interface ExpenseRow {
  id: number
  category: string
  amount: number
  note: string | null
  userName?: string | null
  source?: string | null
  locked?: boolean
  createdAt: string
}

interface ExpensesResponse {
  expenses: ExpenseRow[]
  total: number
  byCategory: Record<string, number>
}

type Period = 'all' | 'today' | 'week' | 'month'

interface BudgetRow {
  category: string
  monthlyLimit: number
  spent: number
}

interface RecurringItem {
  id: number
  category: string
  amount: number
  note: string | null
  dayOfMonth: number
  postedThisMonth: boolean
  due: boolean
}

/* ───────────────────────── أدوات مساعدة ───────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0')

function tzDateStr(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function parseDateStr(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function periodRange(p: Period, tz: string): { from: string; to: string } {
  const today = tzDateStr(new Date(), tz)
  if (p === 'today') return { from: today, to: today }
  if (p === 'week') return { from: addDays(today, -6), to: today }
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  return { from: '', to: '' }
}

function dayLabel(key: string, tz: string): string {
  const today = tzDateStr(new Date(), tz)
  if (key === today) return 'اليوم'
  if (key === addDays(today, -1)) return 'أمس'
  return formatArabicDate(parseDateStr(key))
}

const timeLabel = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: tz })

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

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
  const tz = useShopStore((s) => s.branding.timezone) || 'Africa/Cairo'

  const [addOpen, setAddOpen] = React.useState(false)
  const [category, setCategory] = React.useState<string>(CATEGORIES[0])
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [filterCategory, setFilterCategory] = React.useState('all')
  const [search, setSearch] = React.useState('')

  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const [editing, setEditing] = React.useState<ExpenseRow | null>(null)

  const [budgets, setBudgets] = React.useState<BudgetRow[]>([])
  const [budgetOpen, setBudgetOpen] = React.useState(false)
  const [budgetDraft, setBudgetDraft] = React.useState<Record<string, string>>({})
  const [budgetSaving, setBudgetSaving] = React.useState(false)

  const [recurring, setRecurring] = React.useState<RecurringItem[]>([])
  const [recOpen, setRecOpen] = React.useState(false)
  const [recCategory, setRecCategory] = React.useState<string>(FORM_CATEGORIES[0])
  const [recAmount, setRecAmount] = React.useState('')
  const [recDay, setRecDay] = React.useState('1')
  const [recNote, setRecNote] = React.useState('')
  const [recSaving, setRecSaving] = React.useState(false)
  const [postingId, setPostingId] = React.useState<number | null>(null)
  const [deleteRecId, setDeleteRecId] = React.useState<number | null>(null)

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

  const loadBudgets = React.useCallback(async () => {
    try {
      const r = await api<{ budgets: BudgetRow[] }>('/api/expenses/budgets')
      setBudgets(r?.budgets ?? [])
    } catch {
      /* silent */
    }
  }, [])

  const loadRecurring = React.useCallback(async () => {
    try {
      const r = await api<{ items: RecurringItem[] }>('/api/expenses/recurring')
      setRecurring(r?.items ?? [])
    } catch {
      /* silent */
    }
  }, [])

  React.useEffect(() => {
    loadBudgets()
    loadRecurring()
  }, [loadBudgets, loadRecurring])

  const refreshAll = React.useCallback(() => {
    load()
    loadBudgets()
    loadRecurring()
  }, [load, loadBudgets, loadRecurring])

  useDataRefresh(['expenses'], refreshAll)

  const resetForm = () => {
    setAmount('')
    setNote('')
  }

  const openAdd = () => {
    setEditing(null)
    setCategory(FORM_CATEGORIES[0])
    resetForm()
    setAddOpen(true)
  }

  const openEdit = (e: ExpenseRow) => {
    setEditing(e)
    setCategory(FORM_CATEGORIES.includes(e.category as any) ? e.category : FORM_CATEGORIES[0])
    setAmount(String(e.amount))
    setNote(e.note ?? '')
    setAddOpen(true)
  }

  const applyLocalEdit = (id: number, cat: string, amt: number, nt: string | null) => {
    setData((prev) => {
      if (!prev) return prev
      const list = prev.expenses.map((x) => (x.id === id ? { ...x, category: cat, amount: amt, note: nt } : x))
      const byCategory: Record<string, number> = {}
      let sum = 0
      for (const x of list) {
        byCategory[x.category] = (byCategory[x.category] ?? 0) + x.amount
        sum += x.amount
      }
      return { ...prev, expenses: list, total: sum, byCategory }
    })
  }

  const submitEdit = async (amt: number) => {
    if (!editing) return
    const target = editing
    const cleanNote = note.trim() || null
    setSaving(true)
    try {
      await api(`/api/expenses/${target.id}`, {
        method: 'PATCH',
        body: { category, amount: amt, note: cleanNote },
      })
      applyLocalEdit(target.id, category, amt, cleanNote)
      toast.success('تم تعديل المصروف')
      setAddOpen(false)
      setEditing(null)
      resetForm()
      if (typeof navigator === 'undefined' || navigator.onLine) refreshAll()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        applyLocalEdit(target.id, category, amt, cleanNote)
        toast.success('تم تعديل المصروف (offline — سيتم المزامنة لاحقاً)')
        setAddOpen(false)
        setEditing(null)
        resetForm()
      } else {
        toast.error(e?.message || 'فشل التعديل')
      }
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر')
      return
    }
    if (editing) {
      await submitEdit(amt)
      return
    }
    setSaving(true)
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
      if (typeof navigator === 'undefined' || navigator.onLine) refreshAll()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم تسجيل المصروف (offline — سيتم المزامنة لاحقاً)')
        resetForm()
        setAddOpen(false)
      } else {
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

  const openBudgets = () => {
    const draft: Record<string, string> = {}
    for (const c of CATEGORIES) {
      const b = budgets.find((x) => x.category === c)
      draft[c] = b ? String(b.monthlyLimit) : ''
    }
    setBudgetDraft(draft)
    setBudgetOpen(true)
  }

  const saveBudgets = async () => {
    setBudgetSaving(true)
    try {
      await api('/api/expenses/budgets', { method: 'PUT', body: { limits: budgetDraft } })
      toast.success('تم حفظ الحدود الشهرية')
      setBudgetOpen(false)
      loadBudgets()
    } catch (e: any) {
      toast.error(e?.message || 'فشل حفظ الحدود')
    } finally {
      setBudgetSaving(false)
    }
  }

  const openRecurring = () => {
    setRecCategory(FORM_CATEGORIES[0])
    setRecAmount('')
    setRecDay('1')
    setRecNote('')
    setRecOpen(true)
  }

  const saveRecurring = async () => {
    const amt = parseFloat(recAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر')
      return
    }
    setRecSaving(true)
    try {
      await api('/api/expenses/recurring', {
        method: 'POST',
        body: {
          category: recCategory,
          amount: amt,
          dayOfMonth: parseInt(recDay, 10) || 1,
          note: recNote.trim() || null,
        },
      })
      toast.success('تم إضافة المصروف المتكرر')
      setRecOpen(false)
      loadRecurring()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setRecSaving(false)
    }
  }

  const postRecurring = async (id: number) => {
    setPostingId(id)
    try {
      await api(`/api/expenses/recurring/${id}/post`, { method: 'POST' })
      toast.success('تم تسجيل المصروف')
      if (typeof navigator === 'undefined' || navigator.onLine) refreshAll()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التسجيل')
      loadRecurring()
    } finally {
      setPostingId(null)
    }
  }

  const confirmDeleteRecurring = async () => {
    if (!deleteRecId) return
    try {
      await api(`/api/expenses/recurring/${deleteRecId}`, { method: 'DELETE' })
      toast.success('تم حذف المصروف المتكرر')
      setDeleteRecId(null)
      loadRecurring()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
      setDeleteRecId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
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
      if (typeof navigator === 'undefined' || navigator.onLine) refreshAll()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم حذف المصروف (offline — سيتم المزامنة لاحقاً)')
        setDeleteId(null)
      } else {
        if (deleted) load()
        toast.error(e?.message || 'فشل الحذف')
        setDeleteId(null)
      }
    } finally {
      setDeleting(false)
    }
  }

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

  // ⚡ v9: ترقيم العرض — 50 مصروف في الـ DOM في كل مرة.
  // الإجماليات + التحليل بالتصنيفات فوق بتتحسب على كل المصروفات (breakdown memo) مش الصفحة.
  const pager = usePager(visible, 50, [search, from, to])
  const pageRows = pager.pageRows

  const groups = React.useMemo(() => {
    const map = new Map<string, ExpenseRow[]>()
    for (const e of pageRows) {
      const k = tzDateStr(new Date(e.createdAt), tz)
      const arr = map.get(k)
      if (arr) arr.push(e)
      else map.set(k, [e])
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => {
        const byCat: Record<string, number> = {}
        let sum = 0
        for (const x of items) {
          byCat[x.category] = (byCat[x.category] ?? 0) + x.amount
          sum += x.amount
        }
        const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
        const biggest = items.reduce((m, x) => Math.max(m, x.amount), 0)
        return { key, items, sum, cats, biggest }
      })
  }, [pageRows, tz])

  const activePeriod: Period | null = (() => {
    for (const p of ['all', 'today', 'week', 'month'] as Period[]) {
      const r = periodRange(p, tz)
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
    const r = periodRange(p, tz)
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
        date: new Date(e.createdAt).toLocaleString('ar-EG', { timeZone: tz }),
        category: e.category,
        amount: e.amount,
        note: e.note || '-',
        user: e.userName || '-',
      })),
      totals: { date: 'الإجمالي', amount: data.total },
    })
  }

  const todayKey = tzDateStr(new Date(), tz)
  const stats = (() => {
    const perDay = new Map<string, number>()
    let todaySum = 0
    let todayCount = 0
    let maxExpense = 0
    for (const e of expenses) {
      const k = tzDateStr(new Date(e.createdAt), tz)
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
      const key = addDays(todayKey, i - 6)
      const [yy, mm, dd] = key.split('-').map(Number)
      return {
        key,
        label: new Date(Date.UTC(yy, mm - 1, dd, 12)).toLocaleDateString('ar-EG', {
          weekday: 'short',
          timeZone: 'UTC',
        }),
        sum: perDay.get(key) ?? 0,
        isToday: key === todayKey,
      }
    })
    return { todaySum, todayCount, maxExpense, activeDays, vsAvg, week }
  })()
  const budgetRows = budgets
    .map((b) => ({ ...b, pct: b.monthlyLimit > 0 ? (b.spent / b.monthlyLimit) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct)
  const overBudgets = budgetRows.filter((b) => b.pct >= 100)
  const dueItems = recurring.filter((r) => r.due)
  const topShare = topCategory && total > 0 ? (topCategory[1] / total) * 100 : 0
  const topColor = topCategory ? metaOf(topCategory[0]).color : '#ef4444'
  const noData = loading && !data

  const donutData = breakdown.map(([cat, v]) => ({
    label: cat,
    value: v,
    color: metaOf(cat).color,
  }))

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═════════ Hero ═════════ */}
      <section className="animate-in-up overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm">
        <div
          className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-between sm:gap-6 sm:p-7"
          style={{ background: 'radial-gradient(560px 200px at 100% 0%, rgba(244,63,94,0.10), transparent)' }}
        >
          <div className="w-full min-w-0 self-start sm:w-auto">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
              <span className="size-2 shrink-0 rounded-full bg-rose-400" />
              إجمالي المصروفات
            </p>
            <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-2">
              <span
                dir="ltr"
                title={noData ? undefined : num(total)}
                className="min-w-0 break-all text-right text-3xl font-extrabold tracking-tight tabular-nums text-foreground sm:text-5xl md:text-6xl"
              >
                {noData ? '—' : num(total)}
              </span>
              <span className="shrink-0 text-sm font-semibold text-muted-foreground sm:text-base">جنيه</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" />
              <span className="truncate">{periodText}</span>
            </p>
          </div>

          <WeekBars days={stats.week} />

          <div className="grid w-full grid-cols-2 gap-2 self-start sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={!data || data.expenses.length === 0}
              className="w-full sm:w-auto"
            >
              <FileSpreadsheet className="size-4 shrink-0" />
              <span className="truncate">تصدير Excel</span>
            </Button>
            <Button variant="gradient" size="lg" onClick={openAdd} className="w-full sm:w-auto">
              <Plus className="size-4 shrink-0" />
              <span className="truncate">مصروف جديد</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-border lg:grid-cols-4">
          <HeroStat
            className="border-b border-e lg:border-b-0"
            label="مصروف اليوم"
            value={noData ? '—' : num(stats.todaySum)}
            unit="جنيه"
            foot={
              <span className="flex flex-wrap items-center gap-1.5">
                <span>{num(stats.todayCount)} عملية</span>
                {stats.vsAvg !== null && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
                      stats.vsAvg > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
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
          <HeroStat
            className="border-b lg:border-b-0 lg:border-e"
            label="عدد العمليات"
            value={noData ? '—' : num(count)}
            unit="عملية"
            foot={<span>موزّعة على {num(stats.activeDays)} يوم</span>}
          />
          <HeroStat
            className="border-e"
            label="متوسط المصروف"
            value={noData ? '—' : num(Math.round(average * 100) / 100)}
            unit="جنيه"
            foot={
              <span className="line-clamp-2">
                أكبر عملية: <span className="font-semibold tabular-nums text-foreground/80">{num(stats.maxExpense)}</span>
              </span>
            }
          />
          <HeroStat
            label="أكبر بند"
            value={topCategory ? topCategory[0] : '—'}
            dot={topCategory ? topColor : undefined}
            foot={
              topCategory ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="truncate font-semibold text-foreground/80" title={formatCurrency(topCategory[1])}>
                      {formatCurrency(topCategory[1])}
                    </span>
                    <span className="shrink-0">{topShare.toFixed(topShare >= 10 ? 0 : 1)}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
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
      </section>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {/* ═════════ القايمة (يمين) ═════════ */}
        <div className="space-y-4 lg:col-span-2">
          {overBudgets.length > 0 && (
            <div className="animate-in-up flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive-subtle p-3.5 text-destructive-subtle-foreground">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  تجاوزت الحد الشهري في {overBudgets.length} {overBudgets.length > 2 ? 'بنود' : 'بند'}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs opacity-90">
                  {overBudgets.map((b) => `${b.category} (+${num(b.spent - b.monthlyLimit)} جنيه)`).join(' • ')}
                </p>
              </div>
            </div>
          )}

          {dueItems.length > 0 && (
            <div className="animate-in-up overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
              <div className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-2.5">
                <Repeat className="size-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-bold">
                  {dueItems.length} {dueItems.length > 2 ? 'مصروفات' : 'مصروف'} متكررة مستحقة هذا الشهر
                </p>
              </div>
              <div className="divide-y divide-amber-500/15">
                {dueItems.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4">
                    <CategoryIcon category={r.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{r.category}</p>
                      {r.note && <p className="truncate text-xs text-muted-foreground">{r.note}</p>}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums" title={num(r.amount)}>
                      {num(r.amount)} جنيه
                    </span>
                    <Button size="sm" onClick={() => postRecurring(r.id)} disabled={postingId === r.id}>
                      {postingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      سجّل الآن
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* الفلاتر */}
          <Card className="animate-in-up stagger-1 gap-4 py-4">
            <CardContent className="space-y-3 px-3.5 sm:px-4">
              {/* 📱 بحث مصغّر على الموبايل */}
              <div className="relative w-full sm:min-w-[210px]">
                <Search className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground sm:size-4" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث فى المصروفات او النوع او الموظف"
                  className="h-9 pr-8 text-xs placeholder:text-xs sm:h-10 sm:pr-9 sm:text-sm sm:placeholder:text-sm"
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
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      activePeriod === p
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="exp-from" className="shrink-0 text-xs text-muted-foreground">
                    من
                  </Label>
                  <DatePickerField id="exp-from" value={from} onChange={setFrom} placeholder="من بداية السجل" />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="exp-to" className="shrink-0 text-xs text-muted-foreground">
                    إلى
                  </Label>
                  <DatePickerField id="exp-to" value={to} onChange={setTo} placeholder="حتى اليوم" />
                </div>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    <X className="size-3.5" />
                    مسح الفلاتر
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <CategoryChip
                  active={filterCategory === 'all'}
                  onClick={() => setFilterCategory('all')}
                  label="كل الأنواع"
                />
                {FILTER_CHIP_ORDER.map((c) => (
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
                  <Button variant="gradient" onClick={openAdd}>
                    <Plus className="size-4" />
                    مصروف جديد
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className={cn('space-y-4 sm:space-y-5', loading && 'opacity-60 transition-opacity')}>
              {groups.map((g) => {
                const label = dayLabel(g.key, tz)
                const relative = label === 'اليوم' || label === 'أمس'
                return (
                  <Card key={g.key} className="animate-in-up gap-0 overflow-hidden py-0">
                    <div className="space-y-3.5 border-b bg-muted/30 px-3.5 py-3.5 sm:px-4 sm:py-4">
                      <div className="flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-extrabold leading-tight text-foreground sm:text-lg">{label}</h3>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {relative ? `${formatArabicDate(parseDateStr(g.key))} · ` : ''}
                            {g.items.length} {g.items.length > 2 && g.items.length < 11 ? 'عمليات' : 'عملية'}
                          </p>
                        </div>
                        <div className="min-w-0 shrink-0 text-end">
                          <p className="text-[11px] text-muted-foreground">إجمالي اليوم</p>
                          <p
                            dir="ltr"
                            title={num(g.sum)}
                            className="max-w-[55vw] break-all text-right text-lg font-extrabold leading-tight tabular-nums text-foreground sm:text-2xl"
                          >
                            <span className="text-rose-500">−</span>
                            {num(g.sum)}
                            <span className="ms-1 text-xs font-medium text-muted-foreground">جنيه</span>
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                          {g.cats.map(([cat, v]) => (
                            <span
                              key={cat}
                              title={`${cat}: ${num(v)} جنيه`}
                              className="h-full rounded-full"
                              style={{
                                width: `${(v / g.sum) * 100}%`,
                                minWidth: 6,
                                backgroundColor: metaOf(cat).color,
                              }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {g.cats.map(([cat, v]) => (
                            <span key={cat} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: metaOf(cat).color }} />
                              <span className="truncate">{cat}</span>
                              <span className="shrink-0 font-semibold tabular-nums text-foreground">{num(v)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <ul className="divide-y">
                      {g.items.map((e) => {
                        const locked = e.locked ?? e.source === 'damage'
                        const { icon: Icon, color } = metaOf(e.category)
                        const dayShare = g.sum > 0 ? (e.amount / g.sum) * 100 : 0
                        const isBiggest = g.items.length >= 3 && e.amount === g.biggest
                        return (
                          <li key={e.id} className="group cv-auto">
                            {/* 📱 موبايل: كارت عمودي */}
                            <div className="flex flex-col gap-2.5 px-3.5 py-3 transition-colors hover:bg-muted/40 sm:hidden">
                              <div className="flex items-start gap-3">
                                <ShareRing pct={dayShare} color={color}>
                                  <Icon className="size-[18px]" />
                                </ShareRing>

                                <div className="min-w-0 flex-1 pt-0.5">
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                    <p className="truncate text-[15px] font-bold leading-tight">{e.category}</p>
                                    {isBiggest && (
                                      <span className="shrink-0 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                                        الأكبر
                                      </span>
                                    )}
                                    {locked && (
                                      <Badge variant="warning" size="sm">
                                        <Lock />
                                        تلقائي
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="size-3 shrink-0" />
                                      <span dir="ltr" className="tabular-nums">
                                        {timeLabel(e.createdAt, tz)}
                                      </span>
                                    </span>
                                    {e.userName && (
                                      <>
                                        <span aria-hidden>·</span>
                                        <span className="inline-flex min-w-0 items-center gap-1">
                                          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                                            {e.userName.trim().charAt(0)}
                                          </span>
                                          <span className="truncate">{e.userName}</span>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {locked ? (
                                  <span
                                    title="مصروف هالك مرتبط بحركة مخزون — لا يُعدَّل ولا يُحذف من هنا"
                                    className="flex size-8 shrink-0 items-center justify-center text-muted-foreground/60"
                                  >
                                    <Lock className="size-4" />
                                  </span>
                                ) : (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 text-muted-foreground"
                                        aria-label="خيارات"
                                      >
                                        <MoreVertical className="size-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                      <DropdownMenuItem onClick={() => openEdit(e)}>
                                        <Pencil className="size-4" />
                                        تعديل
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => setDeleteId(e.id)}
                                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                      >
                                        <Trash2 className="size-4" />
                                        حذف
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>

                              {e.note && (
                                <p
                                  className="line-clamp-2 border-s-2 ps-2.5 text-xs text-muted-foreground"
                                  style={{ borderColor: `${color}66` }}
                                >
                                  {e.note}
                                </p>
                              )}

                              <div className="flex items-end justify-between gap-2 border-t border-border/40 pt-2.5">
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  {dayShare.toFixed(dayShare >= 10 ? 0 : 1)}% من إجمالي اليوم
                                </span>
                                <span
                                  dir="ltr"
                                  title={num(e.amount)}
                                  className="min-w-0 break-all text-right text-lg font-extrabold tabular-nums text-foreground"
                                >
                                  <span className="text-rose-500">−</span>
                                  {num(e.amount)}
                                  <span className="ms-1 text-[10px] font-medium text-muted-foreground">جنيه</span>
                                </span>
                              </div>
                            </div>

                            {/* 🖥️ من sm+ وفوق: التصميم الأفقي الأصلي */}
                            <div className="hidden items-start gap-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:flex">
                              <ShareRing pct={dayShare} color={color}>
                                <Icon className="size-[18px]" />
                              </ShareRing>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <p className="truncate text-[15px] font-bold leading-tight">{e.category}</p>
                                  {isBiggest && (
                                    <span className="shrink-0 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                                      الأكبر
                                    </span>
                                  )}
                                  {locked && (
                                    <Badge variant="warning" size="sm">
                                      <Lock />
                                      تلقائي
                                    </Badge>
                                  )}
                                </div>

                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                    <Clock className="size-3 shrink-0" />
                                    <span dir="ltr" className="tabular-nums">
                                      {timeLabel(e.createdAt, tz)}
                                    </span>
                                  </span>
                                  {e.userName && (
                                    <span className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-background text-[9px] font-bold text-foreground">
                                        {e.userName.trim().charAt(0)}
                                      </span>
                                      <span className="truncate">{e.userName}</span>
                                    </span>
                                  )}
                                </div>

                                {e.note && (
                                  <p
                                    className="mt-2 line-clamp-2 border-s-2 ps-2.5 text-sm text-muted-foreground"
                                    style={{ borderColor: `${color}66` }}
                                  >
                                    {e.note}
                                  </p>
                                )}
                              </div>

                              <div className="w-32 shrink-0 text-end">
                                <p
                                  dir="ltr"
                                  title={num(e.amount)}
                                  className="break-all text-right text-lg font-extrabold leading-tight tabular-nums text-foreground sm:text-xl"
                                >
                                  <span className="text-rose-500">−</span>
                                  {num(e.amount)}
                                </p>
                                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                  جنيه · {dayShare.toFixed(dayShare >= 10 ? 0 : 1)}% من اليوم
                                </p>
                              </div>

                              {locked ? (
                                <span
                                  title="مصروف هالك مرتبط بحركة مخزون — لا يُعدَّل ولا يُحذف من هنا"
                                  className="flex size-8 shrink-0 items-center justify-center text-muted-foreground/60"
                                >
                                  <Lock className="size-4" />
                                </span>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 shrink-0 text-muted-foreground"
                                      aria-label="خيارات"
                                    >
                                      <MoreVertical className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => openEdit(e)}>
                                      <Pencil className="size-4" />
                                      تعديل
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => setDeleteId(e.id)}
                                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    >
                                      <Trash2 className="size-4" />
                                      حذف
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                )
              })}

              {expenses.length >= 500 && (
                <p className="text-center text-xs text-muted-foreground">
                  تم عرض آخر ٥٠٠ عملية فقط — ضيّق الفترة الزمنية لعرض باقي السجل
                </p>
              )}

              {/* ⚡ v9: ترقيم صفحات العرض */}
              <ListPager
                page={pager.page}
                pageCount={pager.pageCount}
                setPage={pager.setPage}
                total={pager.total}
                unitLabel="مصروف"
              />
            </div>
          )}
        </div>

        {/* ═════════ التوزيع (يسار) ═════════ */}
        <aside className="space-y-4 sm:space-y-5">
          <Card className="animate-in-up stagger-2 gap-5 py-5">
            <CardContent className="space-y-5 px-4 sm:px-5">
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
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat}</span>
                              <span className="shrink-0 text-sm font-bold tabular-nums" title={num(value)}>{num(value)}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full transition-all duration-slow ease-out"
                                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                                />
                              </div>
                              <span className="w-10 shrink-0 text-end text-[11px] tabular-nums text-muted-foreground">
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

          <Card className="animate-in-up stagger-3 gap-4 py-5">
            <CardContent className="space-y-4 px-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-bold">الميزانية الشهرية</h2>
                  <p className="text-xs text-muted-foreground">الصرف هذا الشهر مقابل الحد المحدد</p>
                </div>
                <Button variant="outline" size="sm" onClick={openBudgets} className="shrink-0">
                  <SlidersHorizontal className="size-3.5" />
                  ضبط الحدود
                </Button>
              </div>

              {budgetRows.length === 0 ? (
                <button
                  type="button"
                  onClick={openBudgets}
                  className="w-full rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  حدّد حد شهري لكل نوع وهنحذّرك لما الصرف يعدّيه
                </button>
              ) : (
                <ul className="space-y-3.5">
                  {budgetRows.map((b) => {
                    const over = b.pct >= 100
                    const warn = !over && b.pct >= 80
                    const barColor = over ? '#ef4444' : warn ? '#f59e0b' : '#10b981'
                    return (
                      <li key={b.category} className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <CategoryIcon category={b.category} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.category}</span>
                          {over && (
                            <Badge variant="destructive" size="sm" className="shrink-0">
                              تجاوز
                            </Badge>
                          )}
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-slow ease-out"
                            style={{ width: `${Math.min(Math.max(b.pct, 2), 100)}%`, backgroundColor: barColor }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] tabular-nums text-muted-foreground">
                          <span className="truncate">
                            <span className="font-semibold text-foreground" title={num(b.spent)}>{num(b.spent)}</span> من {num(b.monthlyLimit)} جنيه
                          </span>
                          <span className={cn('shrink-0', over && 'font-semibold text-destructive')}>{Math.round(b.pct)}%</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="animate-in-up stagger-4 gap-4 py-5">
            <CardContent className="space-y-4 px-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-bold">مصروفات متكررة</h2>
                  <p className="text-xs text-muted-foreground">إيجار ومرتبات وغيرها — تسجّلها بضغطة</p>
                </div>
                <Button variant="outline" size="sm" onClick={openRecurring} className="shrink-0">
                  <Plus className="size-3.5" />
                  إضافة
                </Button>
              </div>

              {recurring.length === 0 ? (
                <button
                  type="button"
                  onClick={openRecurring}
                  className="w-full rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  أضف مصروف بيتكرر كل شهر علشان يفكّرك بيه
                </button>
              ) : (
                <ul className="space-y-2">
                  {recurring.map((r) => (
                    <li key={r.id} className="group flex items-center gap-2.5 rounded-xl border p-2.5">
                      <CategoryIcon category={r.category} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight">
                          {r.category}
                          <span className="ms-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                            {num(r.amount)} جنيه
                          </span>
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {r.postedThisMonth ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Check className="size-3 shrink-0" />
                              اتسجّل هذا الشهر
                            </span>
                          ) : r.due ? (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">مستحق الآن</span>
                          ) : (
                            <>يستحق يوم {r.dayOfMonth} من الشهر</>
                          )}
                        </p>
                      </div>
                      {r.due && (
                        <Button size="sm" onClick={() => postRecurring(r.id)} disabled={postingId === r.id} className="shrink-0">
                          {postingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : 'سجّل'}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteRecId(r.id)}
                        title="حذف القالب"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Button
        variant="gradient"
        size="icon-lg"
        onClick={openAdd}
        className="fixed bottom-5 left-5 z-30 rounded-full shadow-xl sm:hidden"
        aria-label="مصروف جديد"
      >
        <Plus className="size-6" />
      </Button>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (saving) return
          setAddOpen(o)
          if (!o) setEditing(null)
        }}
      >
        <DialogContent mobileSheet className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <ExpenseHero
            icon={Receipt}
            title={editing ? 'تعديل المصروف' : 'تسجيل مصروف جديد'}
            subtitle={editing ? 'أي تغيير في المبلغ بيتعدّل في الخزنة تلقائياً.' : 'هيتخصم المبلغ من الخزنة مباشرة.'}
          />

          <DialogBody className="space-y-5">
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

            <div className="space-y-2">
              <Label>النوع</Label>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>

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
          </DialogBody>

          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setAddOpen(false)
                setEditing(null)
              }}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button size="lg" onClick={submit} disabled={saving} className={cn('min-w-36 rounded-xl font-extrabold', ROSE_BTN)}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? <Check className="size-4" /> : <Plus className="size-4" />}
              {editing ? 'حفظ التعديل' : 'حفظ المصروف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetOpen} onOpenChange={(o) => !budgetSaving && setBudgetOpen(o)}>
        <DialogContent mobileSheet className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <ExpenseHero icon={SlidersHorizontal} title="الحدود الشهرية" subtitle="اترك الخانة فاضية لو مش عايز حد للنوع ده." />
          <DialogBody className="space-y-2.5">
            {CATEGORIES.map((c) => (
              <div key={c} className="flex items-center gap-3">
                <CategoryIcon category={c} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c}</span>
                <div className="relative w-36 shrink-0">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    dir="ltr"
                    placeholder="بدون حد"
                    value={budgetDraft[c] ?? ''}
                    onChange={(e) => setBudgetDraft((d) => ({ ...d, [c]: e.target.value }))}
                    className="h-9 pe-12 text-left tabular-nums"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">
                    جنيه
                  </span>
                </div>
              </div>
            ))}
          </DialogBody>
          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
            <Button variant="ghost" onClick={() => setBudgetOpen(false)} disabled={budgetSaving}>
              إلغاء
            </Button>
            <Button size="lg" onClick={saveBudgets} disabled={budgetSaving} className={cn('min-w-36 rounded-xl font-extrabold', ROSE_BTN)}>
              {budgetSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              حفظ الحدود
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recOpen} onOpenChange={(o) => !recSaving && setRecOpen(o)}>
        <DialogContent mobileSheet className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <ExpenseHero
            icon={Repeat}
            title="مصروف متكرر جديد"
            subtitle={'مش بيتسجل لوحده — بيظهر لك "مستحق" في يومه وبتضغط "سجّل الآن".'}
          />
          <DialogBody className="space-y-5">
            <div className="space-y-2">
              <Label>النوع</Label>
              <CategoryPicker value={recCategory} onChange={setRecCategory} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rec-amount">المبلغ</Label>
                <Input
                  id="rec-amount"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  dir="ltr"
                  placeholder="0.00"
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  className="h-10 text-left font-semibold tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-day">يوم الاستحقاق (١ – ٢٨)</Label>
                <Input
                  id="rec-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  dir="ltr"
                  value={recDay}
                  onChange={(e) => setRecDay(e.target.value)}
                  className="h-10 text-left font-semibold tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-note">ملاحظات</Label>
              <Input
                id="rec-note"
                value={recNote}
                onChange={(e) => setRecNote(e.target.value)}
                placeholder="اختياري — مثال: إيجار المحل"
              />
            </div>
          </DialogBody>
          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
            <Button variant="ghost" onClick={() => setRecOpen(false)} disabled={recSaving}>
              إلغاء
            </Button>
            <Button size="lg" onClick={saveRecurring} disabled={recSaving} className={cn('min-w-36 rounded-xl font-extrabold', ROSE_BTN)}>
              {recSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteRecId !== null} onOpenChange={(o) => !o && setDeleteRecId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المصروف المتكرر</AlertDialogTitle>
            <AlertDialogDescription>
              هيتحذف القالب بس، والمصروفات اللي اتسجلت منه قبل كده هتفضل زي ما هي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRecurring}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function ShareRing({
  pct,
  color,
  children,
}: {
  pct: number
  color: string
  children: React.ReactNode
}) {
  const r = 22
  const c = 2 * Math.PI * r
  const dash = (Math.max(Math.min(pct, 100), 3) / 100) * c
  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center sm:size-14">
      <svg
        viewBox="0 0 52 52"
        className="absolute inset-0 size-full text-muted"
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden
      >
        <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span
        className="relative flex size-8 items-center justify-center rounded-full sm:size-9"
        style={{ backgroundColor: `${color}1c`, color }}
      >
        {children}
      </span>
    </div>
  )
}

function HeroStat({
  label,
  value,
  unit,
  foot,
  dot,
  className,
}: {
  label: string
  value: string
  unit?: string
  foot?: React.ReactNode
  dot?: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0 border-border px-3.5 py-3.5 sm:px-5 sm:py-4', className)}>
      <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {dot && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
        <span
          dir={unit ? 'ltr' : undefined}
          title={value}
          className="min-w-0 break-all text-right text-lg font-bold tracking-tight tabular-nums text-foreground sm:text-2xl"
        >
          {value}
        </span>
        {unit && <span className="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">{unit}</span>}
      </div>
      {foot && <div className="mt-2 text-[11px] text-muted-foreground">{foot}</div>}
    </div>
  )
}

function WeekBars({
  days,
}: {
  days: { key: string; label: string; sum: number; isToday: boolean }[]
}) {
  const BAR_AREA = 72
  const max = Math.max(...days.map((d) => d.sum), 1)
  return (
    <div className="hidden min-w-[260px] max-w-md flex-1 self-end md:block">
      <p className="mb-2 text-[11px] font-semibold text-muted-foreground">آخر ٧ أيام</p>
      <div className="flex items-end justify-between gap-1">
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
                  'h-3 text-[9px] font-semibold leading-3 tabular-nums text-foreground/80 transition-opacity',
                  d.isToday && d.sum > 0 ? 'opacity-100' : 'opacity-0 group-hover/bar:opacity-100',
                )}
              >
                {d.sum > 0 ? num(d.sum) : ''}
              </span>
              <div
                className={cn(
                  'w-full max-w-[26px] rounded-md transition-all duration-slow ease-out',
                  d.sum === 0
                    ? 'bg-muted'
                    : d.isToday
                      ? 'bg-gradient-to-t from-rose-500 to-rose-300'
                      : 'bg-foreground/15 group-hover/bar:bg-foreground/30',
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

function DatePickerField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = value ? parseDateStr(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 w-[10.5rem] justify-between gap-2 px-2.5 text-xs font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{selected ? formatArabicDate(selected) : placeholder}</span>
          <CalendarDays className="size-3.5 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={ar}
          dir="rtl"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? localDateStr(d) : '')
            setOpen(false)
          }}
        />
        {value && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              مسح التاريخ
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function CategoryPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {FORM_CATEGORIES.map((c) => {
        const active = value === c
        const { color } = metaOf(c)
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center text-xs font-medium transition-all sm:p-2.5',
              active ? 'shadow-sm' : 'bg-background text-muted-foreground hover:bg-muted/60',
            )}
            style={active ? { borderColor: color, backgroundColor: `${color}14`, color } : undefined}
          >
            <CategoryIcon category={c} size="sm" />
            <span className="leading-tight">{c}</span>
          </button>
        )
      })}
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
        'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {color && (
        <span className="size-1.5 shrink-0 rounded-full sm:size-2" style={{ backgroundColor: color }} />
      )}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}