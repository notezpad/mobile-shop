'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AdminSubscriptionsView — "سجلّ الاشتراكات" (تصميم 2026-10-08)
 * ═══════════════════════════════════════════════════════════════════════
 *  هوية الصفحة: "دفتر الأقساط / الخزنة" — الصفحة دي عن الفلوس والزمن:
 *  كل اشتراك = قيد في الدفتر له بداية ونهاية ومبلغ محصّل.
 *
 *  عناصر الهوية (لا توجد في أي صفحة تانية):
 *    1. لافتة "الخزنة" الداكنة — تركواز عميق + نقش خطوط البانكنوت
 *       (guilloché) بدل النقش المنقّط + رقم كبير = إجمالي المحصّل
 *       + رسم بياني مصغّر (sparkline) لإيراد آخر ٦ شهور.
 *    2. شريط "الإيصال" — بطاقة واحدة بحواف مثقّبة (perforation)
 *       وفواصل متقطّعة وأرقام monospace زي إيصال حقيقي.
 *    3. أختام الحالة (Stamp) — شارة بشكل ختم حبر مايل بحدود مزدوجة.
 *    4. "خط الحياة" — شريط جانت لكل اشتراك: البداية ← علامة اليوم ←
 *       النهاية، بلون حسب المتبقي.
 *    5. رقم القيد — كل صف له رقم monospace زي سطر إيصال.
 *
 *  كل منطق البيانات (API endpoints + العقود) زي ما هو بالظبط — تغيير
 *  العرض فقط + فلترة فورية على العميل (زي صفحة المحلات).
 */

import * as React from 'react'
import {
  ReceiptText,
  Plus,
  RefreshCw,
  Search,
  Loader2,
  CalendarPlus,
  Pause,
  Trash2,
  Banknote,
  Smartphone,
  Landmark,
  Wallet,
  HandCoins,
  KeyRound,
  Minus,
  TrendingUp,
  AlertTriangle,
  FlaskConical,
  ArrowUpDown,
  X,
  Info,
  CalendarDays,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { formatCurrency, formatShortDate, formatArabicDate } from '@/lib/format'
import { toast } from 'sonner'
import { PlanChangeLogPanel } from './plans/PlanChangeLogPanel'

/* ───────────────────────── أنواع البيانات ───────────────────────── */

interface SubRow {
  id: number
  tenantId: string
  shopName: string
  planId: number
  planCode: string
  planName: string
  status: string
  period: string
  amountPaid: number
  paymentMethod: string | null
  paymentNote: string | null
  startDate: string
  endDate: string
  createdAt: string
}

interface TenantLite {
  id: string
  shopName: string
}

interface PlanLite {
  id: number
  code: string
  name: string
  priceMonthly: number
  priceYearly: number
  trialDays: number
}

/* ───────────────────────── أدوات مساعدة ───────────────────────── */

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** أيام متبقية حتى تاريخ (سالب = فات) */
const daysUntil = (iso: string) =>
  (new Date(iso).getTime() - Date.now()) / 86_400_000

const AR_MONTHS_SHORT = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس']

/* ───────────────────────── خرائط الحالات والدفع ───────────────────────── */

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: 'نشط', color: '#0d9488' },
  expired: { label: 'منتهي', color: '#e11d48' },
  cancelled: { label: 'ملغي', color: '#64748b' },
  grace: { label: 'سماح', color: '#b45309' },
}
function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: '#64748b' }
}

const PERIOD_LABEL: Record<string, string> = {
  monthly: 'شهري',
  yearly: 'سنوي',
  trial: 'تجريبي',
}

const METHOD_META: Record<string, { label: string; icon: LucideIcon }> = {
  cash: { label: 'كاش', icon: Banknote },
  vodafone_cash: { label: 'محفظة إلكترونية', icon: Smartphone },
  instapay: { label: 'إنستا باي', icon: Landmark },
  fawry: { label: 'محفظة إلكترونية', icon: Wallet },
  manual: { label: 'يدوي', icon: HandCoins },
  code: { label: 'كود تفعيل', icon: KeyRound },
}
function methodMeta(m: string | null) {
  if (!m) return null
  return METHOD_META[m] ?? { label: m, icon: Minus }
}

/** لوحة ألوان الباقات — تركواز أولاً (هوية الصفحة) */
const PLAN_COLORS = ['#0d9488', '#f59e0b', '#ec4899', '#0891b2', '#7c3aed', '#f43f5e']
function planColor(code: string): string {
  if (code.includes('pro')) return '#0891b2'
  if (code.includes('fashion')) return '#ec4899'
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return PLAN_COLORS[h % PLAN_COLORS.length]
}

/* ═══════════════════ مكوّنات الهوية ═══════════════════ */

/** ── ختم الحالة — شارة بشكل ختم حبر مايل بحد مزدوج ── */
function StampBadge({ row, size = 'md' }: { row: SubRow; size?: 'md' | 'sm' }) {
  const isTrial = row.status === 'active' && row.period === 'trial'
  const m = isTrial ? { label: 'تجريبي', color: '#0891b2' } : statusMeta(row.status)
  const md = size === 'md'
  return (
    <span
      className={cn(
        'inline-flex select-none items-center gap-1.5 rounded-md border-2 font-extrabold uppercase leading-none dark:brightness-[1.3]',
        md ? '-rotate-2 px-2.5 py-1 text-[11px] tracking-wide' : '-rotate-1 px-1.5 py-0.5 text-[9.5px]',
      )}
      style={{
        color: m.color,
        borderColor: m.color,
        boxShadow: `inset 0 0 0 1.5px ${m.color}22, 0 0 0 1.5px ${m.color}14`,
        backgroundColor: `${m.color}0d`,
      }}
      title={`حالة الاشتراك: ${m.label}`}
    >
      {m.label}
    </span>
  )
}

/** ── خط الحياة — شريط جانت للإشتراك: البداية ← اليوم ← النهاية ── */
function LifeLine({ row }: { row: SubRow }) {
  const start = new Date(row.startDate).getTime()
  const end = new Date(row.endDate).getTime()
  const now = Date.now()
  const total = Math.max(end - start, 1)
  const elapsed = Math.min(Math.max((now - start) / total, 0), 1)
  const dead = row.status === 'expired' || row.status === 'cancelled'
  const dLeft = Math.floor(daysUntil(row.endDate))
  const endingSoon = !dead && dLeft <= 7

  const fill = dead ? '#94a3b8' : dLeft <= 3 ? '#e11d48' : endingSoon ? '#f59e0b' : '#14b8a6'
  const hollow = row.status === 'cancelled'
  const cancelled = row.status === 'cancelled'

  return (
    <div className="w-[190px]">
      {/* الشريط */}
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-slow', hollow && 'opacity-40')}
          style={{ width: `${dead ? 100 : elapsed * 100}%`, backgroundColor: fill }}
        />
        {/* علامة "اليوم" */}
        {!dead && elapsed < 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-hidden
                className="absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-foreground/70 ring-2 ring-card"
                style={{ right: `${elapsed * 100}%` }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">اليوم</TooltipContent>
          </Tooltip>
        )}
        {/* سنون انتهى/أوقف */}
        {dead && (
          <span className="absolute inset-0 flex items-center justify-end pe-1">
            <span className="text-[8px] font-black tabular-nums text-background/90">
              {cancelled ? 'أوقف' : 'انتهى'}
            </span>
          </span>
        )}
      </div>
      {/* التسميات */}
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] leading-none">
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatShortDate(row.startDate)}
        </span>
        <span
          className="truncate text-center font-bold tabular-nums"
          style={{ color: fill }}
          title={row.paymentNote ?? undefined}
        >
          {dead
            ? cancelled
              ? 'أوقف يدوياً'
              : dLeft < 0
                ? `منذ ${num(Math.abs(dLeft))} يوم`
                : 'اليوم'
            : `${num(dLeft)} يوم متبقي`}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatShortDate(row.endDate)}
        </span>
      </div>
    </div>
  )
}

/** ── وسم الباقة — مستطيل حاد بنقطة لون ── */
function PlanTag({ code, name }: { code: string; name: string }) {
  const color = planColor(code)
  return (
    <span
      className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] font-bold"
      style={{ backgroundColor: `${color}12`, color, borderColor: `${color}2e` }}
      title={name}
    >
      <i className="size-1.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** ── وسم الفترة — شهري/سنوي/تجريبي بشكل تذكرة صغيرة ── */
function PeriodTag({ period }: { period: string }) {
  const cfg: Record<string, string> = {
    monthly: 'border-teal-600/25 bg-teal-600/8 text-teal-700 dark:text-teal-300',
    yearly: 'border-cyan-600/25 bg-cyan-600/8 text-cyan-700 dark:text-cyan-300',
    trial: 'border-amber-600/25 bg-amber-600/10 text-amber-700 dark:text-amber-300',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold',
        cfg[period] ?? 'border-border bg-muted text-muted-foreground',
      )}
    >
      <CalendarDays className="size-2.5" strokeWidth={2.5} />
      {PERIOD_LABEL[period] ?? period}
    </span>
  )
}

/** ── شريحة طريقة الدفع ── */
function MethodChip({ method }: { method: string | null }) {
  const m = methodMeta(method)
  if (!m) return <span className="text-xs text-muted-foreground">—</span>
  const Icon = m.icon
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-2 py-1 text-[11px] font-semibold text-foreground/85">
      <Icon className="size-3.5 text-teal-600 dark:text-teal-400" strokeWidth={2.2} />
      {m.label}
    </span>
  )
}

/** ── رسم مصغّر (Sparkline) لإيراد آخر ٦ شهور — SVG بدون مكتبات ── */
function RevenueSparkline({ series }: { series: number[] }) {
  const W = 132
  const H = 44
  const PAD = 4
  const max = Math.max(...series, 1)
  const n = Math.max(series.length, 2)
  const step = (W - PAD * 2) / (n - 1)
  const pts = series.map((v, i) => {
    const x = PAD + i * step
    const y = H - PAD - (v / max) * (H - PAD * 2 - 4)
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${(W - PAD).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`
  const last = pts[pts.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-11 w-[132px] shrink-0"
      role="img"
      aria-label="اتجاه الإيراد في آخر ٦ شهور"
    >
      <defs>
        <linearGradient id="subspark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="subspark-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#a5f3fc" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#subspark-fill)" />
      <path d={line} fill="none" stroke="url(#subspark-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="3.4" fill="#a5f3fc" opacity="0.25" />
          <circle cx={last[0]} cy={last[1]} r="1.9" fill="#e0fdfa" stroke="#2dd4bf" strokeWidth="1.2" />
        </>
      )}
    </svg>
  )
}

/** ── خط التثقيب — سطر دائري صغير زي خط قطع الإيصال ── */
function Perforation({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('h-1.5 w-full', className)}
      style={{
        backgroundImage: 'radial-gradient(circle, var(--border) 1.4px, transparent 1.6px)',
        backgroundSize: '9px 6px',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'center',
        opacity: 0.85,
      }}
    />
  )
}

/** ── تبويب فلتر حاد بخط علوي ملوّن (مختلف عن أقراص المحلات) ── */
function FilterTab({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all duration-200',
        active
          ? 'border-transparent bg-foreground text-background shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
    >
      {active && color && (
        <span
          aria-hidden
          className="absolute inset-x-2.5 top-0 h-[2.5px] -translate-y-px rounded-b-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
      {count !== undefined && (
        <span className={cn('ms-1 tabular-nums', active ? 'opacity-75' : 'opacity-60')}>
          {num(count)}
        </span>
      )}
    </button>
  )
}

/* ═══════════════════ العرض الرئيسي ═══════════════════ */

export function AdminSubscriptionsView() {
  const [rows, setRows] = React.useState<SubRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [planFilter, setPlanFilter] = React.useState('all')
  const [methodFilter, setMethodFilter] = React.useState('all')
  const [sortKey, setSortKey] = React.useState('newest')

  const [plans, setPlans] = React.useState<PlanLite[]>([])
  const [addOpen, setAddOpen] = React.useState(false)
  const [extendRow, setExtendRow] = React.useState<SubRow | null>(null)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [busyId, setBusyId] = React.useState<number | null>(null)

  /* ── تحميل كل الاشتراكات (فلترة فورية على العميل) ── */
  const load = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await api<{ items: SubRow[] }>(`/api/admin/subscriptions`)
      setRows(data.items ?? [])
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الاشتراكات')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadPlans = React.useCallback(async () => {
    try {
      const data = await api<{ items: PlanLite[] }>('/api/admin/plans')
      setPlans(data.items ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    loadPlans()
  }, [loadPlans])

  /* ── الإحصاءات المستخلصة من البيانات الكاملة ── */
  const stats = React.useMemo(() => {
    const counts = { active: 0, trial: 0, expired: 0, cancelled: 0, grace: 0 }
    let totalCollected = 0
    let txCount = 0
    let expiringSoon = 0
    let newThisMonth = 0
    const methodCount: Record<string, number> = {}
    const now = new Date()

    // سلسلة آخر ٦ شهور
    const series: { label: string; sum: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      series.push({ label: AR_MONTHS_SHORT[d.getMonth()], sum: 0 })
    }

    for (const r of rows) {
      if (r.status === 'active' && r.period === 'trial') counts.trial++
      else if (r.status === 'active') counts.active++
      else if (r.status === 'expired') counts.expired++
      else if (r.status === 'cancelled') counts.cancelled++
      else if (r.status === 'grace') counts.grace++

      totalCollected += r.amountPaid || 0
      if (r.amountPaid > 0) txCount++
      if (r.paymentMethod) methodCount[r.paymentMethod] = (methodCount[r.paymentMethod] ?? 0) + 1

      if (r.status === 'active') {
        const dLeft = daysUntil(r.endDate)
        if (dLeft >= 0 && dLeft <= 7) expiringSoon++
      }
      const created = new Date(r.createdAt)
      if (
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth()
      ) {
        newThisMonth++
        series[5].sum += r.amountPaid || 0
      } else {
        // شهور سابقة
        for (let k = 0; k < 5; k++) {
          const ref = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1)
          if (created.getFullYear() === ref.getFullYear() && created.getMonth() === ref.getMonth()) {
            series[k].sum += r.amountPaid || 0
            break
          }
        }
      }
    }

    const thisMonth = series[5]?.sum ?? 0
    const avgValue = txCount > 0 ? totalCollected / txCount : 0
    const topMethod = Object.entries(methodCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return {
      counts,
      total: rows.length,
      totalCollected,
      thisMonth,
      avgValue,
      txCount,
      expiringSoon,
      newThisMonth,
      spark: series.map((s) => s.sum),
      sparkLabels: series.map((s) => s.label),
      topMethod,
    }
  }, [rows])

  /* ── الترشيح والترتيب (فوري) ── */
  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rows.filter((r) => {
      if (statusFilter === 'active') {
        if (!(r.status === 'active' && r.period !== 'trial')) return false
      } else if (statusFilter === 'trial') {
        if (!(r.status === 'active' && r.period === 'trial')) return false
      } else if (statusFilter === 'expiring') {
        const dLeft = daysUntil(r.endDate)
        if (!(r.status === 'active' && dLeft >= 0 && dLeft <= 7)) return false
      } else if (statusFilter !== 'all') {
        if (r.status !== statusFilter) return false
      }
      if (planFilter !== 'all' && r.planId !== Number(planFilter)) return false
      if (methodFilter !== 'all' && (r.paymentMethod ?? 'none') !== methodFilter) return false
      if (q) {
        const hay = `${r.shopName} ${r.planName} ${r.paymentNote ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    list = [...list]
    switch (sortKey) {
      case 'oldest':
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        break
      case 'ending':
        list.sort((a, b) => {
          const aAlive = a.status === 'active' ? 0 : 1
          const bAlive = b.status === 'active' ? 0 : 1
          if (aAlive !== bAlive) return aAlive - bAlive
          return a.endDate.localeCompare(b.endDate)
        })
        break
      case 'amount':
        list.sort((a, b) => b.amountPaid - a.amountPaid)
        break
      case 'shop':
        list.sort((a, b) => a.shopName.localeCompare(b.shopName, 'ar'))
        break
      default:
        // newest — ترتيب السيرفر الافتراضي (createdAt desc)
        break
    }
    return list
  }, [rows, search, statusFilter, planFilter, methodFilter, sortKey])

  const shownValue = React.useMemo(
    () => shown.reduce((s, r) => s + (r.amountPaid || 0), 0),
    [shown],
  )

  const noData = loading && rows.length === 0
  const hasActiveFilters =
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    planFilter !== 'all' ||
    methodFilter !== 'all' ||
    sortKey !== 'newest'

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setPlanFilter('all')
    setMethodFilter('all')
    setSortKey('newest')
  }

  /* ── الإجراءات (نفس عقود الـ API الأصلية) ── */
  const handlePause = async (row: SubRow) => {
    setBusyId(row.id)
    try {
      await api(`/api/admin/subscriptions/${row.id}`, {
        method: 'PUT',
        body: { action: 'status', status: 'cancelled' },
      })
      toast.success('تم إيقاف الاشتراك')
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإيقاف')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setBusyId(deleteId)
    try {
      await api(`/api/admin/subscriptions/${deleteId}`, { method: 'DELETE' })
      toast.success('تم إلغاء الاشتراك')
      setDeleteId(null)
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setBusyId(null)
    }
  }

  const deleteRow = rows.find((r) => r.id === deleteId)

  /* ═══════════════════ التصيير ═══════════════════ */

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═══ 1. لافتة "الخزنة" — داكنة تركواز بنقش خطوط البانكنوت ═══ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border border-teal-800/60 bg-gradient-to-br from-teal-950 via-teal-900 to-teal-800 text-teal-50 shadow-lg shadow-teal-950/20 dark:border-teal-700/40 dark:shadow-none">
        {/* نقش الجيوشيه — خطوط متقاطعة زي ورق البانكنوت */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 9px), repeating-linear-gradient(-115deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 13px)',
          }}
        />
        {/* توهج تركوازي */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(560px 220px at 12% -10%, rgba(45,212,191,0.18), transparent), radial-gradient(420px 200px at 100% 110%, rgba(6,182,212,0.12), transparent)',
          }}
        />
        {/* علامة مائية — أيقونة إيصال */}
        <ReceiptText
          aria-hidden
          strokeWidth={0.8}
          className="pointer-events-none absolute -bottom-8 -start-10 size-44 text-white/[0.05]"
        />

        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5 p-4 sm:p-6">
          {/* العنوان + الرقم الكبير */}
          <div className="w-full min-w-0 sm:w-auto sm:min-w-[230px]">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-teal-100 shadow-inner backdrop-blur-sm">
                <ReceiptText className="size-[18px]" strokeWidth={2.2} />
              </span>
              <div>
                <h1 className="text-lg font-extrabold leading-tight">الاشتراكات</h1>
                <p className="text-[11px] text-teal-200/85">سجلّ الدورة المالية — كل جنيه محصّل موثّق</p>
              </div>
            </div>

            <p className="mt-3 text-[11px] font-medium text-teal-200/85 sm:mt-4">إجمالي المحصّل من الاشتراكات</p>
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-l from-teal-200 to-cyan-100 bg-clip-text text-4xl font-extrabold tracking-tight tabular-nums text-transparent sm:text-5xl">
                {noData ? '—' : num(stats.totalCollected)}
              </span>
              <span className="text-sm font-semibold text-teal-200/90 sm:text-base">جنيه</span>
            </div>

            {/* التنبيهات — شرائح فروستن قابلة للنقر */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.expiringSoon > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('expiring')}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-400/15 px-2.5 py-1 text-[10.5px] font-bold text-rose-200 backdrop-blur-sm transition-colors hover:bg-rose-400/25"
                >
                  <AlertTriangle className="size-3" />
                  {num(stats.expiringSoon)} ينتهي خلال ٧ أيام
                </button>
              )}
              {stats.counts.trial > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('trial')}
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-1 text-[10.5px] font-bold text-cyan-200 backdrop-blur-sm transition-colors hover:bg-cyan-400/25"
                >
                  <FlaskConical className="size-3" />
                  {num(stats.counts.trial)} تجربة جارية
                </button>
              )}
              {stats.newThisMonth > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-300/30 bg-teal-400/10 px-2.5 py-1 text-[10.5px] font-bold text-teal-200 backdrop-blur-sm">
                  <TrendingUp className="size-3" />
                  {num(stats.newThisMonth)} اشتراك جديد هذا الشهر
                </span>
              )}
            </div>
          </div>

          {/* نبض الإيراد — sparkline + شرائح */}
          <div className="order-3 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1 sm:min-w-[260px]">
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-3.5 backdrop-blur-md sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-teal-100">
                  <TrendingUp className="size-3.5 text-teal-300" />
                  نبض الإيراد
                </h3>
                <span className="font-mono text-[10px] tabular-nums text-teal-200/75">
                  {stats.sparkLabels[0]} ← {stats.sparkLabels[stats.sparkLabels.length - 1]}
                </span>
              </div>

              <div className="mt-2 flex items-end justify-between gap-3">
                {noData ? (
                  <Skeleton className="h-11 w-[132px] bg-white/10" />
                ) : (
                  <RevenueSparkline series={stats.spark} />
                )}
                <div className="flex flex-col items-end gap-1 text-left">
                  <span className="text-[10px] font-medium text-teal-200/80">هذا الشهر</span>
                  <span className="text-base font-extrabold tabular-nums text-teal-100">
                    {noData ? '—' : num(stats.thisMonth)}
                    <span className="ms-1 text-[10px] font-semibold text-teal-200/70">جنيه</span>
                  </span>
                </div>
              </div>

              {/* شرائح فروستن */}
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <div className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                  <p className="text-[9.5px] text-teal-200/80">متوسط قيمة الاشتراك</p>
                  <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-teal-50">
                    {noData ? '—' : num(Math.round(stats.avgValue))}
                    <span className="ms-1 text-[9px] font-medium text-teal-200/75">جنيه</span>
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                  <p className="text-[9.5px] text-teal-200/80">عمليات محصّلة</p>
                  <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-teal-50">
                    {noData ? '—' : num(stats.txCount)}
                    <span className="ms-1 text-[9px] font-medium text-teal-200/75">عملية</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* الأزرار — فروستن بيضاء على الداكن */}
          <div className="order-2 ml-auto flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
            <Button
              size="lg"
              onClick={() => setAddOpen(true)}
              className="gap-1.5 border border-white/40 bg-white text-teal-950 shadow-md hover:bg-teal-50 hover:shadow-lg dark:border-teal-300/40 dark:bg-teal-400/15 dark:text-teal-100 dark:hover:bg-teal-400/25 dark:hover:shadow-teal-500/10"
            >
              <Plus className="size-4" strokeWidth={2.6} />
              إصدار اشتراك
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => load(true)}
              disabled={refreshing}
              className="gap-1.5 border border-white/20 bg-white/10 text-teal-50 backdrop-blur-sm hover:bg-white/20"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              تحديث
            </Button>
          </div>
        </div>
      </section>

      {/* ═══ 1.٥ سجل تغييرات الباقات + المستحقات (2026-10-10 — Plan Control) ═══ */}
      <PlanChangeLogPanel />

      {/* ═══ 2. شريط "الإيصال" — إحصاءات بحواف مثقّبة وفواصل متقطّعة ═══ */}
      <section className="animate-in-up stagger-1 relative">
        <div className="rounded-2xl border bg-card shadow-sm">
          <Perforation className="rounded-t-2xl" />

          {noData ? (
            <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-border lg:grid-cols-4 lg:divide-x lg:divide-dashed">
              <ReceiptStat
                label="اشتراكات نشطة"
                value={num(stats.counts.active)}
                unit="اشتراك"
                color="#0d9488"
                share={stats.total > 0 ? (stats.counts.active / stats.total) * 100 : 0}
                hint={stats.expiringSoon > 0 ? `${num(stats.expiringSoon)} منها ينتهي قريباً` : 'كلها بحالة جيدة'}
              />
              <ReceiptStat
                label="تجارب جارية"
                value={num(stats.counts.trial)}
                unit="تجربة"
                color="#0891b2"
                share={stats.total > 0 ? (stats.counts.trial / stats.total) * 100 : 0}
                hint={stats.counts.trial > 0 ? 'مصيرها يتقرر قريباً' : 'لا توجد تجارب حالياً'}
              />
              <ReceiptStat
                label="منتهية"
                value={num(stats.counts.expired)}
                unit="اشتراك"
                color="#e11d48"
                share={stats.total > 0 ? (stats.counts.expired / stats.total) * 100 : 0}
                hint={stats.counts.expired > 0 ? 'فرص تجديد ضائعة — تابعها' : 'لا يوجد اشتراكات منتهية'}
              />
              <ReceiptStat
                label="ملغاة"
                value={num(stats.counts.cancelled)}
                unit="اشتراك"
                color="#64748b"
                share={stats.total > 0 ? (stats.counts.cancelled / stats.total) * 100 : 0}
                hint={stats.counts.grace > 0 ? `+ ${num(stats.counts.grace)} في فترة سماح` : 'أوقفت يدوياً'}
              />
            </div>
          )}

          {/* صف الإجمالي — زي آخر سطر في الإيصال */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed px-4 py-2.5 sm:px-6">
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              <span className="font-bold text-foreground">{noData ? '—' : num(stats.total)}</span>
              {' اشتراك مسجّل في الدفتر · محصّل '}
              <span className="font-bold text-teal-700 dark:text-teal-300">
                {noData ? '—' : `${num(stats.totalCollected)} جنيه`}
              </span>
            </p>
            {stats.topMethod && (
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-muted-foreground">
                <BadgeCheck className="size-3.5 text-teal-600 dark:text-teal-400" />
                الأكثر استخداماً:
                <span className="text-foreground">
                  {methodMeta(stats.topMethod)?.label ?? stats.topMethod}
                </span>
              </span>
            )}
          </div>

          <Perforation className="rounded-b-2xl" />
        </div>
      </section>

      {/* ═══ 3. لوحة القيادة — بحث + تبويبات + مرشّحات ═══ */}
      <div className="animate-in-up stagger-2 space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        {/* البحث + العدّاد */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم المحل أو الباقة أو ملاحظة الدفع…"
              className="rounded-xl bg-background ps-9 font-normal"
              aria-label="بحث في الاشتراكات"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="مسح البحث"
                className="absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <span
            aria-live="polite"
            className="flex h-9 items-center rounded-lg border border-dashed bg-background px-2.5 font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
          >
            {loading ? '…' : `${num(shown.length)} / ${num(rows.length)}`}
          </span>

          <div className="hidden items-center gap-1.5 text-[10.5px] text-muted-foreground sm:flex">
            <ArrowUpDown className="size-3.5" />
            ترتيب:
          </div>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-full rounded-xl sm:w-[150px]" aria-label="الترتيب">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">الأحدث إصداراً</SelectItem>
              <SelectItem value="oldest">الأقدم إصداراً</SelectItem>
              <SelectItem value="ending">الأقرب انتهاءً</SelectItem>
              <SelectItem value="amount">الأعلى قيمة</SelectItem>
              <SelectItem value="shop">اسم المحل (أ → ي)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* تبويبات الحالة — شكل حاد بخط علوي */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterTab active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="الكل" count={stats.total} />
          <FilterTab
            active={statusFilter === 'active'}
            onClick={() => setStatusFilter('active')}
            label="نشط"
            count={stats.counts.active}
            color="#0d9488"
          />
          <FilterTab
            active={statusFilter === 'trial'}
            onClick={() => setStatusFilter('trial')}
            label="تجريبي"
            count={stats.counts.trial}
            color="#0891b2"
          />
          <FilterTab
            active={statusFilter === 'expiring'}
            onClick={() => setStatusFilter('expiring')}
            label="ينتهي قريباً"
            count={stats.expiringSoon}
            color="#f59e0b"
          />
          <FilterTab
            active={statusFilter === 'expired'}
            onClick={() => setStatusFilter('expired')}
            label="منتهي"
            count={stats.counts.expired}
            color="#e11d48"
          />
          <FilterTab
            active={statusFilter === 'cancelled'}
            onClick={() => setStatusFilter('cancelled')}
            label="ملغي"
            count={stats.counts.cancelled}
            color="#64748b"
          />

          <div className="ms-auto flex w-full items-center gap-2 sm:w-auto">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-full rounded-xl sm:w-[150px]" aria-label="فلتر الباقة">
                <SelectValue placeholder="كل الباقات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الباقات</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full rounded-xl sm:w-[140px]" aria-label="فلتر طريقة الدفع">
                <SelectValue placeholder="كل طرق الدفع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل طرق الدفع</SelectItem>
                {Object.entries(METHOD_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ملخص الفلاتر النشطة */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-2.5">
            <span className="text-[10.5px] font-semibold text-muted-foreground">مطبّق الآن:</span>
            {search.trim() && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-1 rounded-md border border-teal-600/25 bg-teal-600/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-teal-700 dark:text-teal-300"
              >
                «{search.trim()}»
                <X className="size-3" />
              </button>
            )}
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
              >
                {statusFilter === 'expiring' ? 'ينتهي قريباً' : statusMeta(statusFilter === 'trial' ? 'active' : statusFilter).label}
                {statusFilter === 'trial' ? ' (تجريبي)' : ''}
                <X className="size-3" />
              </button>
            )}
            {planFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setPlanFilter('all')}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
              >
                {plans.find((p) => p.id.toString() === planFilter)?.name ?? 'باقة'}
                <X className="size-3" />
              </button>
            )}
            {methodFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setMethodFilter('all')}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
              >
                {methodMeta(methodFilter)?.label ?? methodFilter}
                <X className="size-3" />
              </button>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="ms-auto text-[10.5px] font-bold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
            >
              إعادة تعيين الكل
            </button>
          </div>
        )}
      </div>

      {/* ═══ 4. جدول الدفتر (lg+) ═══ */}
      {loading ? (
        <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyLedger onAdd={() => setAddOpen(true)} />
      ) : shown.length === 0 ? (
        <EmptyLedger filtered onReset={resetFilters} />
      ) : (
        <>
          {/* الجدول — سطح المكتب */}
          <div className="animate-in-up stagger-3 hidden overflow-hidden rounded-2xl border bg-card shadow-sm lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[64px] text-center font-mono text-[10px] uppercase tracking-wider">
                      #
                    </TableHead>
                    <TableHead className="w-[210px]">المحل</TableHead>
                    <TableHead className="w-[175px]">الباقة والفترة</TableHead>
                    <TableHead className="w-[205px]">خط الحياة</TableHead>
                    <TableHead className="w-[115px]">المبلغ</TableHead>
                    <TableHead className="w-[140px]">الدفع</TableHead>
                    <TableHead className="w-[100px]">الحالة</TableHead>
                    <TableHead className="w-[130px] text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r, i) => (
                    <TableRow
                      key={r.id}
                      className="animate-in-up border-border/60 transition-colors hover:bg-teal-50/60 dark:hover:bg-teal-950/25"
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    >
                      {/* رقم القيد */}
                      <TableCell className="py-2.5 text-center">
                        <span className="font-mono text-[11px] font-bold tabular-nums text-muted-foreground/80">
                          {String(i + 1).padStart(3, '0')}
                        </span>
                      </TableCell>

                      {/* المحل */}
                      <TableCell className="py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold leading-tight">{r.shopName}</p>
                          <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-muted-foreground/80" dir="ltr">
                            ID ·{r.tenantId.slice(-6)}
                          </p>
                        </div>
                      </TableCell>

                      {/* الباقة + الفترة */}
                      <TableCell className="py-2.5">
                        <div className="flex flex-col items-start gap-1.5">
                          <PlanTag code={r.planCode} name={r.planName} />
                          <PeriodTag period={r.period} />
                        </div>
                      </TableCell>

                      {/* خط الحياة */}
                      <TableCell className="py-2.5">
                        <LifeLine row={r} />
                      </TableCell>

                      {/* المبلغ */}
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              'font-mono text-[13px] font-extrabold tabular-nums',
                              r.amountPaid > 0
                                ? 'text-teal-700 dark:text-teal-300'
                                : 'text-muted-foreground/60',
                            )}
                          >
                            {num(r.amountPaid)}
                          </span>
                          {r.amountPaid > 0 && (
                            <span className="text-[9px] font-semibold text-muted-foreground">جنيه</span>
                          )}
                          {r.paymentNote && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="grid size-5 cursor-help place-items-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground">
                                  <Info className="size-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-52 text-[11px]">
                                {r.paymentNote}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>

                      {/* طريقة الدفع */}
                      <TableCell className="py-2.5">
                        <MethodChip method={r.paymentMethod} />
                      </TableCell>

                      {/* الحالة — ختم */}
                      <TableCell className="py-2.5">
                        <StampBadge row={r} />
                      </TableCell>

                      {/* الإجراءات */}
                      <TableCell className="py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          {busyId === r.id ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 text-teal-600 hover:bg-teal-600/10 hover:text-teal-700 dark:text-teal-400"
                                    onClick={() => setExtendRow(r)}
                                    aria-label="تمديد الاشتراك"
                                  >
                                    <CalendarPlus className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[11px]">تمديد الاشتراك</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 text-amber-600 hover:bg-amber-600/10 hover:text-amber-700 dark:text-amber-400"
                                    onClick={() => handlePause(r)}
                                    aria-label="إيقاف الاشتراك"
                                  >
                                    <Pause className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[11px]">إيقاف مؤقت</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 text-rose-600 hover:bg-rose-600/10 hover:text-rose-700 dark:text-rose-400"
                                    onClick={() => setDeleteId(r.id)}
                                    aria-label="إلغاء الاشتراك"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[11px]">إلغاء الاشتراك</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* ذيل الجدول — سطر مجموع الإيصال */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed bg-muted/20 px-4 py-2.5">
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                إظهار <span className="font-bold text-foreground">{num(shown.length)}</span> من{' '}
                {num(rows.length)} قيد
              </p>
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                قيمة المعروض:{' '}
                <span className="font-bold text-teal-700 dark:text-teal-300">{num(shownValue)} جنيه</span>
              </p>
            </div>
          </div>

          {/* بطاقات الإيصال — تحت lg */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {shown.map((r, i) => (
              <div
                key={r.id}
                className="animate-in-up rounded-2xl border bg-card p-3.5 shadow-sm"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground/80">
                        #{String(i + 1).padStart(3, '0')}
                      </span>
                      <p className="truncate text-sm font-bold leading-tight">{r.shopName}</p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <PlanTag code={r.planCode} name={r.planName} />
                      <PeriodTag period={r.period} />
                    </div>
                  </div>
                  <StampBadge row={r} size="sm" />
                </div>

                <div className="mt-3">
                  <LifeLine row={r} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-dashed pt-2.5 text-center">
                  <div>
                    <p className="text-[9.5px] text-muted-foreground">البداية</p>
                    <p className="mt-0.5 text-[11px] font-semibold tabular-nums">
                      {formatShortDate(r.startDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9.5px] text-muted-foreground">النهاية</p>
                    <p className="mt-0.5 text-[11px] font-semibold tabular-nums">
                      {formatShortDate(r.endDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9.5px] text-muted-foreground">المبلغ</p>
                    <p
                      className={cn(
                        'mt-0.5 font-mono text-[11px] font-extrabold tabular-nums',
                        r.amountPaid > 0 ? 'text-teal-700 dark:text-teal-300' : 'text-muted-foreground/60',
                      )}
                    >
                      {num(r.amountPaid)} ج
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed pt-2.5">
                  <MethodChip method={r.paymentMethod} />
                  <div className="flex items-center gap-1">
                    {busyId === r.id ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-teal-600 hover:bg-teal-600/10 dark:text-teal-400"
                          onClick={() => setExtendRow(r)}
                          aria-label="تمديد الاشتراك"
                        >
                          <CalendarPlus className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-amber-600 hover:bg-amber-600/10 dark:text-amber-400"
                          onClick={() => handlePause(r)}
                          aria-label="إيقاف الاشتراك"
                        >
                          <Pause className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-rose-600 hover:bg-rose-600/10 dark:text-rose-400"
                          onClick={() => setDeleteId(r.id)}
                          aria-label="إلغاء الاشتراك"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* ذيل البطاقات */}
            <p className="pb-1 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
              إظهار {num(shown.length)} من {num(rows.length)} قيد · قيمة {num(shownValue)} جنيه
            </p>
          </div>
        </>
      )}

      {/* ═══ 5. دايلوج التمديد ═══ */}
      {extendRow && (
        <ExtendDialog
          row={extendRow}
          open={!!extendRow}
          onOpenChange={(o) => !o && setExtendRow(null)}
          onSaved={() => load(true)}
        />
      )}

      {/* ═══ 6. دايلوج إصدار اشتراك ═══ */}
      <AddSubscriptionDialog
        plans={plans}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => load(true)}
      />

      {/* ═══ 7. تأكيد الإلغاء ═══ */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex size-11 items-center justify-center self-start rounded-xl border-2 border-rose-500/30 bg-rose-500/10">
              <Trash2 className="size-5 text-rose-600 dark:text-rose-400" />
            </div>
            <AlertDialogTitle className="text-start">إلغاء الاشتراك</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              اشتراك <b>{deleteRow?.shopName ?? ''}</b> —{' '}
              {deleteRow ? `${deleteRow.planName} (${PERIOD_LABEL[deleteRow.period] ?? deleteRow.period})` : ''}
              <br />
              سيوضع الاشتراك كـ«ملغي» ولن يُحذف فعلياً من الدفتر، ويمكن إصدار اشتراك جديد للمحل في أي وقت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="gap-1.5 border border-rose-500/30 bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-sm hover:from-rose-400 hover:to-rose-500"
            >
              {busyId === deleteId && <Loader2 className="size-4 animate-spin" />}
              نعم، ألغِ الاشتراك
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ═══════════════════ مكوّنات فرعية ═══════════════════ */

/** خانة إحصاء داخل شريط الإيصال — فواصل متقطّعة وأرقام monospace */
function ReceiptStat({
  label,
  value,
  unit,
  color,
  share,
  hint,
}: {
  label: string
  value: string
  unit: string
  color: string
  share: number
  hint: string
}) {
  return (
    <div className="relative overflow-hidden p-4 sm:px-5 sm:py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <i className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums" style={{ color }}>
        {value}
        <span className="ms-1 text-[10px] font-medium text-muted-foreground">{unit}</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-slow"
            style={{ width: `${Math.min(100, Math.max(share, 2))}%`, backgroundColor: color }}
          />
        </div>
        <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
          {Math.round(share)}%
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  )
}

/** حالة فراغ الدفتر */
function EmptyLedger({
  filtered,
  onReset,
  onAdd,
}: {
  filtered?: boolean
  onReset?: () => void
  onAdd?: () => void
}) {
  return (
    <div className="animate-in-up rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl border-2 border-dashed border-border text-muted-foreground/50">
        <ReceiptText className="size-7" strokeWidth={1.5} />
      </div>
      <p className="mt-4 text-sm font-bold">
        {filtered ? 'لا توجد قيود مطابقة لبحثك' : 'الدفتر فاضي لسه'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {filtered
          ? 'جرّب تغيير الفلاتر أو مسح البحث لعرض كل الاشتراكات'
          : 'أصدر أول اشتراك لمحل من زر «إصدار اشتراك» فوق'}
      </p>
      {(onReset || onAdd) && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5 rounded-xl border-teal-600/30 text-teal-700 hover:bg-teal-600/10 dark:text-teal-300"
          onClick={filtered ? onReset : onAdd}
        >
          {filtered ? <><X className="size-3.5" /> مسح الفلاتر</> : <><Plus className="size-3.5" /> إصدار اشتراك</>}
        </Button>
      )}
    </div>
  )
}

/* ═══════════════════ دايلوج التمديد ═══════════════════ */

function ExtendDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: SubRow
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [period, setPeriod] = React.useState<'monthly' | 'yearly'>('monthly')
  const [amountPaid, setAmountPaid] = React.useState('')
  const [paymentMethod, setPaymentMethod] = React.useState('manual')
  const [saving, setSaving] = React.useState(false)

  const days = period === 'monthly' ? 30 : 365
  const oldEnd = new Date(row.endDate)
  const newEnd = new Date(oldEnd)
  newEnd.setDate(newEnd.getDate() + days)

  const save = async () => {
    setSaving(true)
    try {
      await api(`/api/admin/subscriptions/${row.id}`, {
        method: 'PUT',
        body: {
          action: 'extend',
          period,
          amountPaid: amountPaid ? Number(amountPaid) : undefined,
          paymentMethod,
        },
      })
      toast.success('تم تمديد الاشتراك')
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التمديد')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg border border-teal-600/25 bg-teal-600/10 text-teal-700 dark:text-teal-300">
              <CalendarPlus className="size-4" />
            </span>
            تمديد الاشتراك
          </DialogTitle>
          <DialogDescription>
            {row.shopName} — {row.planName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* الخط الزمني للتمديد */}
          <div className="rounded-xl border border-dashed bg-muted/30 p-3">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {/* الجزء المنقضي */}
              <div
                className="h-full bg-teal-600/60"
                style={{ width: '55%' }}
                aria-hidden
              />
              {/* التمديد — جزء متقطّع */}
              <div
                className="h-full flex-1"
                style={{
                  backgroundImage: `repeating-linear-gradient(60deg, #14b8a6 0 6px, #14b8a633 6px 12px)`,
                }}
                aria-hidden
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
              <span>اليوم</span>
              <span className="font-bold text-teal-700 dark:text-teal-300">
                نهاية جديدة: {formatArabicDate(newEnd)}
              </span>
            </div>
            <p className="mt-2 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatArabicDate(oldEnd)}
              <span className="mx-1.5 font-bold text-teal-600 dark:text-teal-400">← (+{days} يوم) ←</span>
              {formatArabicDate(newEnd)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>الفترة</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['monthly', 'شهر (٣٠ يوم)'],
                  ['yearly', 'سنة (٣٦٥ يوم)'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPeriod(v)}
                  aria-pressed={period === v}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-xs font-bold transition-all',
                    period === v
                      ? 'border-teal-600/40 bg-teal-600/10 text-teal-700 shadow-sm dark:text-teal-300'
                      : 'border-border bg-background text-muted-foreground hover:border-teal-600/30',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المبلغ المدفوع</Label>
              <Input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="افتراضي من الباقة"
                dir="ltr"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>طريقة الدفع</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">كاش</SelectItem>
                  <SelectItem value="vodafone_cash">محفظة إلكترونية</SelectItem>
                  <SelectItem value="instapay">إنستا باي</SelectItem>
                  <SelectItem value="fawry">فوري</SelectItem>
                  <SelectItem value="manual">يدوي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            إلغاء
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="gap-1.5 rounded-xl border border-teal-700/30 bg-gradient-to-b from-teal-500 to-teal-700 text-white shadow-md hover:from-teal-400 hover:to-teal-600"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            <CalendarPlus className="size-4" />
            تمديد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════ دايلوج الإصدار ═══════════════════ */

interface IssuedReceipt {
  shopName: string
  planName: string
  period: string
  amountPaid: number
  endDate: string
}

function AddSubscriptionDialog({
  plans,
  open,
  onOpenChange,
  onSaved,
}: {
  plans: PlanLite[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [tenants, setTenants] = React.useState<TenantLite[]>([])
  const [tenantId, setTenantId] = React.useState('')
  const [planId, setPlanId] = React.useState('')
  const [period, setPeriod] = React.useState<'monthly' | 'yearly' | 'trial'>('monthly')
  const [amountPaid, setAmountPaid] = React.useState('')
  const [paymentMethod, setPaymentMethod] = React.useState('manual')
  const [paymentNote, setPaymentNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [issued, setIssued] = React.useState<IssuedReceipt | null>(null)

  React.useEffect(() => {
    if (open) {
      api<{ items: TenantLite[] }>(`/api/admin/tenants`)
        .then((d) => setTenants(d.items ?? []))
        .catch(() => {})
      const defaultPlan =
        plans.find((p) => p.code === 'electronics-pro') ??
        plans.find((p) => p.code === 'electronics-basic') ??
        plans.find((p) => p.code === 'pro') ??
        plans[0]
      setPlanId(defaultPlan?.id?.toString() ?? '')
      setTenantId('')
      setPeriod('monthly')
      setAmountPaid('')
      setPaymentMethod('manual')
      setPaymentNote('')
      setIssued(null)
    }
  }, [open, plans])

  const selectedPlan = plans.find((p) => p.id.toString() === planId)
  const selectedTenant = tenants.find((t) => t.id === tenantId)

  /* معاينة حية — نفس منطق السيرفر */
  const previewAmount = amountPaid
    ? Number(amountPaid) || 0
    : period === 'monthly'
      ? selectedPlan?.priceMonthly ?? 0
      : period === 'yearly'
        ? selectedPlan?.priceYearly ?? 0
        : 0
  const previewDays = period === 'monthly' ? 30 : period === 'yearly' ? 365 : selectedPlan?.trialDays || 14
  const previewEnd = new Date()
  previewEnd.setDate(previewEnd.getDate() + previewDays)

  const save = async () => {
    if (!tenantId || !planId) {
      toast.error('يرجى اختيار المحل والباقة')
      return
    }
    setSaving(true)
    try {
      const res = await api<{ ok: boolean; subscription: IssuedReceipt }>('/api/admin/subscriptions', {
        method: 'POST',
        body: {
          tenantId,
          planId: Number(planId),
          period,
          amountPaid: amountPaid ? Number(amountPaid) : undefined,
          paymentMethod,
          paymentNote,
        },
      })
      toast.success('تم إصدار الاشتراك')
      setIssued(res.subscription)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإصدار')
    } finally {
      setSaving(false)
    }
  }

  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) setIssued(null)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg border border-teal-600/25 bg-teal-600/10 text-teal-700 dark:text-teal-300">
              <ReceiptText className="size-4" />
            </span>
            {issued ? 'تم الإصدار' : 'إصدار اشتراك جديد'}
          </DialogTitle>
          <DialogDescription>
            {issued ? 'إيصال الاشتراك الصادر' : 'إنشاء اشتراك لمحل موجود — بمعاينة حيّة قبل التأكيد'}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          /* ── شاشة نجاح — إيصال بختم ── */
          <DialogBody>
            <div className="relative mx-auto max-w-sm rounded-2xl border bg-card p-5 text-center shadow-sm">
              <Perforation className="rounded-t-2xl" />
              <div className="py-2">
                <div className="flex items-center justify-center gap-2 text-teal-700 dark:text-teal-300">
                  <ReceiptText className="size-5" />
                  <span className="text-sm font-extrabold">إيصال اشتراك</span>
                </div>
                <div className="mt-4 space-y-2 text-start">
                  <ReceiptLine label="المحل" value={issued.shopName} bold />
                  <ReceiptLine label="الباقة" value={issued.planName} />
                  <ReceiptLine label="الفترة" value={PERIOD_LABEL[issued.period] ?? issued.period} />
                  <ReceiptLine label="ينتهي في" value={formatArabicDate(issued.endDate)} />
                </div>
                <div className="mt-3 flex items-baseline justify-between border-t border-dashed pt-3">
                  <span className="text-xs font-bold text-muted-foreground">المبلغ</span>
                  <span className="font-mono text-lg font-extrabold tabular-nums text-teal-700 dark:text-teal-300">
                    {num(issued.amountPaid)} <span className="text-[10px]">جنيه</span>
                  </span>
                </div>
                {/* الختم */}
                <div className="mt-5 flex justify-center">
                  <span className="inline-flex -rotate-6 select-none items-center gap-1.5 rounded-md border-2 border-teal-600 bg-teal-600/10 px-4 py-1.5 text-sm font-extrabold uppercase tracking-widest text-teal-700 shadow-sm dark:text-teal-300">
                    <BadgeCheck className="size-4" />
                    تم الإصدار
                  </span>
                </div>
              </div>
              <Perforation className="rounded-b-2xl" />
            </div>
          </DialogBody>
        ) : (
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
              {/* النموذج */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>المحل *</Label>
                  <Select value={tenantId} onValueChange={setTenantId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="اختر المحل" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.shopName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>الباقة *</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="اختر الباقة" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>الفترة</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['monthly', 'شهري'],
                        ['yearly', 'سنوي'],
                        ['trial', 'تجريبي'],
                      ] as const
                    ).map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setPeriod(v)}
                        aria-pressed={period === v}
                        className={cn(
                          'rounded-xl border px-2 py-2 text-xs font-bold transition-all',
                          period === v
                            ? 'border-teal-600/40 bg-teal-600/10 text-teal-700 shadow-sm dark:text-teal-300'
                            : 'border-border bg-background text-muted-foreground hover:border-teal-600/30',
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>المبلغ المدفوع</Label>
                    <Input
                      type="number"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder={`افتراضي: ${num(
                        period === 'monthly'
                          ? selectedPlan?.priceMonthly ?? 0
                          : period === 'yearly'
                            ? selectedPlan?.priceYearly ?? 0
                            : 0,
                      )}`}
                      dir="ltr"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>طريقة الدفع</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">كاش</SelectItem>
                        <SelectItem value="vodafone_cash">محفظة إلكترونية</SelectItem>
                        <SelectItem value="instapay">إنستا باي</SelectItem>
                        <SelectItem value="fawry">فوري</SelectItem>
                        <SelectItem value="manual">يدوي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>ملاحظة</Label>
                  <Textarea
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    rows={2}
                    className="rounded-xl"
                    placeholder="مثال: تم التحصيل نقداً في الفرع…"
                  />
                </div>
              </div>

              {/* المعاينة الحيّة — إيصال */}
              <div className="order-first sm:order-none">
                <div className="sticky top-0 rounded-2xl border border-dashed bg-muted/30 p-3.5">
                  <p className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    معاينة الإيصال
                  </p>
                  <div className="mt-3 space-y-2">
                    <ReceiptLine label="المحل" value={selectedTenant?.shopName ?? '—'} bold small />
                    <ReceiptLine label="الباقة" value={selectedPlan?.name ?? '—'} small />
                    <ReceiptLine label="الفترة" value={PERIOD_LABEL[period] ?? period} small />
                    <ReceiptLine label="المدة" value={`${previewDays} يوم`} small />
                    <ReceiptLine label="ينتهي في" value={formatArabicDate(previewEnd)} small />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between border-t border-dashed pt-2.5">
                    <span className="text-[10px] font-bold text-muted-foreground">الإجمالي</span>
                    <span className="font-mono text-base font-extrabold tabular-nums text-teal-700 dark:text-teal-300">
                      {num(previewAmount)} <span className="text-[9px]">جنيه</span>
                    </span>
                  </div>
                  <MethodChip method={paymentMethod} />
                  <p className="mt-1 text-center text-[9.5px] text-muted-foreground">
                    يتحدّث مع كل تغيير
                  </p>
                </div>
              </div>
            </div>
          </DialogBody>
        )}

        <DialogFooter>
          {issued ? (
            <Button
              onClick={() => close(false)}
              className="min-w-28 rounded-xl border border-teal-700/30 bg-gradient-to-b from-teal-500 to-teal-700 text-white shadow-md hover:from-teal-400 hover:to-teal-600"
            >
              تم
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)} className="rounded-xl">
                إلغاء
              </Button>
              <Button
                onClick={save}
                disabled={saving || !tenantId || !planId}
                className="gap-1.5 rounded-xl border border-teal-700/30 bg-gradient-to-b from-teal-500 to-teal-700 text-white shadow-md hover:from-teal-400 hover:to-teal-600"
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                <ReceiptText className="size-4" />
                إصدار
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** سطر في الإيصال — تسمية + قيمة بينها خط منقّط */
function ReceiptLine({
  label,
  value,
  bold,
  small,
}: {
  label: string
  value: string
  bold?: boolean
  small?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn('shrink-0 font-semibold text-muted-foreground', small ? 'text-[10px]' : 'text-xs')}>
        {label}
      </span>
      <span aria-hidden className="min-w-3 flex-1 border-b border-dotted border-border" />
      <span
        className={cn(
          'shrink-0 text-end',
          small ? 'max-w-[130px] truncate text-[10.5px]' : 'max-w-[180px] truncate text-xs',
          bold ? 'font-extrabold' : 'font-semibold',
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
