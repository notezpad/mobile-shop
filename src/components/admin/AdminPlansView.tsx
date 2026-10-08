'use client'

import * as React from 'react'
import {
  Plus,
  Pencil,
  Loader2,
  Save,
  Check,
  Minus,
  Users,
  Package,
  Building2,
  Factory,
  Flame,
  Gauge,
  Search,
  RefreshCw,
  Smartphone,
  Shirt,
  Clock3,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  Table2,
  MoreVertical,
  Power,
  CircleOff,
  Lock,
  Layers,
  TrendingUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { formatCurrency } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/* ══════════════════════════════════════════════════════════════════
   خط إنتاج الباقات — هوية صناعية فولاذية (جرافيت + قرمزي)
   (المحلات = كهرمان · الاشتراكات = تركواز داكن · الباقات = فولاذ/قرمزي)
   ══════════════════════════════════════════════════════════════════ */

interface PlanRow {
  id: number
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  maxUsers: number
  maxProducts: number
  maxBranches: number
  trialDays: number
  features: string | null
  isActive: boolean
  sortOrder: number
  subscribersCount: number
  businessType?: string | null
  capabilities?: string | null
  enabledModules?: string | null
  // 🛡️ 2026-09-17 (v3): flag to distinguish canonical vs custom plans
  isCanonical?: boolean
}

function parseFeatures(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join('\n')
    return raw
  } catch {
    return raw
  }
}

const CAPABILITIES_META: { key: string; label: string; desc: string }[] = [
  { key: 'multi_unit',       label: 'وحدات الجملة (دستة)',    desc: 'بيع بالجملة — نص دستة / دستة / كرتونة. لو حاب تبيع بلقطعة، ضيف وحدة factor=1.' },
  { key: 'collections',      label: 'الكوليكشن',              desc: 'تجميع المنتجات في كوليكشنات وخصم جماعي' },
  { key: 'variants',         label: 'الأشكال/المقاسات (Variants)', desc: 'إدارة منتجات بأشكال أو مقاسات متعددة (ألوان/مقاسات) + المساعد الذكي — متاحة في كل باقات الملابس.' },
  { key: 'returns_exchange', label: 'المرتجعات والاستبدال',    desc: 'تسجيل مرتجعات واستبدال الفواتير' },
  { key: 'loyalty',          label: 'نقاط الولاء',            desc: 'تجميع واستبدال نقاط ولاء العملاء' },
]

// 🛡️ 2026-09-15 (v2→v5): Module metadata for the per-plan module editor.
// Lets the admin toggle which sidebar modules each plan unlocks.
// 🛡️ 2026-09-15 (v5): `expenses` + `cash` are now available in BOTH fashion
// and electronics plans (clothes shops have rent + cash drawer too).
// Only `maintenance` (device repair) and `finance` (Vodafone Cash/Instapay/Fawry)
// remain electronics-only.
const MODULES_META: { key: string; label: string; desc: string; electronicsOnly?: boolean }[] = [
  { key: 'dashboard',  label: 'لوحة المعلومات',   desc: 'الصفحة الرئيسية للنظام' },
  { key: 'pos',        label: 'نقطة البيع',       desc: 'شاشة الكاشير لإنشاء الفواتير' },
  { key: 'products',   label: 'المنتجات',         desc: 'إدارة المنتجات والباركود' },
  { key: 'sales',      label: 'سجل المبيعات',     desc: 'الفواتير السابقة ومرتجعاتها' },
  { key: 'customers',  label: 'العملاء',          desc: 'قاعدة بيانات العملاء وأرصدتهم' },
  { key: 'suppliers',  label: 'الموردين',         desc: 'قائمة الموردين والمستحقات' },
  { key: 'purchases',  label: 'المشتريات',        desc: 'أوامر الشراء من الموردين' },
  { key: 'inventory',  label: 'المخزون',          desc: 'حركات المخزون والجرد والتحويلات' },
  { key: 'reports',    label: 'التقارير',         desc: 'تقارير المبيعات والأرباح' },
  { key: 'branches',   label: 'الفروع',           desc: 'إدارة الفروع المتعددة' },
  { key: 'settings',   label: 'الإعدادات',        desc: 'إعدادات المحل (حرجة — مفعّلة دائماً)' },
  { key: 'users',      label: 'المستخدمين',       desc: 'إدارة المستخدمين (حرجة — مفعّلة دائماً)' },
  { key: 'maintenance', label: 'الصيانة',         desc: 'أوامر صيانة الأجهزة — إلكترونيات فقط', electronicsOnly: true },
  { key: 'finance',    label: 'المعاملات المالية', desc: 'فودافون كاش/إنستاباي/فوري — إلكترونيات فقط', electronicsOnly: true },
  { key: 'expenses',   label: 'المصروفات',        desc: 'مصروفات المحل (إيجار، مرتبات، كهرباء)' },
  { key: 'cash',       label: 'الخزنة',           desc: 'حركات الخزنة (نقدية)' },
]

// Default module lists per business type. Used by the "reset to defaults" button.
// 🛡️ 2026-09-15 (v5): fashion plans now include `expenses` + `cash`
// (clothes shops have running costs + cash drawer too).
const ELECTRONICS_DEFAULTS = [
  'dashboard','pos','products','sales','maintenance','customers','suppliers',
  'purchases','inventory','finance','expenses','cash','reports','settings','users','branches',
]
const FASHION_DEFAULTS = [
  'dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','expenses','cash','reports','settings','users','branches',
]

function parseCaps(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch { /* ignore */ }
  return []
}

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  electronics: 'موبايل وكمبيوتر',
  fashion: 'ملابس وأحذية',
}

/* ─── سُلّم الطبقات: فولاذ + قرمزي — الباقة الأعلى أغمق وأكثر احتراقاً ─── */
const TIER_RAMPS = [
  'from-red-500 to-red-700',
  'from-red-600 to-red-800',
  'from-red-700 to-red-900',
  'from-red-800 to-zinc-950',
  'from-red-600 to-red-900',
]

const TIER_NUM = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** تعبئة نسبية لوغاريتمية لأشرطة السعة */
function logNorm(v: number): number {
  if (v >= 999999) return 1
  if (v <= 1) return 0.07
  return Math.min(1, Math.max(0.07, Math.log10(v) / Math.log10(5000)))
}

/* ══════════════ خامات الهوية الصناعية ══════════════ */

/** شريط التحذير الصناعي (Hazard Tape) — خطوط قطرية قرمزي/فولاذي */
function HazardTape({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: light
          ? 'repeating-linear-gradient(-45deg, rgba(220,38,38,0.85) 0 8px, rgba(244,244,245,0.92) 8px 16px)'
          : 'repeating-linear-gradient(-45deg, rgba(220,38,38,0.85) 0 8px, rgba(24,24,27,0.92) 8px 16px)',
      }}
    />
  )
}

/** شبكة المخطط الهندسي (Blueprint Grid) — لخلفيات الفولاذ الداكنة */
const BLUEPRINT_GRID: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
}

/** علامات تدريج المقياس — خطوط داكنة فوق أشرطة الوقود/الحمولة */
const GAUGE_TICKS: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(90deg, transparent 0 9px, rgba(0,0,0,0.18) 9px 10px)',
}

/** لوحة الطبقة — صفيحة فولاذ مربّعة ببراغٍ ورقم الطبقة بخط Stencil */
function TierPlate({
  tier,
  size = 'md',
  className,
}: {
  tier: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const ramp = TIER_RAMPS[tier % TIER_RAMPS.length]
  const box = size === 'lg' ? 'size-12' : size === 'sm' ? 'size-6' : 'size-9'
  const txt = size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-[8px]' : 'text-[11.5px]'
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br shadow-sm ring-1 ring-inset ring-white/25',
        box,
        ramp,
        className,
      )}
    >
      {/* براغي الزوايا */}
      <span className="absolute left-[3px] top-[3px] size-[3px] rounded-full bg-white/45" />
      <span className="absolute right-[3px] top-[3px] size-[3px] rounded-full bg-white/45" />
      <span className="absolute bottom-[3px] left-[3px] size-[3px] rounded-full bg-black/35" />
      <span className="absolute bottom-[3px] right-[3px] size-[3px] rounded-full bg-black/35" />
      <span
        className={cn(
          'relative font-mono font-black leading-none text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]',
          txt,
        )}
      >
        {TIER_NUM[tier] ?? `#${tier + 1}`}
      </span>
    </span>
  )
}

/** لافتة "الأكثر اشتراكاً" — شريط لاصق صناعي بكتافات حمراء/فولاذية */
function TopTape({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-[4px] shadow-sm ring-1 ring-inset ring-black/20 dark:ring-white/10">
      <span
        aria-hidden
        className="w-3"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, #dc2626 0 5px, #f4f4f5 5px 10px)',
        }}
      />
      <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 text-[9px] font-black text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
        {children}
      </span>
      <span
        aria-hidden
        className="w-3"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, #dc2626 0 5px, #f4f4f5 5px 10px)',
        }}
      />
    </span>
  )
}

/** وسم فولاذي — مستطيل حاد بدل التذاكر المخرّمة */
function SteelTag({
  children,
  tone = 'steel',
  className,
}: {
  children: React.ReactNode
  tone?: 'steel' | 'red' | 'copper' | 'zinc' | 'dark'
  className?: string
}) {
  const tones = {
    steel:
      'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600/60 dark:bg-zinc-800 dark:text-zinc-300',
    red: 'border-red-300/80 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-300',
    copper:
      'border-amber-600/30 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300',
    zinc: 'border-border bg-muted text-muted-foreground',
    dark: 'border-white/15 bg-white/[0.07] text-zinc-200',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[9.5px] font-bold leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ══════════════ المشهد الرئيسي ══════════════ */

type Billing = 'monthly' | 'yearly'
type ViewMode = 'gallery' | 'matrix'
type TypeFilter = 'all' | 'electronics' | 'fashion'
type StatusFilter = 'all' | 'active' | 'inactive'

export function AdminPlansView() {
  const [plans, setPlans] = React.useState<PlanRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [editPlan, setEditPlan] = React.useState<PlanRow | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  /* هوية الصفحة: تبديل شهري/سنوي + معرض/جدول مواصفات */
  const [billing, setBilling] = React.useState<Billing>('monthly')
  const [viewMode, setViewMode] = React.useState<ViewMode>('gallery')
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')

  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await api<{ items: PlanRow[] }>('/api/admin/plans')
      setPlans(data.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الباقات')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  /* ─── إحصاءات مشتقّة ─── */
  const stats = React.useMemo(() => {
    const totalSubs = plans.reduce((s, p) => s + p.subscribersCount, 0)
    const active = plans.filter((p) => p.isActive)
    const canonical = plans.filter((p) => p.isCanonical).length
    const custom = plans.length - canonical
    const topPlan =
      totalSubs > 0
        ? plans.reduce((a, b) => (b.subscribersCount > a.subscribersCount ? b : a), plans[0])
        : null

    const monthlyPotential = plans.reduce(
      (s, p) => s + p.priceMonthly * p.subscribersCount,
      0,
    )
    const priced = active.filter((p) => p.priceMonthly > 0)
    const avgMonthly = priced.length
      ? Math.round(priced.reduce((s, p) => s + p.priceMonthly, 0) / priced.length)
      : 0
    const priceMin = priced.length ? Math.min(...priced.map((p) => p.priceMonthly)) : 0
    const priceMax = priced.length ? Math.max(...priced.map((p) => p.priceMonthly)) : 0
    const arpu = totalSubs > 0 ? Math.round(monthlyPotential / totalSubs) : 0
    return {
      totalSubs,
      activeCount: active.length,
      canonical,
      custom,
      topPlan,
      monthlyPotential,
      avgMonthly,
      priceMin,
      priceMax,
      arpu,
      electronics: plans.filter((p) => (p.businessType ?? 'electronics') === 'electronics').length,
      fashion: plans.filter((p) => p.businessType === 'fashion').length,
      maxSubs: plans.reduce((m, p) => Math.max(m, p.subscribersCount), 0),
    }
  }, [plans])

  /* ─── فلترة/بحث فوري ─── */
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return plans.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && (p.businessType ?? 'electronics') !== typeFilter) return false
      if (statusFilter === 'active' && !p.isActive) return false
      if (statusFilter === 'inactive' && p.isActive) return false
      return true
    })
  }, [plans, search, typeFilter, statusFilter])

  const hasFilters =
    search.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setStatusFilter('all')
  }

  /* ─── إجراءات ─── */
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const r = await api<{ ok?: boolean; message?: string }>(`/api/admin/plans/${deleteId}`, {
        method: 'DELETE',
      })
      toast.success(r?.message || 'تم إلغاء تفعيل الباقة')
      setDeleteId(null)
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setDeleting(false)
    }
  }

  /** تفعيل/تعطيل سريع عبر PUT الجزئي (نفس نقطة النهاية الأصلية) */
  const quickToggleActive = async (p: PlanRow) => {
    try {
      await api(`/api/admin/plans/${p.id}`, {
        method: 'PUT',
        body: { isActive: !p.isActive },
      })
      toast.success(!p.isActive ? `تم تفعيل «${p.name}»` : `تم تعطيل «${p.name}»`)
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحديث حالة الباقة')
    }
  }

  const deletePlan = plans.find((p) => p.id === deleteId) ?? null
  const noData = !loading && plans.length === 0

  /* ══════════════ العرض ══════════════ */
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═══ 1. الفرن — لافتة صناعية فولاذية داكنة بشريط تحذير وشبكة هندسية ═══ */}
      <section className="animate-in-up relative overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700/60 bg-zinc-900 text-zinc-50 shadow-lg shadow-zinc-900/10 dark:shadow-none">
        {/* شريط التحذير العلوي */}
        <HazardTape className="h-1.5 w-full" />
        {/* شبكة المخطط الهندسي */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={BLUEPRINT_GRID}
        />
        {/* توهّج الفرن */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(560px 220px at 88% -15%, rgba(220,38,38,0.30), transparent), radial-gradient(420px 200px at 0% 115%, rgba(220,38,38,0.10), transparent)',
          }}
        />
        {/* علامة مائية — مصنع */}
        <Factory
          aria-hidden
          strokeWidth={0.8}
          className="pointer-events-none absolute -bottom-10 -start-12 size-48 text-white/[0.05]"
        />

        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5 p-4 sm:p-6">
          {/* العنوان + الرقم الكبير */}
          <div className="w-full min-w-0 sm:w-auto sm:min-w-[240px]">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-red-400 shadow-inner">
                <Factory className="size-[18px]" strokeWidth={2.2} />
              </span>
              <div>
                <h1 className="text-lg font-extrabold leading-tight">خطط الاشتراك</h1>
                <p className="text-[11px] font-medium text-zinc-400">
                  خط إنتاج الباقات — مواصفات التسعير والقدرات التشغيلية
                </p>
              </div>
            </div>

            <p className="mt-3 text-[11px] font-medium text-zinc-400 sm:mt-4">
              مشتركون عبر كل الباقات
            </p>
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-l from-red-400 via-red-500 to-red-600 bg-clip-text text-4xl font-black tracking-tight tabular-nums text-transparent sm:text-5xl">
                {noData ? '—' : num(stats.totalSubs)}
              </span>
              <span className="text-sm font-semibold text-zinc-300 sm:text-base">
                مشترك · {plans.length} باقة
              </span>
            </div>

            {/* أقفال فولاذية سريعة */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-[4px] border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10.5px] font-bold text-zinc-200 backdrop-blur-sm">
                <Layers className="size-3 text-red-400" />
                {num(stats.activeCount)} باقة نشطة
              </span>
              <span className="inline-flex items-center gap-1 rounded-[4px] border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10.5px] font-bold text-zinc-200 backdrop-blur-sm">
                قياسية {stats.canonical} · مخصّصة {stats.custom}
              </span>
              {stats.topPlan && stats.topPlan.subscribersCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-[4px] border border-red-500/40 bg-red-600/20 px-2.5 py-1 text-[10.5px] font-bold text-red-300 backdrop-blur-sm">
                  <Flame className="size-3" />
                  {stats.topPlan.name}
                </span>
              )}
            </div>

            {/* أزرار */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setAddOpen(true)}
                className="gap-1.5 rounded-lg bg-red-600 text-white shadow-md shadow-red-600/30 hover:bg-red-500"
              >
                <Plus className="size-4" strokeWidth={2.5} />
                باقة جديدة
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="تحديث"
                onClick={() => load(true)}
                disabled={refreshing}
                className="rounded-lg border-white/15 bg-white/[0.06] text-zinc-200 backdrop-blur-sm hover:bg-white/[0.12] hover:text-white"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              </Button>
            </div>
          </div>

          {/* مدخنة الإنتاج — كل طابق = باقة، الارتفاع = عدد المشتركين */}
          <div className="order-3 w-full min-w-0 sm:order-none sm:ms-auto sm:w-auto">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-zinc-100">
                  <TrendingUp className="size-3.5 text-red-400" />
                  مدخنة الإنتاج
                </h3>
                <span className="text-[9.5px] font-medium text-zinc-500">
                  اضغط طابقاً لتعديل الباقة
                </span>
              </div>

              {loading || noData ? (
                <Skeleton className="h-[84px] w-[188px] bg-white/10" />
              ) : (
                <div className="flex items-end gap-3">
                  {/* المدخنة */}
                  <div className="flex w-16 flex-col-reverse items-stretch gap-[3px] rounded-md border-x-2 border-b-2 border-white/15 bg-black/20 p-0 pb-0">
                    {plans.map((p, i) => {
                      const h = stats.maxSubs > 0 ? 8 + (p.subscribersCount / stats.maxSubs) * 16 : 10
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={`${p.name} — ${p.subscribersCount} مشترك`}
                          onClick={() => setEditPlan(p)}
                          className="relative mx-auto flex w-full items-center justify-center rounded-t-[3px] text-white shadow-sm transition-all hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400"
                          style={{ height: `${h}px` }}
                        >
                          <span
                            className={cn(
                              'absolute inset-0 rounded-t-[3px] bg-gradient-to-l',
                              TIER_RAMPS[i % TIER_RAMPS.length],
                            )}
                          />
                          <span className="relative text-[9px] font-black tabular-nums drop-shadow">
                            {p.subscribersCount > 0 ? p.subscribersCount : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {/* القاعدة + المفتاح */}
                  <div className="flex flex-col justify-end gap-1 pb-0.5">
                    {plans.slice(0, 3).map((p, i) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 text-[9.5px] font-semibold text-zinc-300"
                      >
                        <span
                          className={cn(
                            'size-2 rounded-[2px] bg-gradient-to-br',
                            TIER_RAMPS[i % TIER_RAMPS.length],
                          )}
                        />
                        {p.name.length > 22 ? p.name.slice(0, 22) + '…' : p.name}
                      </span>
                    ))}
                    {plans.length > 3 && (
                      <span className="text-[9px] font-medium text-zinc-500">
                        +{plans.length - 3} باقات أخرى
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2. ميزان التسعير — مسطرة حمل صناعية: كل باقة مسمار على محور السعر ═══ */}
      {!noData && (
        <section className="animate-in-up stagger-1 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
              <Gauge className="size-4 text-red-600 dark:text-red-400" />
              ميزان التسعير
              <span className="text-[11px] font-medium text-muted-foreground">
                — موضع كل باقة على محور السعر الشهري مع حصّتها من المشتركين
              </span>
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
              <span className="size-1.5 rounded-[2px] bg-zinc-400" /> رخيصة
              <span className="mx-1 h-px w-8 bg-border" />
              <span className="size-1.5 rounded-[2px] bg-red-600" /> أعلى سعراً
            </div>
          </div>

          {loading ? (
            <Skeleton className="mt-3 h-32 w-full" />
          ) : (
            <div className="relative mt-4 h-32 select-none sm:h-36">
              {/* علامات القياس */}
              {[0, 25, 50, 75, 100].map((t) => (
                <div key={t} className="absolute bottom-0 top-0" style={{ right: `calc(${t}% )` }}>
                  <div className="h-full w-px bg-border/70" />
                  <div className="absolute bottom-0 start-1/2 h-1.5 w-px translate-x-1/2 bg-border" />
                </div>
              ))}
              {/* جسر المسطرة الفولاذي */}
              <div className="absolute inset-x-0 bottom-5 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />

              {/* الباقات — الأرخص يميناً (بداية القراءة) */}
              {(() => {
                const priced = plans.filter((p) => p.isActive)
                const maxP = Math.max(1, ...priced.map((p) => p.priceMonthly))
                return priced.map((p, i) => {
                  const raw = maxP > 0 ? (p.priceMonthly / maxP) * 100 : 0
                  const pos = 4 + raw * 0.92 // هوامش داخلية
                  const barH = 10 + (stats.maxSubs > 0 ? (p.subscribersCount / stats.maxSubs) * 46 : 0)
                  const up = i % 2 === 0 // تناوب الملصقات فوق/تحت
                  return (
                    <div
                      key={p.id}
                      className="absolute inset-y-0"
                      style={{ right: `${pos}%` }}
                      title={`${p.name} — ${formatCurrency(p.priceMonthly)}/شهر · ${p.subscribersCount} مشترك`}
                    >
                      <div className="translate-x-1/2">
                        {/* الملصق المتناوب */}
                        {up ? (
                          <div className="absolute bottom-[calc(100%-14px)] translate-x-[-50%] text-center">
                            <p className="whitespace-nowrap text-[9.5px] font-bold leading-tight text-foreground/90">
                              {p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name}
                            </p>
                            <p className="font-mono text-[9px] font-black tabular-nums text-red-600 dark:text-red-400">
                              {p.priceMonthly === 0 ? 'مجاناً' : `${num(p.priceMonthly)} ج.م`}
                            </p>
                            <div className="mx-auto mt-0.5 h-2 w-px bg-border" />
                          </div>
                        ) : null}

                        {/* المسمار الفولاذي */}
                        <div className="absolute bottom-[22px] translate-x-[-50%]">
                          <span
                            className={cn(
                              'block size-3.5 rounded-[3px] bg-gradient-to-br shadow-sm ring-1 ring-white/50',
                              TIER_RAMPS[i % TIER_RAMPS.length],
                            )}
                          />
                        </div>

                        {/* عمود المشتركين */}
                        <div
                          className="absolute bottom-[6px] translate-x-[-50%] rounded-t-[2px] bg-gradient-to-t from-red-600 to-red-400 dark:from-red-700 dark:to-red-500"
                          style={{ height: `${barH}px`, width: '10px' }}
                        />

                        {/* ملصق سفلي */}
                        {!up ? (
                          <div className="absolute top-[calc(100%-58px)] translate-x-[-50%] text-center">
                            <div className="mx-auto mb-0.5 h-2 w-px bg-border" />
                            <p className="whitespace-nowrap text-[9.5px] font-bold leading-tight text-foreground/90">
                              {p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name}
                            </p>
                            <p className="font-mono text-[9px] font-black tabular-nums text-red-600 dark:text-red-400">
                              {p.priceMonthly === 0 ? 'مجاناً' : `${num(p.priceMonthly)} ج.م`}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              })()}

              {/* محور فارغ؟ */}
              {plans.filter((p) => p.isActive).length === 0 && (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  لا توجد باقات مفعّلة لعرضها على الميزان
                </div>
              )}
            </div>
          )}

          {/* لوحة قراءات الميزان */}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
            {[
              { label: 'متوسط السعر الشهري', value: `${num(stats.avgMonthly)} ج.م` },
              {
                label: 'نطاق الأسعار',
                value:
                  stats.priceMin > 0
                    ? `${num(stats.priceMin)} – ${num(stats.priceMax)}`
                    : '—',
              },
              { label: 'الإيراد الشهري المحتمل', value: `${num(stats.monthlyPotential)} ج.م` },
              { label: 'متوسط إيراد المشترك', value: stats.arpu > 0 ? `${num(stats.arpu)} ج.م` : '—' },
            ].map((s) => (
              <div key={s.label} className="rounded-md border bg-zinc-50 px-3 py-2 dark:bg-zinc-900/60">
                <p className="text-[9.5px] font-medium text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 font-mono text-sm font-extrabold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 3. لوحة التحكم — تبديل الشهري/السنوي + المعرض/الجدول + بحث وفلاتر ═══ */}
      {!noData && (
        <div className="animate-in-up stagger-2 space-y-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* تبديل الفوترة */}
            <div
              role="group"
              aria-label="وضع عرض الأسعار"
              className="inline-flex rounded-lg border bg-muted/50 p-0.5"
            >
              {(
                [
                  { v: 'monthly', label: 'شهري', icon: CalendarDays },
                  { v: 'yearly', label: 'سنوي', icon: CalendarRange },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setBilling(o.v)}
                  aria-pressed={billing === o.v}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all',
                    billing === o.v
                      ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <o.icon className="size-3.5" />
                  {o.label}
                </button>
              ))}
            </div>

            {/* تبديل العرض */}
            <div
              role="group"
              aria-label="وضع العرض"
              className="inline-flex rounded-lg border bg-muted/50 p-0.5"
            >
              {(
                [
                  { v: 'gallery', label: 'معرض', icon: LayoutGrid },
                  { v: 'matrix', label: 'مواصفات', icon: Table2 },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setViewMode(o.v)}
                  aria-pressed={viewMode === o.v}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all',
                    viewMode === o.v
                      ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <o.icon className="size-3.5" />
                  {o.label}
                </button>
              ))}
            </div>

            {/* البحث */}
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الكود…"
                className="rounded-lg bg-muted/40 ps-9"
              />
            </div>
          </div>

          {/* فلاتر النوع + الحالة */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground">النوع:</span>
            {(
              [
                { v: 'all', label: 'الكل', count: plans.length },
                { v: 'electronics', label: 'موبايل وكمبيوتر', count: stats.electronics },
                { v: 'fashion', label: 'ملابس وأحذية', count: stats.fashion },
              ] as const
            ).map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => setTypeFilter(f.v as TypeFilter)}
                aria-pressed={typeFilter === f.v}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10.5px] font-bold transition-colors',
                  typeFilter === f.v
                    ? 'border-red-600 bg-red-600 text-white shadow-sm shadow-red-600/25'
                    : 'bg-card text-muted-foreground hover:border-red-300 hover:text-foreground dark:hover:border-red-500/40',
                )}
              >
                {f.label}
                <span
                  className={cn(
                    'rounded-[3px] px-1 text-[9px] font-black tabular-nums',
                    typeFilter === f.v ? 'bg-white/20' : 'bg-muted',
                  )}
                >
                  {f.count}
                </span>
              </button>
            ))}

            <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
            <span className="text-[10px] font-bold text-muted-foreground">الحالة:</span>
            {(
              [
                { v: 'all', label: 'الكل' },
                { v: 'active', label: 'مفعّلة' },
                { v: 'inactive', label: 'معطّلة' },
              ] as const
            ).map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => setStatusFilter(f.v as StatusFilter)}
                aria-pressed={statusFilter === f.v}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10.5px] font-bold transition-colors',
                  statusFilter === f.v
                    ? 'border-red-600 bg-red-600 text-white shadow-sm shadow-red-600/25'
                    : 'bg-card text-muted-foreground hover:border-red-300 hover:text-foreground dark:hover:border-red-500/40',
                )}
              >
                {f.label}
              </button>
            ))}

            {/* ملخّص الفلاتر */}
            {(hasFilters || filtered.length !== plans.length) && (
              <span className="ms-auto inline-flex items-center gap-1.5 rounded-md bg-red-600/10 px-2.5 py-1 text-[10.5px] font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {filtered.length} / {plans.length} باقة
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-[3px] bg-red-600/15 px-1.5 font-black underline-offset-2 hover:underline dark:bg-red-500/15"
                  >
                    مسح
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ═══ 4. المحتوى ═══ */}
      {loading ? (
        /* هيكل التحميل */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-2 w-5/6 rounded-full" />
              <Skeleton className="h-2 w-2/3 rounded-full" />
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
      ) : noData ? (
        /* حالة الفراغ — مصنع متوقّف */
        <div className="animate-in-up stagger-3 flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 px-6 py-16 text-center shadow-sm">
          <div className="relative">
            <div className="absolute inset-0 -m-3 rounded-lg border-2 border-dotted border-zinc-300 dark:border-zinc-700" />
            <div className="flex size-14 items-center justify-center rounded-lg bg-zinc-900 text-red-500 shadow-lg ring-1 ring-inset ring-white/10 dark:border dark:border-zinc-700">
              <Factory className="size-7" strokeWidth={1.8} />
            </div>
          </div>
          <h3 className="mt-4 text-base font-extrabold">لا توجد باقات بعد</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            الباقات هي خط الإنتاج — أنشئ أول باقة (سعر، حدود، مميزات، وحدات) وسيظهر موضعها هنا
            على ميزان التسعير ومدخنة الإنتاج.
          </p>
          <Button
            onClick={() => setAddOpen(true)}
            className="mt-4 gap-1.5 rounded-lg bg-red-600 text-white shadow-md shadow-red-600/30 hover:bg-red-500"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            أنشئ أول باقة
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        /* لا نتائج للفلترة */
        <div className="animate-in-up stagger-3 flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center shadow-sm">
          <Search className="size-8 text-muted-foreground/60" strokeWidth={1.6} />
          <h3 className="mt-3 text-sm font-extrabold">لا توجد نتائج مطابقة</h3>
          <p className="mt-1 text-xs text-muted-foreground">جرّب تعديل البحث أو الفلاتر</p>
          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 rounded-md gap-1.5">
            مسح الفلاتر
          </Button>
        </div>
      ) : viewMode === 'gallery' ? (
        /* ─── معرض الباقات — ألواح المواصفات ─── */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              tier={idx}
              billing={billing}
              totalSubs={stats.totalSubs}
              isTop={stats.topPlan?.id === p.id && p.subscribersCount > 0}
              stagger={idx}
              onEdit={() => setEditPlan(p)}
              onDeactivate={() => setDeleteId(p.id)}
              onToggleActive={() => quickToggleActive(p)}
            />
          ))}
        </div>
      ) : (
        /* ─── جدول المواصفات ─── */
        <div className="animate-in-up stagger-3 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-900 text-zinc-50">
                  <th className="sticky start-0 z-10 w-36 bg-zinc-900 px-3 py-3.5 text-start text-[11px] font-extrabold text-zinc-400">
                    وجه المقارنة
                  </th>
                  {filtered.map((p, i) => (
                    <th key={p.id} className="min-w-[160px] px-3 pb-3 pt-2.5 align-top">
                      <div
                        className={cn(
                          'mb-2 h-1 rounded-full bg-gradient-to-l',
                          TIER_RAMPS[i % TIER_RAMPS.length],
                        )}
                      />
                      <div className="flex items-start gap-2">
                        <TierPlate tier={i} size="sm" />
                        <div className="min-w-0 text-start">
                          <p className="truncate text-[12.5px] font-extrabold leading-tight text-white">
                            {p.name}
                          </p>
                          <p className="font-mono text-[9.5px] text-zinc-400" dir="ltr">
                            {p.code}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <SteelTag tone="dark">{p.isCanonical ? 'قياسي' : 'مخصّص'}</SteelTag>
                            {!p.isActive && <SteelTag tone="dark">معطّلة</SteelTag>}
                          </div>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(
                  [
                    {
                      label: 'السعر الشهري',
                      render: (p: PlanRow) =>
                        p.priceMonthly === 0 ? (
                          <span className="font-extrabold text-red-600 dark:text-red-400">
                            مجاناً
                          </span>
                        ) : (
                          <span className="font-mono text-[13px] font-extrabold tabular-nums">
                            {formatCurrency(p.priceMonthly)}
                          </span>
                        ),
                    },
                    {
                      label: 'السعر السنوي',
                      render: (p: PlanRow) => (
                        <span className="font-mono text-[12px] font-bold tabular-nums text-muted-foreground">
                          {p.priceYearly === 0 ? '—' : formatCurrency(p.priceYearly)}
                        </span>
                      ),
                    },
                    {
                      label: 'أيام التجربة',
                      render: (p: PlanRow) => (
                        <span className="inline-flex items-center gap-1 text-xs font-bold">
                          <Clock3 className="size-3 text-red-600 dark:text-red-400" />
                          {p.trialDays > 0 ? `${p.trialDays} يوم` : '—'}
                        </span>
                      ),
                    },
                    {
                      label: 'نوع النشاط',
                      render: (p: PlanRow) => (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold">
                          {(p.businessType ?? 'electronics') === 'fashion' ? (
                            <Shirt className="size-3 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <Smartphone className="size-3 text-zinc-500 dark:text-zinc-400" />
                          )}
                          {BUSINESS_TYPE_LABEL[p.businessType ?? 'electronics'] ?? p.businessType}
                        </span>
                      ),
                    },
                    {
                      label: 'المستخدمون',
                      render: (p: PlanRow) => (
                        <span className="font-mono text-xs font-bold tabular-nums">
                          {p.maxUsers >= 999999 ? '∞' : num(p.maxUsers)}
                        </span>
                      ),
                    },
                    {
                      label: 'المنتجات',
                      render: (p: PlanRow) => (
                        <span className="font-mono text-xs font-bold tabular-nums">
                          {p.maxProducts >= 999999 ? '∞' : num(p.maxProducts)}
                        </span>
                      ),
                    },
                    {
                      label: 'الفروع',
                      render: (p: PlanRow) => (
                        <span className="font-mono text-xs font-bold tabular-nums">
                          {p.maxBranches >= 999999 ? '∞' : num(p.maxBranches)}
                        </span>
                      ),
                    },
                    {
                      label: 'المشتركون',
                      render: (p: PlanRow) => (
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold tabular-nums">
                          {num(p.subscribersCount)}
                          <span className="relative inline-block h-1.5 w-10 overflow-hidden rounded-[3px] bg-muted align-middle">
                            <span
                              className="block h-full rounded-[3px] bg-gradient-to-l from-red-600 to-red-500"
                              style={{
                                width:
                                  stats.totalSubs > 0
                                    ? `${Math.max(4, (p.subscribersCount / stats.totalSubs) * 100)}%`
                                    : '0%',
                              }}
                            />
                          </span>
                        </span>
                      ),
                    },
                    {
                      label: 'الوحدات المفعّلة',
                      render: (p: PlanRow) => {
                        const mods = parseCaps(p.enabledModules)
                        if (mods.length === 0) {
                          const def =
                            (p.businessType ?? 'electronics') === 'fashion'
                              ? FASHION_DEFAULTS
                              : ELECTRONICS_DEFAULTS
                          return (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                              <Layers className="size-3" />
                              {def.length}
                              <SteelTag tone="zinc" className="ms-0.5">
                                افتراضي
                              </SteelTag>
                            </span>
                          )
                        }
                        return (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold">
                            <Layers className="size-3 text-red-600 dark:text-red-400" />
                            {mods.length}
                          </span>
                        )
                      },
                    },
                  ] as { label: string; render: (p: PlanRow) => React.ReactNode }[]
                ).map((row) => (
                  <tr key={row.label} className="transition-colors hover:bg-muted/20">
                    <th
                      scope="row"
                      className="sticky start-0 z-10 bg-card px-3 py-2.5 text-start text-[11px] font-bold text-muted-foreground"
                    >
                      {row.label}
                    </th>
                    {filtered.map((p) => (
                      <td key={p.id} className="px-3 py-2.5 text-center">
                        {row.render(p)}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* اتحاد المزايا ✓ / — */}
                {(() => {
                  const union: string[] = []
                  for (const p of filtered) {
                    for (const f of parseFeatures(p.features).split('\n')) {
                      const t = f.trim()
                      if (t && !union.includes(t)) union.push(t)
                    }
                  }
                  if (union.length === 0) return null
                  return union.map((f) => (
                    <tr key={f} className="transition-colors hover:bg-muted/20">
                      <th
                        scope="row"
                        className="sticky start-0 z-10 max-w-[150px] truncate bg-card px-3 py-2 text-start text-[11px] font-semibold text-muted-foreground"
                        title={f}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Check className="size-3 text-red-600 dark:text-red-400" />
                          {f}
                        </span>
                      </th>
                      {filtered.map((p) => {
                        const has = parseFeatures(p.features)
                          .split('\n')
                          .map((x) => x.trim())
                          .includes(f)
                        return (
                          <td key={p.id} className="px-3 py-2 text-center">
                            {has ? (
                              <span className="mx-auto flex size-5 items-center justify-center rounded-[4px] bg-red-600/10 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                                <Check className="size-3" strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="mx-auto flex size-5 items-center justify-center rounded-[4px] text-muted-foreground/40">
                                <Minus className="size-3" strokeWidth={3} />
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                })()}

                {/* صف الإجراءات */}
                <tr>
                  <th
                    scope="row"
                    className="sticky start-0 z-10 bg-card px-3 py-3 text-start text-[11px] font-bold text-muted-foreground"
                  >
                    الإجراءات
                  </th>
                  {filtered.map((p) => (
                    <td key={p.id} className="px-3 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditPlan(p)}
                        className="gap-1.5 rounded-md border-zinc-300 hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:hover:border-red-500/50 dark:hover:text-red-400"
                      >
                        <Pencil className="size-3.5" />
                        تعديل
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="border-t bg-muted/20 px-4 py-2 text-center text-[10px] font-medium text-muted-foreground">
            مقارنة {filtered.length} باقة · الأسعار بالجنيه المصري · الوحدات الافتراضية محسوبة بحسب
            نوع النشاط
          </p>
        </div>
      )}

      {/* ═══ 5. ديالوق الباقة (تعديل/إضافة) — مبوّب ═══ */}
      {editPlan ? (
        <PlanDialog
          plan={editPlan}
          open={!!editPlan}
          onOpenChange={(o) => !o && setEditPlan(null)}
          onSaved={() => load(true)}
        />
      ) : (
        <PlanDialog
          plan={null}
          open={addOpen}
          onOpenChange={setAddOpen}
          onSaved={() => load(true)}
        />
      )}

      {/* ═══ 6. تأكيد إلغاء التفعيل ═══ */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-rose-600/10 text-rose-600 dark:text-rose-400">
                <CircleOff className="size-4" />
              </span>
              إلغاء تفعيل الباقة
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletePlan && (
                <span className="block font-bold text-foreground">{deletePlan.name}</span>
              )}
              سيتم تعطيل الباقة (لن تظهر للعملاء الجدد) وستستمر الاشتراكات الحالية حتى انتهائها.
              الباقات القياسية لا تُحذف نهائياً — أما الباقات المخصّصة غير المرتبطة بأي اشتراك
              فتُحذف نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              نعم، أكمل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ══════════════ لوح المواصفات — الباقة في المعرض ══════════════ */

function PlanCard({
  plan: p,
  tier,
  billing,
  totalSubs,
  isTop,
  stagger,
  onEdit,
  onDeactivate,
  onToggleActive,
}: {
  plan: PlanRow
  tier: number
  billing: Billing
  totalSubs: number
  isTop: boolean
  stagger: number
  onEdit: () => void
  onDeactivate: () => void
  onToggleActive: () => void
}) {
  const features = parseFeatures(p.features).split('\n').filter(Boolean)
  const isFashion = (p.businessType ?? 'electronics') === 'fashion'
  const isFree = p.priceMonthly === 0 && p.priceYearly === 0
  const price = billing === 'monthly' ? p.priceMonthly : p.priceYearly
  const savings = p.priceMonthly * 12 - p.priceYearly
  const savingsPct =
    p.priceMonthly > 0 && savings > 0 ? Math.round((savings / (p.priceMonthly * 12)) * 100) : 0
  const share = totalSubs > 0 ? Math.max(3, (p.subscribersCount / totalSubs) * 100) : 0

  const meters = [
    { icon: Users, label: 'مستخدمين', value: p.maxUsers },
    { icon: Package, label: 'منتجات', value: p.maxProducts },
    { icon: Building2, label: 'فروع', value: p.maxBranches },
  ]

  return (
    <Card
      className={cn(
        'group relative flex animate-in-up flex-col overflow-hidden rounded-xl border-zinc-300/90 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-400/70 hover:shadow-md hover:ring-1 hover:ring-red-400/30 dark:border-zinc-700/60 dark:hover:border-red-500/40 dark:hover:ring-red-500/25',
        p.isActive ? '' : 'opacity-70 saturate-[.65]',
      )}
      style={{ animationDelay: `${Math.min(stagger, 8) * 45}ms` }}
    >
      {/* شريط تحذير للباقة الأكثر اشتراكاً */}
      {isTop && <HazardTape className="h-[3px] w-full" light />}

      {/* الترويسة الفولاذية */}
      <div className="border-b border-zinc-200 bg-zinc-100/80 px-3 py-2.5 dark:border-zinc-700/60 dark:bg-zinc-800/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <TierPlate tier={tier} />
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-extrabold leading-tight">{p.name}</h3>
              <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">
                {p.code}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <SteelTag tone={isFashion ? 'copper' : 'steel'}>
                  {isFashion ? (
                    <Shirt className="size-2.5" />
                  ) : (
                    <Smartphone className="size-2.5" />
                  )}
                  {BUSINESS_TYPE_LABEL[p.businessType ?? 'electronics'] ?? 'باقة'}
                </SteelTag>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isTop && (
              <TopTape>
                <Flame className="size-2.5" />
                الأكثر اشتراكاً
              </TopTape>
            )}
            <div className="flex items-center gap-1">
              <SteelTag tone={p.isCanonical ? 'steel' : 'copper'}>
                {p.isCanonical ? 'قياسي' : 'مخصّص'}
              </SteelTag>
              <SteelTag tone={p.isActive ? 'red' : 'zinc'}>
                <span
                  className={cn(
                    'size-1.5 rounded-[2px]',
                    p.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                  )}
                />
                {p.isActive ? 'مفعّلة' : 'معطّلة'}
              </SteelTag>
            </div>
          </div>
        </div>
        {p.description && (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {p.description}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* لوحة السعر — فولاذ داكن بأقواس هندسية */}
        <div className="relative overflow-hidden rounded-lg border border-zinc-300 bg-zinc-950 px-3 py-3 text-center text-zinc-50 dark:border-zinc-700">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={BLUEPRINT_GRID}
          />
          {/* أقواس الزوايا الهندسية */}
          <span
            aria-hidden
            className="absolute start-2 top-2 size-2.5 border-s-2 border-t-2 border-red-500/70"
          />
          <span
            aria-hidden
            className="absolute bottom-2 end-2 size-2.5 border-b-2 border-e-2 border-red-500/70"
          />
          {isFree ? (
            <span className="relative text-2xl font-black text-red-400">مجاناً</span>
          ) : (
            <>
              <p className="relative text-[9.5px] font-bold tracking-wide text-zinc-400">
                {billing === 'monthly' ? 'شهرياً' : 'سنوياً'}
              </p>
              <p className="relative flex items-baseline justify-center gap-1.5">
                <span className="text-3xl font-black tracking-tight text-white tabular-nums">
                  {num(price)}
                </span>
                <span className="text-[10px] font-semibold text-zinc-400">جنيه</span>
              </p>
              {billing === 'yearly' && savings > 0 && p.priceMonthly > 0 && (
                <span className="relative mt-1 inline-flex items-center gap-1 rounded-[4px] bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                  <Gauge className="size-2.5" />
                  توفير {num(savings)} ج.م ({savingsPct}%)
                </span>
              )}
              {billing === 'monthly' && p.priceYearly > 0 && (
                <p className="relative mt-0.5 text-[9.5px] font-semibold text-zinc-500">
                  سنوياً: <span className="font-mono tabular-nums">{num(p.priceYearly)}</span> ج.م
                </p>
              )}
            </>
          )}
          {p.trialDays > 0 && (
            <span className="relative mt-1.5 inline-flex items-center gap-1 rounded-[4px] border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[9.5px] font-bold text-zinc-300">
              <Clock3 className="size-2.5" />
              تجربة مجانية {p.trialDays} يوم
            </span>
          )}
        </div>

        {/* عدّادات السعة — مقاييس مدرّجة */}
        <div className="space-y-1.5">
          {meters.map((m) => (
            <div key={m.label} className="flex items-center gap-2 text-[11px]">
              <m.icon className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
              <span className="w-14 shrink-0 font-semibold text-muted-foreground">{m.label}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-[3px] bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={cn(
                    'absolute inset-y-0 start-0 rounded-[3px] bg-gradient-to-l',
                    m.value >= 999999
                      ? 'from-red-400 to-red-300 opacity-70'
                      : 'from-red-600 to-red-500',
                  )}
                  style={{ width: `${logNorm(m.value) * 100}%` }}
                />
                <div aria-hidden className="absolute inset-0" style={GAUGE_TICKS} />
              </div>
              <span className="w-10 shrink-0 text-end font-mono font-extrabold tabular-nums">
                {m.value >= 999999 ? '∞' : num(m.value)}
              </span>
            </div>
          ))}
        </div>

        {/* المزايا */}
        {features.length > 0 && (
          <ul className="max-h-36 space-y-1 overflow-y-auto text-[11.5px] leading-snug">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-red-600/10 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                  <Check className="size-2.5" strokeWidth={3.5} />
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        {/* التذييل: حصة المشتركين + الإجراءات */}
        <div className="mt-auto space-y-2 border-t pt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-muted-foreground">المشتركون</span>
            <span className="font-mono font-extrabold tabular-nums">
              {num(p.subscribersCount)}
              <span className="ms-1 font-sans font-semibold text-muted-foreground">
                ({totalSubs > 0 ? Math.round((p.subscribersCount / totalSubs) * 100) : 0}%)
              </span>
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-[3px] bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-[3px] bg-gradient-to-l from-red-600 to-red-500 transition-all"
              style={{ width: `${share}%` }}
            />
            <div aria-hidden className="absolute inset-0" style={GAUGE_TICKS} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="flex-1 gap-1.5 rounded-md border-zinc-300 hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:hover:border-red-500/50 dark:hover:text-red-400"
            >
              <Pencil className="size-3.5" />
              تعديل
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="خيارات إضافية"
                  className="size-8 rounded-md"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="size-3.5" />
                  تعديل الباقة
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleActive} className="gap-2">
                  <Power className="size-3.5" />
                  {p.isActive ? 'تعطيل مؤقت' : 'تفعيل الباقة'}
                </DropdownMenuItem>
                {p.isActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDeactivate}
                      className="gap-2 text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
                    >
                      <CircleOff className="size-3.5" />
                      إلغاء التفعيل
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ══════════════ ديالوق الباقة — غرفة التحكم المبوّبة ══════════════ */

function PlanDialog({
  plan,
  open,
  onOpenChange,
  onSaved,
}: {
  plan: PlanRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const isEdit = !!plan
  const [tab, setTab] = React.useState('basic')
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [businessType, setBusinessType] = React.useState<'electronics' | 'fashion'>('electronics')
  const [priceMonthly, setPriceMonthly] = React.useState('0')
  const [priceYearly, setPriceYearly] = React.useState('0')
  const [maxUsers, setMaxUsers] = React.useState('1')
  const [maxProducts, setMaxProducts] = React.useState('50')
  const [maxBranches, setMaxBranches] = React.useState('1')
  const [trialDays, setTrialDays] = React.useState('0')
  const [features, setFeatures] = React.useState('')
  const [capabilities, setCapabilities] = React.useState<string[]>([])
  // 🛡️ 2026-09-15 (v2): per-plan module list — controls which sidebar
  // items show up for users on this plan.
  const [enabledModules, setEnabledModules] = React.useState<string[]>([])
  const [sortOrder, setSortOrder] = React.useState('0')
  const [isActive, setIsActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) setTab('basic')
  }, [open])

  React.useEffect(() => {
    if (plan) {
      setCode(plan.code)
      setName(plan.name)
      setDescription(plan.description ?? '')
      setBusinessType((plan.businessType as any) === 'fashion' ? 'fashion' : 'electronics')
      setPriceMonthly(String(plan.priceMonthly))
      setPriceYearly(String(plan.priceYearly))
      setMaxUsers(String(plan.maxUsers))
      setMaxProducts(String(plan.maxProducts))
      setMaxBranches(String(plan.maxBranches))
      setTrialDays(String(plan.trialDays))
      setFeatures(parseFeatures(plan.features))
      setCapabilities(parseCaps(plan.capabilities))
      setEnabledModules(parseCaps(plan.enabledModules))
      setSortOrder(String(plan.sortOrder))
      setIsActive(plan.isActive)
    } else {
      setCode('')
      setName('')
      setDescription('')
      setBusinessType('electronics')
      setPriceMonthly('0')
      setPriceYearly('0')
      setMaxUsers('1')
      setMaxProducts('50')
      setMaxBranches('1')
      setTrialDays('0')
      setFeatures('')
      setCapabilities([])
      // 🛡️ default to electronics modules for new plans
      setEnabledModules([...ELECTRONICS_DEFAULTS])
      setSortOrder('0')
      setIsActive(true)
    }
  }, [plan, open])

  const liveMonthly = Number(priceMonthly) || 0
  const liveYearly = Number(priceYearly) || 0
  const liveSavings = liveMonthly * 12 - liveYearly
  const liveSavingsPct =
    liveMonthly > 0 && liveSavings > 0 ? Math.round((liveSavings / (liveMonthly * 12)) * 100) : 0

  const save = async () => {
    if (!code || !name) {
      toast.error('الكود والاسم مطلوبان')
      setTab('basic')
      return
    }
    setSaving(true)
    try {
      // 🛡️ Always force-include the critical modules (settings, users)
      // — these are required in every plan and can't be turned off.
      const finalModules = Array.from(new Set([
        ...enabledModules,
        'settings',
        'users',
      ]))
      const payload = {
        code,
        name,
        description,
        businessType,
        capabilities, // send as array — API handles either form
        enabledModules: finalModules, // send as array — API handles either form
        priceMonthly: Number(priceMonthly) || 0,
        priceYearly: Number(priceYearly) || 0,
        maxUsers: Number(maxUsers) || 1,
        maxProducts: Number(maxProducts) || 50,
        maxBranches: Number(maxBranches) || 1,
        trialDays: Number(trialDays) || 0,
        features,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      }
      if (isEdit && plan) {
        await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', body: payload })
        toast.success('تم تحديث الباقة')
      } else {
        await api('/api/admin/plans', { method: 'POST', body: payload })
        toast.success('تم إنشاء الباقة')
      }
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl [&>button]:text-white [&>button]:transition-colors"
      >
        {/* ترويسة غرفة التحكم — فولاذ داكن بشريط تحذير */}
        <div className="relative overflow-hidden bg-zinc-900 px-5 pb-4 pt-5 text-white">
          <HazardTape className="absolute inset-x-0 top-0 h-[3px]" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={BLUEPRINT_GRID}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(420px 160px at 90% -10%, rgba(220,38,38,0.25), transparent)',
            }}
          />
          <DialogHeader className="relative space-y-1.5">
            <div className="flex items-center gap-2.5">
              <TierPlate tier={0} size="sm" />
              <DialogTitle className="text-base font-extrabold">
                {isEdit ? 'تعديل الباقة' : 'صناعة باقة جديدة'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[11.5px] text-zinc-400">
              {isEdit ? `تعديل: ${plan?.name}` : 'اصنع باقة جديدة — تسعير، حدود، مميزات، ووحدات'}
            </DialogDescription>
          </DialogHeader>

          {/* ملخّص حيّ يتحدّث أثناء الكتابة */}
          <div className="relative mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-[4px] border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[10.5px] font-bold backdrop-blur-sm">
              <Factory className="size-3 shrink-0 text-red-400" />
              <span className="truncate">{name || 'باقة بدون اسم'}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-[4px] border border-white/15 bg-white/[0.07] px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums backdrop-blur-sm">
              {liveMonthly === 0 && liveYearly === 0 ? 'مجاناً' : `${num(liveMonthly)} ج.م/شهر`}
            </span>
            <span className="inline-flex items-center gap-1 rounded-[4px] border border-white/15 bg-white/[0.07] px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums backdrop-blur-sm">
              {num(liveYearly)} سنوي
            </span>
          </div>
        </div>

        {/* التبويبات */}
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-3 pt-2.5">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
              {(
                [
                  { v: 'basic', label: 'الأساسيات', icon: Factory },
                  { v: 'pricing', label: 'التسعير والحدود', icon: Gauge },
                  { v: 'features', label: 'المزايا والصلاحيات', icon: Check },
                  { v: 'modules', label: 'الوحدات', icon: Layers },
                ] as const
              ).map((t) => (
                <TabsTrigger
                  key={t.v}
                  value={t.v}
                  className="relative gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-xs font-bold text-muted-foreground shadow-none transition-none data-[state=active]:border-red-600 data-[state=active]:bg-transparent data-[state=active]:text-red-600 data-[state=active]:shadow-none dark:data-[state=active]:border-red-500 dark:data-[state=active]:text-red-400"
                >
                  <t.icon className="size-3.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/* ── تبويب الأساسيات ── */}
            <TabsContent value="basic" className="mt-0 space-y-3.5">
              <div className="space-y-1.5">
                <Label>نوع النشاط التجاري</Label>
                <Select value={businessType} onValueChange={(v: any) => setBusinessType(v)}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electronics">📱 موبايل وكمبيوتر</SelectItem>
                    <SelectItem value="fashion">👗 ملابس وأحذية</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10.5px] text-muted-foreground">
                  يحدّد الوحدات الافتراضية المتاحة للباقة (الصيانة والمعاملات المالية للإلكترونيات
                  فقط).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>الكود *</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="electronics-pro"
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الاسم *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="الباقة الاحترافية"
                    className="rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>الوصف</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="وصف مختصر يظهر للعملاء في صفحة الأسعار…"
                  className="rounded-lg"
                />
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-800/40 dark:text-zinc-300">
                💡 الكود يُستخدم داخلياً وفي الربط مع الاشتراكات — يُكتب بأحرف إنجليزية صغيرة بدون
                مسافات (مثال: <span className="font-mono">fashion-pro</span>).
              </div>
            </TabsContent>

            {/* ── تبويب التسعير والحدود ── */}
            <TabsContent value="pricing" className="mt-0 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>السعر الشهري (جنيه)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={priceMonthly}
                    onChange={(e) => setPriceMonthly(e.target.value)}
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>السعر السنوي (جنيه)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={priceYearly}
                    onChange={(e) => setPriceYearly(e.target.value)}
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* معاينة التوفير الحيّة */}
              {liveMonthly > 0 && liveYearly > 0 && (
                <div
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3.5 py-2.5',
                    liveSavings > 0
                      ? 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-700/40 dark:bg-emerald-950/40'
                      : 'border-rose-300/60 bg-rose-50/70 dark:border-rose-700/40 dark:bg-rose-950/40',
                  )}
                >
                  <span className="text-[11px] font-bold">
                    {liveSavings > 0 ? 'وفّر العميل سنوياً' : 'السنوي أعلى من ١٢× شهري'}
                  </span>
                  <span
                    className={cn(
                      'font-mono text-sm font-extrabold tabular-nums',
                      liveSavings > 0
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-700 dark:text-rose-300',
                    )}
                  >
                    {liveSavings > 0 ? `${num(liveSavings)} ج.م` : `+${num(-liveSavings)} ج.م`}
                    {liveSavingsPct > 0 && (
                      <span className="ms-1 text-[10px]">({liveSavingsPct}%)</span>
                    )}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>أقصى مستخدمين</Label>
                  <Input
                    type="number"
                    min={1}
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(e.target.value)}
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>أقصى منتجات</Label>
                  <Input
                    type="number"
                    min={0}
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(e.target.value)}
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>أقصى فروع</Label>
                  <Input
                    type="number"
                    min={1}
                    value={maxBranches}
                    onChange={(e) => setMaxBranches(e.target.value)}
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                💡 استخدم <span className="font-mono font-bold">999999</span> للإطلاق (∞ بلا
                حدود).
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>أيام التجربة المجانية</Label>
                  <Input
                    type="number"
                    min={0}
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>ترتيب العرض</Label>
                  <Input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    dir="ltr"
                    className="rounded-lg font-mono"
                  />
                </div>
              </div>

              <label
                htmlFor="plan-active"
                className="flex cursor-pointer items-center justify-between rounded-lg border p-3.5 transition-colors hover:bg-muted/40"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-red-600 to-red-800 text-white shadow-sm">
                    <Power className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">الباقة مفعّلة</span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      الباقات المعطّلة لا تظهر للعملاء الجدد
                    </span>
                  </span>
                </span>
                <Switch checked={isActive} onCheckedChange={setIsActive} id="plan-active" />
              </label>
            </TabsContent>

            {/* ── تبويب المزايا والصلاحيات ── */}
            <TabsContent value="features" className="mt-0 space-y-3.5">
              <div className="space-y-1.5">
                <Label>المميزات (كل ميزة في سطر)</Label>
                <Textarea
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  rows={6}
                  placeholder={'حتى 500 منتج\n5 مستخدمين\nتقارير متقدمة'}
                  className="rounded-lg"
                />
                <p className="text-[10.5px] text-muted-foreground">
                  تظهر كقائمة ✓ في لوح الباقة وفي جدول المواصفات.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>الصلاحيات المتاحة (Capabilities)</Label>
                <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  {CAPABILITIES_META.map((cap) => {
                    const checked = capabilities.includes(cap.key)
                    return (
                      <button
                        key={cap.key}
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() =>
                          setCapabilities((prev) =>
                            checked ? prev.filter((c) => c !== cap.key) : [...prev, cap.key],
                          )
                        }
                        className={cn(
                          'flex items-start gap-2.5 rounded-md border p-2.5 text-start transition-all',
                          checked
                            ? 'border-red-300 bg-red-50 shadow-sm dark:border-red-500/50 dark:bg-red-950/40'
                            : 'border-border hover:border-red-300 hover:bg-muted/40 dark:hover:border-red-500/30',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] border transition-all',
                            checked
                              ? 'border-red-600 bg-gradient-to-br from-red-600 to-red-800 text-white'
                              : 'border-muted-foreground/30 text-transparent',
                          )}
                        >
                          <Check className="size-3" strokeWidth={3.5} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold leading-tight">
                            {cap.label}
                          </span>
                          <span className="block text-[10.5px] leading-snug text-muted-foreground">
                            {cap.desc}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </TabsContent>

            {/* ── تبويب الوحدات ── */}
            <TabsContent value="modules" className="mt-0 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[13px]">الصفحات المتاحة في القائمة الجانبية (Modules)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEnabledModules(
                      businessType === 'fashion' ? [...FASHION_DEFAULTS] : [...ELECTRONICS_DEFAULTS],
                    )
                  }
                  className="gap-1.5 rounded-md"
                >
                  <RefreshCw className="size-3.5" />
                  تطبيق الافتراضي لـ{businessType === 'fashion' ? 'ملابس' : 'موبايل'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                فعّل الصفحات اللي الباقة دي تفتحها للمستخدم. الإعدادات والمستخدمين مفعّلين دائماً.
                {businessType === 'fashion' &&
                  ' عناصر موبايل/كمبيوتر (الصيانة، المعاملات المالية) غير متاحة لملابس.'}
              </p>
              <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
                {MODULES_META.map((mod) => {
                  const isCritical = mod.key === 'settings' || mod.key === 'users'
                  const checked = isCritical || enabledModules.includes(mod.key)
                  // For fashion plans, disable the electronics-only toggles
                  const isElectronicsOnly = !!mod.electronicsOnly
                  const isDisabledForCurrentType = businessType === 'fashion' && isElectronicsOnly
                  const effectivelyDisabled = isCritical || isDisabledForCurrentType
                  return (
                    <button
                      key={mod.key}
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      disabled={effectivelyDisabled}
                      onClick={() =>
                        setEnabledModules((prev) =>
                          checked ? prev.filter((m) => m !== mod.key) : [...prev, mod.key],
                        )
                      }
                      className={cn(
                        'flex items-start gap-2.5 rounded-md border p-2.5 text-start transition-all',
                        isCritical
                          ? 'cursor-not-allowed border-border bg-muted/40'
                          : isDisabledForCurrentType
                            ? 'cursor-not-allowed border-border opacity-50'
                            : checked
                              ? 'cursor-pointer border-red-300 bg-red-50 shadow-sm dark:border-red-500/50 dark:bg-red-950/40'
                              : 'cursor-pointer border-border hover:border-red-300 hover:bg-muted/40 dark:hover:border-red-500/30',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] border transition-all',
                          checked
                            ? 'border-red-600 bg-gradient-to-br from-red-600 to-red-800 text-white'
                            : 'border-muted-foreground/30 text-transparent',
                        )}
                      >
                        {effectivelyDisabled ? (
                          <Lock className="size-2.5 text-muted-foreground" strokeWidth={2.5} />
                        ) : (
                          <Check className="size-3" strokeWidth={3.5} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold leading-tight">
                          {mod.label}
                          {isCritical && (
                            <span className="ms-1 text-[9.5px] font-semibold text-muted-foreground">
                              (إجباري)
                            </span>
                          )}
                          {isDisabledForCurrentType && (
                            <span className="ms-1 text-[9.5px] font-semibold text-muted-foreground">
                              (غير متاح لملابس)
                            </span>
                          )}
                        </span>
                        <span className="block text-[10.5px] leading-snug text-muted-foreground">
                          {mod.desc}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* التذييل */}
        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/30 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-lg"
          >
            إلغاء
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="gap-1.5 rounded-lg bg-red-600 text-white shadow-md shadow-red-600/30 hover:bg-red-500"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" />
            {isEdit ? 'حفظ' : 'إنشاء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
