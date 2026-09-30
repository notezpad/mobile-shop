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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

// نوع الهالك بيتسجل آلياً من حركة المخزون فقط — مش بيتظهر في نموذج الإضافة/التعديل
const FORM_CATEGORIES = CATEGORIES.filter((c) => c !== 'هالك وتالف')

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

/** "YYYY-MM-DD" بتوقيت المحل (مش بتوقيت الجهاز) — نفس منطق السيرفر في tenantTime.ts */
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

/** إضافة/طرح أيام على تاريخ نصي YYYY-MM-DD من غير أي تأثر بتوقيت الجهاز */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** YYYY-MM-DD (نص) ← Date محلي للعرض في منتقي التاريخ */
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
  // توقيت المحل (مش توقيت الجهاز) — نفس اللي بيستخدمه السيرفر في الفلاتر
  const tz = useShopStore((s) => s.branding.timezone) || 'Africa/Cairo'

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

  // تعديل مصروف (نفس نافذة الإضافة)
  const [editing, setEditing] = React.useState<ExpenseRow | null>(null)

  // الميزانية الشهرية
  const [budgets, setBudgets] = React.useState<BudgetRow[]>([])
  const [budgetOpen, setBudgetOpen] = React.useState(false)
  const [budgetDraft, setBudgetDraft] = React.useState<Record<string, string>>({})
  const [budgetSaving, setBudgetSaving] = React.useState(false)

  // المصروفات المتكررة
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

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  // الميزانيات والقوالب المتكررة: فشل تحميلها ما يعطّلش الصفحة (مثلاً قبل تنفيذ الـ migration)
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

  /** تطبيق التعديل محلياً على القايمة والإجماليات (بدون انتظار السيرفر) */
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
      if (typeof navigator === 'undefined' || navigator.onLine) refreshAll()
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

  /* ───── الميزانية الشهرية ───── */

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

  /* ───── المصروفات المتكررة ───── */

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
      if (typeof navigator === 'undefined' || navigator.onLine) refreshAll()
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
      const k = tzDateStr(new Date(e.createdAt), tz)
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
  }, [visible, tz])

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

  /* ───── إحصائيات الهيرو ───── */
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
              <Button variant="gradient" size="lg" onClick={openAdd}>
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
          {/* تنبيه تجاوز الميزانية */}
          {overBudgets.length > 0 && (
            <div className="animate-in-up flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive-subtle p-3.5 text-destructive-subtle-foreground">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  تجاوزت الحد الشهري في {overBudgets.length} {overBudgets.length > 2 ? 'بنود' : 'بند'}
                </p>
                <p className="mt-0.5 text-xs opacity-90">
                  {overBudgets.map((b) => `${b.category} (+${num(b.spent - b.monthlyLimit)} جنيه)`).join(' • ')}
                </p>
              </div>
            </div>
          )}

          {/* مصروفات متكررة مستحقة */}
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
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <CategoryIcon category={r.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{r.category}</p>
                      {r.note && <p className="truncate text-xs text-muted-foreground">{r.note}</p>}
                    </div>
                    <span className="text-sm font-bold tabular-nums">{num(r.amount)} جنيه</span>
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
                  <DatePickerField id="exp-from" value={from} onChange={setFrom} placeholder="من بداية السجل" />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="exp-to" className="text-xs text-muted-foreground">
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
                  <Button variant="gradient" onClick={openAdd}>
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
                      {dayLabel(g.key, tz)}
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
                                {timeLabel(e.createdAt, tz)}
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
                              <div className="flex items-center opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  onClick={() => openEdit(e)}
                                  title="تعديل"
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => setDeleteId(e.id)}
                                  title="حذف"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
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
        <aside className="space-y-5">
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

          {/* الميزانية الشهرية */}
          <Card className="animate-in-up stagger-3 gap-4 py-5">
            <CardContent className="space-y-4 px-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">الميزانية الشهرية</h2>
                  <p className="text-xs text-muted-foreground">الصرف هذا الشهر مقابل الحد المحدد</p>
                </div>
                <Button variant="outline" size="sm" onClick={openBudgets}>
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
                          <span className="flex-1 truncate text-sm font-medium">{b.category}</span>
                          {over && (
                            <Badge variant="destructive" size="sm">
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
                        <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                          <span>
                            <span className="font-semibold text-foreground">{num(b.spent)}</span> من {num(b.monthlyLimit)} جنيه
                          </span>
                          <span className={cn(over && 'font-semibold text-destructive')}>{Math.round(b.pct)}%</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* المصروفات المتكررة */}
          <Card className="animate-in-up stagger-4 gap-4 py-5">
            <CardContent className="space-y-4 px-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">مصروفات متكررة</h2>
                  <p className="text-xs text-muted-foreground">إيجار ومرتبات وغيرها — تسجّلها بضغطة</p>
                </div>
                <Button variant="outline" size="sm" onClick={openRecurring}>
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
                        <p className="text-[11px] text-muted-foreground">
                          {r.postedThisMonth ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Check className="size-3" />
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
                        <Button size="sm" onClick={() => postRecurring(r.id)} disabled={postingId === r.id}>
                          {postingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : 'سجّل'}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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

      {/* زر عائم للموبايل */}
      <Button
        variant="gradient"
        size="icon-lg"
        onClick={openAdd}
        className="fixed bottom-5 left-5 z-30 rounded-full shadow-xl sm:hidden"
        aria-label="مصروف جديد"
      >
        <Plus className="size-6" />
      </Button>

      {/* ═════════ نافذة إضافة مصروف ═════════ */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (saving) return
          setAddOpen(o)
          if (!o) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="border-b bg-gradient-to-br from-rose-500/10 to-amber-500/10 p-5 text-start">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <Receipt className="size-5" />
              </span>
              {editing ? 'تعديل المصروف' : 'تسجيل مصروف جديد'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'أي تغيير في المبلغ بيتعدّل في الخزنة تلقائياً.' : 'هيتخصم المبلغ من الخزنة مباشرة.'}
            </DialogDescription>
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
              <CategoryPicker value={category} onChange={setCategory} />
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
            <Button variant="gradient" size="lg" onClick={submit} disabled={saving} className="min-w-36">
              {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? <Check className="size-4" /> : <Plus className="size-4" />}
              {editing ? 'حفظ التعديل' : 'حفظ المصروف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═════════ نافذة الحدود الشهرية ═════════ */}
      <Dialog open={budgetOpen} onOpenChange={(o) => !budgetSaving && setBudgetOpen(o)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
          <DialogHeader className="border-b bg-gradient-to-br from-emerald-500/10 to-sky-500/10 p-5 text-start">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <SlidersHorizontal className="size-5" />
              </span>
              الحدود الشهرية
            </DialogTitle>
            <DialogDescription>اترك الخانة فاضية لو مش عايز حد للنوع ده.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 p-5">
            {CATEGORIES.map((c) => (
              <div key={c} className="flex items-center gap-3">
                <CategoryIcon category={c} size="sm" />
                <span className="flex-1 text-sm font-medium">{c}</span>
                <div className="relative w-36">
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
          </div>
          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
            <Button variant="ghost" onClick={() => setBudgetOpen(false)} disabled={budgetSaving}>
              إلغاء
            </Button>
            <Button variant="gradient" size="lg" onClick={saveBudgets} disabled={budgetSaving} className="min-w-36">
              {budgetSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              حفظ الحدود
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═════════ نافذة مصروف متكرر ═════════ */}
      <Dialog open={recOpen} onOpenChange={(o) => !recSaving && setRecOpen(o)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="border-b bg-gradient-to-br from-amber-500/10 to-rose-500/10 p-5 text-start">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Repeat className="size-5" />
              </span>
              مصروف متكرر جديد
            </DialogTitle>
            <DialogDescription>
              مش بيتسجل لوحده — بيظهر لك "مستحق" في يومه وبتضغط "سجّل الآن".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-5">
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
          </div>
          <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
            <Button variant="ghost" onClick={() => setRecOpen(false)} disabled={recSaving}>
              إلغاء
            </Button>
            <Button variant="gradient" size="lg" onClick={saveRecurring} disabled={recSaving} className="min-w-36">
              {recSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═════════ تأكيد حذف قالب متكرر ═════════ */}
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
          bottom: -18,
          left: -18,
          opacity: 0.05,
          color: accent,
          pointerEvents: 'none',
        }}
      >
        <Icon style={{ width: 80, height: 80 }} strokeWidth={1.5} />
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

/** منتقي تاريخ عربي (بديل حقل التاريخ الافتراضي للمتصفح mm/dd/yyyy) — القيمة نص YYYY-MM-DD */
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

/** شبكة اختيار النوع (بدون الهالك — بيتسجل آلياً من المخزون) */
function CategoryPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {FORM_CATEGORIES.map((c) => {
        const active = value === c
        const { color } = metaOf(c)
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center text-xs font-medium transition-all',
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
