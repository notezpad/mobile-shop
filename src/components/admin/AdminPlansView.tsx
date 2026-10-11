'use client'

import * as React from 'react'
import {
  Plus,
  Loader2,
  Search,
  RefreshCw,
  Download,
  LayoutGrid,
  Rows3,
  Table2,
  CalendarDays,
  CalendarRange,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  CalendarClock,
  TriangleAlert,
  Info,
  Lightbulb,
  X,
  CircleOff,
  Trash2,
  WifiOff,
  ArrowUpDown,
  SlidersHorizontal,
  Smartphone,
  Shirt,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  type Billing,
  type PlanRow,
  type QuickFilter,
  type SortKey,
  type StatusFilter,
  type TypeFilter,
  type ViewMode,
  CountUp,
  Pill,
  SORT_LABEL,
  Segmented,
  themeFor,
  num,
  planMrr,
  featureList,
} from './plans/plan-shared'
import { PlanDialog } from './plans/PlanDialog'
import { PlanDetailsSheet } from './plans/PlanDetailsSheet'
import { PlanCard, PlansCompare, PlansList, type PlanActions } from './plans/PlanViews'

/* ══════════════════════════════════════════════════════════════════
   خطط الاشتراك — لوحة تحكّم الأدمن (تصميم 2026)
   Bento · Aurora · Glass · حركات انسيابية · تحليلات مباشرة
   ══════════════════════════════════════════════════════════════════ */

type TabKey = 'basic' | 'pricing' | 'features' | 'modules'

interface DialogState {
  open: boolean
  plan: PlanRow | null
  seed: Partial<PlanRow> | null
  tab: TabKey
}

interface Insight {
  id: string
  tone: 'warn' | 'info' | 'tip'
  title: string
  detail: string
  cta?: string
  action?: () => void
}

const PREF_KEY = 'admin-plans-prefs-v2'

const INSIGHT_STYLE = {
  warn: { icon: TriangleAlert, box: 'border-amber-500/30 bg-amber-500/[0.08]', ic: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
  info: { icon: Info, box: 'border-sky-500/25 bg-sky-500/[0.04]', ic: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  tip: { icon: Lightbulb, box: 'border-indigo-500/25 bg-indigo-500/[0.04]', ic: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' },
} as const

function exportCsv(rows: PlanRow[]) {
  const head = [
    'الكود', 'الاسم', 'النشاط', 'النوع', 'الحالة', 'السعر الشهري', 'السعر السنوي', 'أيام التجربة',
    'المستخدمون', 'المنتجات', 'الفروع', 'المشتركون', 'الإيراد الشهري',
  ]
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = rows.map((p) =>
    [
      p.code,
      p.name,
      (p.businessType ?? 'electronics') === 'fashion' ? 'ملابس وأحذية' : 'موبايل وكمبيوتر',
      p.isCanonical ? 'قياسية' : 'مخصّصة',
      p.isActive ? 'مفعّلة' : 'معطّلة',
      p.priceMonthly,
      p.priceYearly,
      p.trialDays,
      p.maxUsers,
      p.maxProducts,
      p.maxBranches,
      p.subscribersCount,
      planMrr(p),
    ]
      .map(esc)
      .join(','),
  )
  const csv = '\uFEFF' + [head.map(esc).join(','), ...lines].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `plans-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function AdminPlansView() {
  const [plans, setPlans] = React.useState<PlanRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  /* التفضيلات */
  const [view, setView] = React.useState<ViewMode>('cards')
  const [billing, setBilling] = React.useState<Billing>('monthly')
  const [sort, setSort] = React.useState<SortKey>('manual')

  /* الفلاتر */
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [quick, setQuick] = React.useState<QuickFilter>('none')

  /* النوافذ */
  const [dialog, setDialog] = React.useState<DialogState>({ open: false, plan: null, seed: null, tab: 'basic' })
  const [detailsId, setDetailsId] = React.useState<number | null>(null)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [removeTarget, setRemoveTarget] = React.useState<PlanRow | null>(null)
  const [removing, setRemoving] = React.useState(false)

  /* التنبيهات */
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set())
  const [showAllInsights, setShowAllInsights] = React.useState(false)

  const searchRef = React.useRef<HTMLInputElement>(null)

  /* شريط الأدوات الثابت: ينكمش لصف واحد عند النزول */
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const barRef = React.useRef<HTMLDivElement>(null)
  const [compact, setCompact] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [expandedH, setExpandedH] = React.useState(0)
  const [extraMb, setExtraMb] = React.useState(0)

  /* ─── تفضيلات محفوظة ─── */
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY)
      if (!raw) return
      const v = JSON.parse(raw) as Partial<{ view: ViewMode; billing: Billing; sort: SortKey }>
      if (v.view === 'cards' || v.view === 'list' || v.view === 'compare') setView(v.view)
      if (v.billing === 'monthly' || v.billing === 'yearly') setBilling(v.billing)
      if (v.sort && v.sort in SORT_LABEL) setSort(v.sort)
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ view, billing, sort }))
    } catch {
      /* ignore */
    }
  }, [view, billing, sort])

  /* ─── مراقبة النزول لتصغير شريط الأدوات ─── */
  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // على الجوال (< md) الشريط مش لازق، فمفيش داعي للوضع المضغوط
    const mq = window.matchMedia('(min-width: 768px)')
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && mq.matches))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  React.useEffect(() => {
    if (!compact) setFiltersOpen(false)
  }, [compact])

  // نحافظ على ارتفاع الصفحة ثابتاً عند الانكماش حتى لا يقفز المحتوى
  React.useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const h = el.offsetHeight
    if (!compact) {
      setExpandedH(h)
      setExtraMb(0)
    } else {
      setExtraMb(Math.max(0, expandedH - h))
    }
  }, [compact, expandedH])

  /* ─── التحميل ─── */
  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await api<{ items: PlanRow[] }>('/api/admin/plans')
      setPlans(data.items)
      setLoadError(null)
    } catch (e: any) {
      const msg = e?.message || 'فشل تحميل الباقات'
      setLoadError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  /* ─── ترتيب يدوي + ألوان ثابتة لكل باقة ─── */
  const manual = React.useMemo(
    () => [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [plans],
  )
  const themeIndexById = React.useMemo(() => {
    const m = new Map<number, number>()
    manual.forEach((p, i) => m.set(p.id, i))
    return m
  }, [manual])

  /* ─── الإحصاءات ─── */
  const stats = React.useMemo(() => {
    const totalSubs = plans.reduce((s, p) => s + p.subscribersCount, 0)
    const mrr = plans.reduce((s, p) => s + planMrr(p), 0)
    const trials = plans.reduce((s, p) => s + (p.trialCount ?? 0), 0)
    const yearly = plans.reduce((s, p) => s + (p.yearlyCount ?? 0), 0)
    const monthly = Math.max(0, totalSubs - trials - yearly)
    const paid = Math.max(0, totalSubs - trials)
    const expiring = plans.reduce((s, p) => s + (p.expiringSoonCount ?? 0), 0)
    const pickMax = (fn: (p: PlanRow) => number) =>
      plans.reduce<PlanRow | null>((best, p) => (fn(p) > (best ? fn(best) : 0) ? p : best), null)
    return {
      totalSubs,
      mrr,
      arr: mrr * 12,
      trials,
      yearly,
      monthly,
      paid,
      arpu: paid > 0 ? Math.round(mrr / paid) : 0,
      trialPct: totalSubs > 0 ? Math.round((trials / totalSubs) * 100) : 0,
      expiring,
      topSubs: pickMax((p) => p.subscribersCount),
      topRevenue: pickMax((p) => planMrr(p)),
      active: plans.filter((p) => p.isActive).length,
      electronics: plans.filter((p) => (p.businessType ?? 'electronics') === 'electronics').length,
      fashion: plans.filter((p) => p.businessType === 'fashion').length,
    }
  }, [plans])

  /* ─── فلترة + ترتيب ─── */
  const hasFilters =
    search.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all' || quick !== 'none'

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (quick !== 'none' ? 1 : 0)

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setStatusFilter('all')
    setQuick('none')
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = manual.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && (p.businessType ?? 'electronics') !== typeFilter) return false
      if (statusFilter === 'active' && !p.isActive) return false
      if (statusFilter === 'inactive' && p.isActive) return false
      if (quick === 'expiring' && (p.expiringSoonCount ?? 0) === 0) return false
      if (quick === 'no-subs' && p.subscribersCount > 0) return false
      if (quick === 'trials' && (p.trialCount ?? 0) === 0) return false
      return true
    })
    const arr = [...base]
    switch (sort) {
      case 'price-asc':
        arr.sort((a, b) => a.priceMonthly - b.priceMonthly || a.priceYearly - b.priceYearly)
        break
      case 'price-desc':
        arr.sort((a, b) => b.priceMonthly - a.priceMonthly || b.priceYearly - a.priceYearly)
        break
      case 'subs':
        arr.sort((a, b) => b.subscribersCount - a.subscribersCount)
        break
      case 'revenue':
        arr.sort((a, b) => planMrr(b) - planMrr(a))
        break
      case 'name':
        arr.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        break
      default:
        break
    }
    return arr
  }, [manual, search, typeFilter, statusFilter, quick, sort])

  /* ─── إجراءات ─── */
  const patchLocal = React.useCallback((id: number, patch: Partial<PlanRow>) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const openEdit = React.useCallback((p: PlanRow, tab: TabKey = 'basic') => {
    setDialog({ open: true, plan: p, seed: null, tab })
  }, [])

  const openCreate = React.useCallback((seed: Partial<PlanRow> | null = null) => {
    setDialog({ open: true, plan: null, seed, tab: 'basic' })
  }, [])

  const openDetails = React.useCallback((p: PlanRow) => {
    setDetailsId(p.id)
    setDetailsOpen(true)
  }, [])

  const toggleActive = React.useCallback(
    async (p: PlanRow) => {
      const next = !p.isActive
      patchLocal(p.id, { isActive: next }) // تحديث تفاؤلي
      try {
        await api(`/api/admin/plans/${p.id}`, { method: 'PUT', body: { isActive: next } })
        toast.success(next ? `تم تفعيل «${p.name}»` : `تم تعطيل «${p.name}»`)
      } catch (e: any) {
        patchLocal(p.id, { isActive: p.isActive })
        toast.error(e?.message || 'فشل تحديث حالة الباقة')
      }
    },
    [patchLocal],
  )

  const quickPrice = React.useCallback(
    async (p: PlanRow, prices: { priceMonthly: number; priceYearly: number }) => {
      try {
        await api(`/api/admin/plans/${p.id}`, { method: 'PUT', body: prices })
        patchLocal(p.id, prices)
        toast.success(`تم تحديث سعر «${p.name}»`)
        load(true) // لتحديث الإيراد المقدّر
      } catch (e: any) {
        toast.error(e?.message || 'فشل تحديث السعر')
        throw e
      }
    },
    [patchLocal, load],
  )

  const duplicate = React.useCallback(
    (p: PlanRow) => {
      const maxOrder = manual.reduce((m, x) => Math.max(m, x.sortOrder), 0)
      openCreate({
        ...p,
        id: undefined,
        code: `${p.code}-copy`,
        name: `${p.name} (نسخة)`,
        isActive: false,
        isCanonical: false,
        sortOrder: maxOrder + 10,
      } as Partial<PlanRow>)
      setDetailsOpen(false)
    },
    [manual, openCreate],
  )

  const move = React.useCallback(
    async (p: PlanRow, dir: -1 | 1) => {
      const i = manual.findIndex((x) => x.id === p.id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= manual.length) {
        toast.info(dir === -1 ? 'الباقة في أول الترتيب بالفعل' : 'الباقة في آخر الترتيب بالفعل')
        return
      }
      const order = [...manual]
      ;[order[i], order[j]] = [order[j], order[i]]
      const updates = order
        .map((x, idx) => ({ id: x.id, sortOrder: (idx + 1) * 10, prev: x.sortOrder }))
        .filter((u) => u.sortOrder !== u.prev)
      setPlans((prev) =>
        prev.map((x) => {
          const u = updates.find((y) => y.id === x.id)
          return u ? { ...x, sortOrder: u.sortOrder } : x
        }),
      )
      try {
        await Promise.all(
          updates.map((u) =>
            api(`/api/admin/plans/${u.id}`, { method: 'PUT', body: { sortOrder: u.sortOrder } }),
          ),
        )
        toast.success('تم تحديث ترتيب العرض')
      } catch (e: any) {
        toast.error(e?.message || 'فشل تحديث الترتيب')
        load(true)
      }
    },
    [manual, load],
  )

  const confirmRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const r = await api<{ ok?: boolean; message?: string }>(`/api/admin/plans/${removeTarget.id}`, {
        method: 'DELETE',
      })
      toast.success(r?.message || 'تمت العملية')
      if (detailsId === removeTarget.id) setDetailsOpen(false)
      setRemoveTarget(null)
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشلت العملية')
    } finally {
      setRemoving(false)
    }
  }

  const actions: PlanActions = {
    onEdit: openEdit,
    onDetails: openDetails,
    onToggleActive: toggleActive,
    onDuplicate: duplicate,
    onRemove: setRemoveTarget,
    onMove: move,
    onQuickPrice: quickPrice,
    canMove: sort === 'manual' && !hasFilters,
  }

  /* ─── اختصارات لوحة المفاتيح ─── */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const typing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (typing || dialog.open || detailsOpen || removeTarget) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openCreate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog.open, detailsOpen, removeTarget, openCreate])

  /* ─── تنبيهات ذكية ─── */
  const insights = React.useMemo<Insight[]>(() => {
    const list: Insight[] = []

    if (stats.expiring > 0) {
      list.push({
        id: 'expiring',
        tone: 'warn',
        title: `${stats.expiring} اشتراك ينتهي خلال 14 يوماً`,
        detail: 'تواصل مع هؤلاء العملاء أو جدّد اشتراكاتهم قبل أن يتوقف النظام عندهم.',
        cta: 'عرض الباقات المعنية',
        action: () => setQuick('expiring'),
      })
    }

    for (const p of manual) {
      if (!p.isActive && p.subscribersCount > 0) {
        list.push({
          id: `inactive-subs-${p.id}`,
          tone: 'warn',
          title: `«${p.name}» معطّلة ولديها ${p.subscribersCount} مشترك نشط`,
          detail: 'الباقة المعطّلة لا تظهر للعملاء الجدد، لكن المشتركين الحاليين يستمرون حتى انتهاء اشتراكهم.',
          cta: 'فتح التفاصيل',
          action: () => openDetails(p),
        })
      }
    }

    const names = (arr: PlanRow[]) =>
      arr.slice(0, 3).map((p) => `«${p.name}»`).join('، ') + (arr.length > 3 ? ` و${arr.length - 3} أخرى` : '')

    const noDiscount = manual.filter(
      (p) => p.isActive && p.priceMonthly > 0 && p.priceYearly > 0 && p.priceYearly >= p.priceMonthly * 12,
    )
    if (noDiscount.length > 0) {
      list.push({
        id: `no-discount-${noDiscount.map((p) => p.id).join('-')}`,
        tone: 'tip',
        title: noDiscount.length === 1 ? `«${noDiscount[0].name}»: السنوي بلا خصم` : `${noDiscount.length} باقات سعرها السنوي بلا خصم`,
        detail: `${names(noDiscount)} — السنوي يساوي أو يزيد عن ١٢ × الشهري، فلا حافز للاشتراك السنوي.`,
        cta: 'تعديل التسعير',
        action: () => openEdit(noDiscount[0], 'pricing'),
      })
    }

    const noYearly = manual.filter((p) => p.isActive && p.priceMonthly > 0 && p.priceYearly === 0)
    if (noYearly.length > 0) {
      list.push({
        id: `no-yearly-${noYearly.map((p) => p.id).join('-')}`,
        tone: 'info',
        title: noYearly.length === 1 ? `«${noYearly[0].name}» بلا سعر سنوي` : `${noYearly.length} باقات بلا سعر سنوي`,
        detail: `${names(noYearly)} — إضافة سعر سنوي بخصم تزيد الاشتراكات الطويلة.`,
        cta: 'إضافة سعر سنوي',
        action: () => openEdit(noYearly[0], 'pricing'),
      })
    }

    const noFeatures = manual.filter((p) => p.isActive && featureList(p.features).length === 0)
    if (noFeatures.length > 0) {
      list.push({
        id: `no-features-${noFeatures.map((p) => p.id).join('-')}`,
        tone: 'tip',
        title: noFeatures.length === 1 ? `«${noFeatures[0].name}» بلا قائمة مزايا` : `${noFeatures.length} باقات بلا قائمة مزايا`,
        detail: `${names(noFeatures)} — المزايا تظهر في البطاقة وجدول المقارنة وتساعد العميل على الاختيار.`,
        cta: noFeatures.length === 1 ? 'إضافة مزايا' : 'ابدأ بالأولى',
        action: () => openEdit(noFeatures[0], 'features'),
      })
    }

    if (stats.totalSubs > 0) {
      const empty = manual.filter((p) => p.isActive && p.subscribersCount === 0)
      if (empty.length > 0) {
        list.push({
          id: 'empty-active',
          tone: 'info',
          title: `${empty.length} باقة مفعّلة بدون أي مشترك`,
          detail: empty.slice(0, 3).map((p) => `«${p.name}»`).join('، ') + (empty.length > 3 ? '…' : ''),
          cta: 'عرضها',
          action: () => setQuick('no-subs'),
        })
      }
    }

    return list.filter((i) => !dismissed.has(i.id))
  }, [manual, stats.expiring, stats.totalSubs, dismissed, openDetails, openEdit])

  const visibleInsights = showAllInsights ? insights : insights.slice(0, 3)

  /* ─── مشتقّات العرض ─── */
  const detailsPlan = plans.find((p) => p.id === detailsId) ?? null
  const noData = !loading && !loadError && plans.length === 0
  const maxOrder = manual.reduce((m, x) => Math.max(m, x.sortOrder), 0)
  const topId = stats.topSubs && stats.topSubs.subscribersCount > 0 ? stats.topSubs.id : null
  const topRevenueId = stats.topRevenue && planMrr(stats.topRevenue) > 0 ? stats.topRevenue.id : null
  const existingCodes = plans.map((p) => p.code)

  const removeIsHard = !!removeTarget && !removeTarget.isCanonical && removeTarget.subscribersCount === 0

  /* ══════════════ العرض ══════════════ */
  return (
    <div className="w-full min-w-0 max-w-full space-y-4 pb-10 sm:space-y-5">
      {/* ═══ 1. البطل: العنوان + لوحة المؤشرات (Bento) ═══ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border border-foreground/15 bg-card p-3.5 shadow-sm sm:rounded-[2rem] sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-24 -start-16 size-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 end-0 size-80 rounded-full bg-fuchsia-500/8 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.15] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] dark:opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(99,102,241,0.35) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />

        <div className="relative space-y-5">
          {/* العنوان + الأزرار */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-inset ring-white/30 sm:size-12">
                <Sparkles className="size-5 sm:size-6" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-black leading-tight sm:text-2xl">خطط الاشتراك</h1>
                <p className="text-[13.5px] font-medium leading-snug text-foreground/70 sm:text-[14.5px]">
                  تحكّم كامل في الباقات والتسعير والمشتركين — مع تحليلات مباشرة
                </p>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Button
                variant="outline"
                size="icon"
                aria-label="تصدير CSV"
                title="تصدير الباقات (CSV)"
                disabled={plans.length === 0}
                onClick={() => exportCsv(filtered.length > 0 ? filtered : plans)}
                className="size-11 rounded-xl bg-card sm:size-10"
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="تحديث"
                title="تحديث"
                onClick={() => load(true)}
                disabled={refreshing || loading}
                className="size-11 rounded-xl bg-card sm:size-10"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              </Button>
              <Button
                onClick={() => openCreate()}
                className="h-11 flex-1 gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-4 text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-violet-500 sm:h-10 sm:flex-none"
              >
                <Plus className="size-4" strokeWidth={2.6} />
                باقة جديدة
                <kbd className="hidden rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-[12.5px] font-bold sm:inline">N</kbd>
              </Button>
            </div>
          </div>

          {/* لوحة المؤشرات */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* MRR + توزيع الإيراد */}
            <div className="col-span-2 min-w-0 rounded-3xl border border-foreground/15 bg-card p-3.5 shadow-md sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p
                  className="flex items-center gap-1.5 text-[14.5px] font-bold text-foreground/70"
                  title="تقدير: (المشتركون الشهريون × السعر الشهري) + (السنويون × السعر السنوي ÷ 12) — بدون فترات التجربة"
                >
                  <Wallet className="size-3.5 text-indigo-500" />
                  الإيراد الشهري المتكرر (MRR)
                </p>
                {!loading && stats.mrr > 0 && (
                  <Pill tone="emerald" icon={TrendingUp}>
                    ARR ≈ {num(stats.arr)}
                  </Pill>
                )}
              </div>

              {loading ? (
                <Skeleton className="mt-3 h-12 w-48 rounded-xl" />
              ) : (
                <p className="mt-2 flex items-baseline gap-2">
                  <CountUp
                    value={stats.mrr}
                    className="bg-gradient-to-l from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300"
                  />
                  <span className="text-[15.5px] font-bold text-foreground/70">ج.م / شهر</span>
                </p>
              )}

              {/* شريط توزيع الإيراد */}
              <div className="mt-4">
                {loading ? (
                  <Skeleton className="h-3 w-full rounded-full" />
                ) : stats.mrr > 0 ? (
                  <>
                    <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted">
                      {manual
                        .filter((p) => planMrr(p) > 0)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setDetailsId(p.id)
                              setDetailsOpen(true)
                            }}
                            title={`${p.name} — ${num(planMrr(p))} ج.م (${Math.round((planMrr(p) / stats.mrr) * 100)}%)`}
                            className="h-full min-w-1 transition-all hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500"
                            style={{
                              width: `${(planMrr(p) / stats.mrr) * 100}%`,
                              backgroundColor: themeFor(themeIndexById.get(p.id) ?? 0).hex,
                            }}
                          />
                        ))}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                      {manual
                        .filter((p) => planMrr(p) > 0)
                        .sort((a, b) => planMrr(b) - planMrr(a))
                        .slice(0, 5)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setDetailsId(p.id)
                              setDetailsOpen(true)
                            }}
                            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground/70 transition-colors hover:text-foreground"
                          >
                            <span className={cn('size-2 rounded-full', themeFor(themeIndexById.get(p.id) ?? 0).dot)} />
                            <span>{p.name}</span>
                            <span className="font-mono font-black tabular-nums text-foreground">
                              {Math.round((planMrr(p) / stats.mrr) * 100)}%
                            </span>
                          </button>
                        ))}
                    </div>
                  </>
                ) : (
                  <p className="rounded-2xl border border-dashed px-3 py-2.5 text-center text-[14px] text-foreground/70">
                    {stats.totalSubs > 0
                      ? 'كل المشتركين الحاليين في فترة تجربة — لا يوجد إيراد متكرر بعد.'
                      : 'لا يوجد إيراد بعد — سيظهر توزيع الإيراد هنا مع أول اشتراك مدفوع.'}
                  </p>
                )}
              </div>
            </div>

            {/* المشتركون */}
            <div className="min-w-0 rounded-3xl border border-foreground/15 bg-card p-3.5 shadow-md sm:p-4">
              <p className="flex items-center gap-1.5 text-[13.5px] font-bold leading-tight text-foreground/70 sm:text-[14.5px]">
                <Users className="size-3.5 shrink-0 text-violet-500" />
                المشتركون النشطون
              </p>
              {loading ? (
                <Skeleton className="mt-3 h-10 w-24 rounded-xl" />
              ) : (
                <CountUp value={stats.totalSubs} className="mt-2 block text-4xl font-black tracking-tight" />
              )}
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                {[
                  { v: stats.monthly, c: 'bg-indigo-500' },
                  { v: stats.yearly, c: 'bg-violet-500' },
                  { v: stats.trials, c: 'bg-amber-400' },
                ].map((s, i) =>
                  s.v > 0 ? (
                    <div key={i} className={cn('h-full', s.c)} style={{ width: `${(s.v / Math.max(1, stats.totalSubs)) * 100}%` }} />
                  ) : null,
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold text-foreground/70">
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-indigo-500" />شهري {stats.monthly}</span>
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-violet-500" />سنوي {stats.yearly}</span>
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" />تجربة {stats.trials}</span>
              </div>
            </div>

            {/* ينتهي قريباً */}
            <button
              type="button"
              onClick={() => stats.expiring > 0 && setQuick(quick === 'expiring' ? 'none' : 'expiring')}
              disabled={stats.expiring === 0}
              className={cn(
                'min-w-0 rounded-3xl border p-3.5 text-start shadow-sm backdrop-blur transition-all sm:p-4',
                stats.expiring > 0
                  ? 'border-amber-500/30 bg-amber-500/[0.09] hover:-translate-y-0.5 hover:shadow-md'
                  : 'cursor-default bg-card',
              )}
            >
              <p className="flex items-center gap-1.5 text-[13.5px] font-bold leading-tight text-foreground/70 sm:text-[14.5px]">
                <CalendarClock className={cn('size-3.5 shrink-0', stats.expiring > 0 ? 'text-amber-500' : 'text-emerald-500')} />
                ينتهي خلال 14 يوماً
              </p>
              {loading ? (
                <Skeleton className="mt-3 h-10 w-16 rounded-xl" />
              ) : (
                <CountUp
                  value={stats.expiring}
                  className={cn('mt-2 block text-4xl font-black tracking-tight', stats.expiring > 0 && 'text-amber-600 dark:text-amber-400')}
                />
              )}
              <p className="mt-3 text-[13px] font-semibold text-foreground/70">
                {stats.expiring > 0
                  ? quick === 'expiring'
                    ? 'الفلتر مفعّل — اضغط للإلغاء'
                    : 'اضغط لعرض الباقات المعنية'
                  : 'لا توجد اشتراكات قريبة الانتهاء ✓'}
              </p>
            </button>
          </div>

          {/* شريط الأرقام السريعة */}
          {!loading && plans.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Pill icon={Layers}>{plans.length} باقة · {stats.active} مفعّلة</Pill>
              <Pill icon={Smartphone}>{stats.electronics} موبايل</Pill>
              <Pill icon={Shirt}>{stats.fashion} ملابس</Pill>
              <Pill>متوسط إيراد المشترك: {stats.arpu > 0 ? `${num(stats.arpu)} ج.م` : '—'}</Pill>
              <Pill tone={stats.trialPct > 50 ? 'amber' : 'neutral'}>نسبة التجارب: {stats.trialPct}%</Pill>
            </div>
          )}
        </div>
      </section>

      {/* ═══ 2. تنبيهات ذكية ═══ */}
      {!loading && insights.length > 0 && (
        <section aria-label="تنبيهات ذكية" className="animate-in-up stagger-1 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[15.5px] font-black">
              <Lightbulb className="size-4 text-indigo-500" />
              تنبيهات ذكية
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[13px] font-black text-indigo-600 dark:text-indigo-300">
                {insights.length}
              </span>
            </h2>
            {insights.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllInsights((v) => !v)}
                className="text-[14px] font-bold text-indigo-600 hover:underline dark:text-indigo-300"
              >
                {showAllInsights ? 'عرض أقل' : `عرض الكل (${insights.length})`}
              </button>
            )}
          </div>
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {visibleInsights.map((ins) => {
              const st = INSIGHT_STYLE[ins.tone]
              return (
                <div key={ins.id} className={cn('relative flex items-start gap-3 rounded-2xl border p-3.5 pe-9', st.box)}>
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', st.ic)}>
                    <st.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold leading-snug">{ins.title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-foreground/90">{ins.detail}</p>
                    {ins.cta && ins.action && (
                      <button
                        type="button"
                        onClick={ins.action}
                        className="mt-1.5 text-[14px] font-black text-indigo-600 hover:underline dark:text-indigo-300"
                      >
                        {ins.cta} ←
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="إخفاء التنبيه"
                    onClick={() => setDismissed((prev) => new Set(prev).add(ins.id))}
                    className="absolute end-2.5 top-2.5 flex size-6 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-background/80 hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ═══ 3. شريط الأدوات ═══ */}
      {!noData && !loadError && (
        <>
      <div ref={sentinelRef} aria-hidden className="-mb-px h-px" />
      {/*
        شريط الأدوات:
        • < md (جوال): عادي (مش لازق) — بحث بعرض كامل، وتحته صف قابل للسحب أفقياً (ترتيب/سعر/عرض/فلاتر)،
          والفلاتر مطويّة داخل زر «الفلاتر».
        • ≥ md: لازق وينكمش عند النزول (السلوك الأصلي). الهوامش السالبة كانت -mx-4 فوق padding 12px
          على الجوال، فكانت بتعمل سكرول أفقي — اتصلّحت بحصرها في md+.
      */}
      <div
        ref={barRef}
        style={{ marginBottom: compact ? extraMb : 0 }}
        className="md:sticky md:-top-6 md:z-30 md:-mx-6 md:bg-background md:px-6 md:pb-2 md:pt-5"
      >
        <section
          className={cn(
            'animate-in-up stagger-2 relative rounded-3xl border border-foreground/15 bg-card p-3 shadow-md transition-[padding] sm:p-3.5',
            !compact && 'space-y-2.5',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-full sm:min-w-[200px] sm:flex-1 sm:basis-auto">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/70" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearch('')
                    e.currentTarget.blur()
                  }
                }}
                placeholder="ابحث بالاسم أو الكود…"
                className="h-11 rounded-full bg-muted ps-10 pe-10 sm:h-10"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="مسح البحث"
                  onClick={() => setSearch('')}
                  className="absolute end-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/20 text-foreground/70 hover:bg-muted-foreground/30 sm:size-5"
                >
                  <X className="size-3" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-md border bg-background px-1.5 py-0.5 font-mono text-[12.5px] font-bold text-foreground/70 sm:block">
                  /
                </kbd>
              )}
            </div>

            {/* جوال: صف قابل للسحب أفقياً — sm+: العناصر تنضم لنفس صف البحث (contents) */}
            <div className="scrollbar-none flex w-full min-w-0 items-center gap-2 overflow-x-auto sm:contents">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger
                  className="h-11 w-[160px] shrink-0 gap-1.5 rounded-full bg-muted data-[size=default]:h-11 sm:h-10 sm:w-[170px] sm:data-[size=default]:h-10"
                  aria-label="ترتيب الباقات"
                >
                  <ArrowUpDown className="size-3.5 text-foreground/70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SORT_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {view !== 'list' && (
                <Segmented<Billing>
                  ariaLabel="وضع عرض الأسعار"
                  value={billing}
                  onChange={setBilling}
                  options={[
                    { value: 'monthly', label: 'شهري', icon: CalendarDays },
                    { value: 'yearly', label: 'سنوي', icon: CalendarRange },
                  ]}
                />
              )}

              <Segmented<ViewMode>
                ariaLabel="طريقة العرض"
                value={view}
                onChange={setView}
                options={[
                  { value: 'cards', label: 'بطاقات', icon: LayoutGrid },
                  { value: 'list', label: 'قائمة', icon: Rows3 },
                  { value: 'compare', label: 'مقارنة', icon: Table2 },
                ]}
              />

              {/* زر الفلاتر: دايماً على الجوال، وعلى md+ فقط في الوضع المضغوط */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={cn('h-11 shrink-0 gap-1.5 rounded-full sm:h-10', !compact && 'md:hidden')}
              >
                <SlidersHorizontal className="size-4" />
                الفلاتر
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-indigo-600 px-1.5 text-[12px] font-black text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              'flex-wrap items-center gap-2',
              compact
                ? filtersOpen
                  ? 'flex absolute inset-x-0 top-full z-10 mt-2 rounded-3xl border border-foreground/15 bg-card p-3 shadow-xl'
                  : 'hidden'
                : filtersOpen
                  ? 'flex max-md:border-t max-md:border-border max-md:pt-2.5'
                  : 'max-md:hidden md:flex',
            )}
          >
            <Segmented<TypeFilter>
              compact
              ariaLabel="فلتر نوع النشاط"
              className="max-md:w-full max-md:[&>button]:flex-1 max-md:[&>button]:justify-center"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'all', label: 'كل الأنشطة', badge: plans.length },
                { value: 'electronics', label: 'موبايل', icon: Smartphone, badge: stats.electronics },
                { value: 'fashion', label: 'ملابس', icon: Shirt, badge: stats.fashion },
              ]}
            />
            <Segmented<StatusFilter>
              compact
              ariaLabel="فلتر الحالة"
              className="max-md:w-full max-md:[&>button]:flex-1 max-md:[&>button]:justify-center"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'الكل' },
                { value: 'active', label: 'مفعّلة' },
                { value: 'inactive', label: 'معطّلة' },
              ]}
            />
            <Segmented<QuickFilter>
              compact
              ariaLabel="فلاتر سريعة"
              className="max-md:w-full max-md:[&>button]:flex-1 max-md:[&>button]:justify-center"
              value={quick}
              onChange={(v) => setQuick(v === quick ? 'none' : v)}
              options={[
                { value: 'none', label: 'بدون' },
                { value: 'expiring', label: 'ينتهي قريباً' },
                { value: 'trials', label: 'فيها تجارب' },
                { value: 'no-subs', label: 'بلا مشتركين' },
              ]}
            />

            {(hasFilters || filtered.length !== plans.length) && (
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-[13.5px] font-bold text-indigo-700 max-md:w-full max-md:justify-between md:ms-auto dark:text-indigo-300">
                {filtered.length} / {plans.length} باقة
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-full bg-indigo-500/15 px-2.5 py-1 font-black hover:bg-indigo-500/25 sm:px-2 sm:py-0"
                  >
                    مسح الفلاتر
                  </button>
                )}
              </span>
            )}
          </div>
        </section>
      </div>
      </>
      )}

      {/* ═══ 4. المحتوى ═══ */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-4 rounded-3xl border border-foreground/15 bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-2xl" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
              </div>
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="animate-in-up flex flex-col items-center justify-center rounded-3xl border border-dashed bg-card px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <WifiOff className="size-7" />
          </span>
          <h3 className="mt-4 text-base font-black">تعذّر تحميل الباقات</h3>
          <p className="mt-1 max-w-sm text-[14px] text-foreground/70">{loadError}</p>
          <Button onClick={() => load()} className="mt-4 gap-1.5 rounded-xl">
            <RefreshCw className="size-4" />
            إعادة المحاولة
          </Button>
        </div>
      ) : noData ? (
        <div className="animate-in-up flex flex-col items-center justify-center rounded-3xl border border-dashed bg-card px-6 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30">
            <Sparkles className="size-8" />
          </span>
          <h3 className="mt-5 text-lg font-black">لا توجد باقات بعد</h3>
          <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-foreground/70">
            أنشئ أول باقة (سعر، حدود، مزايا، وحدات) وستظهر هنا مع تحليلات الإيراد والمشتركين مباشرة.
          </p>
          <Button
            onClick={() => openCreate()}
            className="mt-5 gap-1.5 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30"
          >
            <Plus className="size-4" strokeWidth={2.6} />
            أنشئ أول باقة
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="animate-in-up flex flex-col items-center justify-center rounded-3xl border border-dashed bg-card px-6 py-14 text-center">
          <Search className="size-9 text-foreground/70/50" strokeWidth={1.6} />
          <h3 className="mt-3 text-[15.5px] font-black">لا توجد نتائج مطابقة</h3>
          <p className="mt-1 text-[14px] text-foreground/70">جرّب تعديل البحث أو الفلاتر</p>
          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 rounded-full">
            مسح الفلاتر
          </Button>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              themeIndex={themeIndexById.get(p.id) ?? idx}
              billing={billing}
              totalSubs={stats.totalSubs}
              totalMrr={stats.mrr}
              isTop={topId === p.id}
              isTopRevenue={topRevenueId === p.id}
              stagger={idx}
              actions={actions}
            />
          ))}
          {!hasFilters && (
            <button
              type="button"
              onClick={() => openCreate()}
              className="animate-in-up group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed bg-card p-6 text-foreground/70 transition-all hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-indigo-500/[0.05] hover:text-indigo-600 dark:hover:text-indigo-300"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl border-2 border-dashed transition-colors group-hover:border-indigo-500/50">
                <Plus className="size-6" />
              </span>
              <span className="text-[15.5px] font-black">باقة جديدة</span>
            </button>
          )}
        </div>
      ) : view === 'list' ? (
        <PlansList
          plans={filtered}
          themeIndexById={themeIndexById}
          totalSubs={stats.totalSubs}
          totalMrr={stats.mrr}
          sort={sort}
          onSort={setSort}
          actions={actions}
        />
      ) : (
        <PlansCompare
          plans={filtered}
          themeIndexById={themeIndexById}
          billing={billing}
          topId={topId}
          actions={actions}
        />
      )}

      {!loading && !noData && !loadError && (
        <p className="text-center text-[13px] font-medium text-foreground/70">
          <span className="max-sm:hidden">
            اختصارات: <kbd className="rounded border bg-muted px-1 font-mono">/</kbd> بحث ·{' '}
            <kbd className="rounded border bg-muted px-1 font-mono">N</kbd> باقة جديدة ·{' '}
          </span>
          الإيراد المعروض تقدير من الاشتراكات النشطة
        </p>
      )}

      {/* ═══ 5. النوافذ ═══ */}
      <PlanDialog
        plan={dialog.plan}
        seed={dialog.seed}
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        onSaved={() => load(true)}
        initialTab={dialog.tab}
        nextSortOrder={maxOrder + 10}
        existingCodes={existingCodes}
        themeIndex={dialog.plan ? (themeIndexById.get(dialog.plan.id) ?? 0) : manual.length}
      />

      <PlanDetailsSheet
        plan={detailsPlan}
        theme={themeFor(detailsPlan ? (themeIndexById.get(detailsPlan.id) ?? 0) : 0)}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        totalMrr={stats.mrr}
        onEdit={(p, tab) => {
          setDetailsOpen(false)
          openEdit(p, tab ?? 'basic')
        }}
        onToggleActive={toggleActive}
        onDuplicate={duplicate}
      />

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                {removeIsHard ? <Trash2 className="size-4.5" /> : <CircleOff className="size-4.5" />}
              </span>
              {removeIsHard ? 'حذف الباقة نهائياً' : 'إلغاء تفعيل الباقة'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-start">
              {removeTarget && <span className="block text-base font-black text-foreground">{removeTarget.name}</span>}
              <span className="block">
                {removeIsHard
                  ? 'هذه باقة مخصّصة بلا مشتركين نشطين. سيتم حذفها نهائياً إلا إذا كانت مرتبطة باشتراكات سابقة، وفي هذه الحالة ستُعطَّل فقط.'
                  : 'سيتم تعطيل الباقة (لن تظهر للعملاء الجدد) وتستمر الاشتراكات الحالية حتى انتهائها. الباقات القياسية لا تُحذف نهائياً.'}
              </span>
              {removeTarget && removeTarget.subscribersCount > 0 && (
                <span className="block rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[14.5px] font-semibold text-amber-800 dark:text-amber-200">
                  ⚠️ لديها {removeTarget.subscribersCount} مشترك نشط.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl sm:h-9">تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmRemove()
              }}
              disabled={removing}
              className="h-11 gap-1.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 sm:h-9"
            >
              {removing && <Loader2 className="size-4 animate-spin" />}
              نعم، أكمل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
