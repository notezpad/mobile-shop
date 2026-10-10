'use client'

import * as React from 'react'
import {
  Landmark,
  Printer,
  BadgeCheck,
  Coins,
  Clock,
  Ticket,
  Copy,
  Check,
  Trash2,
  Download,
  Search,
  Loader2,
  UserCog,
  Calendar,
  Sparkles,
  RefreshCw,
  TrendingUp,
  X,
  Banknote,
  ArrowUpDown,
  KeyRound,
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
import { formatCurrency, formatShortDate } from '@/lib/format'
import { toast } from 'sonner'

interface CodeRow {
  id: number
  code: string
  planId: number
  planCode: string
  planName: string
  period: string
  status: string
  createdAt: string
  redeemedAt: string | null
  tenantId: string | null
  tenantName: string | null
  notes: string | null
  durationDays: number | null
  expiresAt: string | null
  assignedTenantId: string | null
}

interface PlanLite {
  id: number
  code: string
  name: string
  priceMonthly?: number | null
  priceYearly?: number | null
}

interface TenantLite {
  id: string
  shopName: string
}

const PERIOD_LABEL: Record<string, string> = {
  monthly: 'شهري',
  yearly: 'سنوي',
  trial: 'تجريبي',
}

const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  yearly: 365,
  trial: 14,
}

const INTAGLIO: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 5px),' +
    'repeating-linear-gradient(105deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 9px)',
}

const REED_EDGE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(180deg, rgba(16,185,129,0.4) 0 3px, transparent 3px 6px)',
}

const REED_RING_GOLD: React.CSSProperties = {
  backgroundImage:
    'repeating-conic-gradient(from 0deg, #fbbf24 0deg 2.5deg, rgba(113,113,122,0.4) 2.5deg 6deg)',
}

const REED_RING_ROSE: React.CSSProperties = {
  backgroundImage:
    'repeating-conic-gradient(from 0deg, #fb7185 0deg 2.5deg, rgba(113,113,122,0.4) 2.5deg 6deg)',
}

const GOLD_FOIL =
  'bg-gradient-to-l from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent'

function isCodeExpired(r: CodeRow): boolean {
  return !!r.expiresAt && new Date(r.expiresAt) < new Date()
}

function durationOf(r: CodeRow): number {
  return r.durationDays ?? PERIOD_DAYS[r.period] ?? 0
}

function durationLabel(r: CodeRow): string {
  if (r.durationDays) return `${r.durationDays} يوم`
  return PERIOD_LABEL[r.period] ?? r.period
}

function nominalValue(
  r: CodeRow,
  prices: { monthly: number | null; yearly: number | null },
): number {
  if (r.durationDays) {
    const m = prices.monthly ?? 0
    return Math.round((m / 30) * r.durationDays)
  }
  if (r.period === 'monthly') return prices.monthly ?? 0
  if (r.period === 'yearly') return prices.yearly ?? 0
  return 0
}

function Microprint({ className }: { className?: string }) {
  const text = 'NEZAM POS • ACTIVATION CODE • قيمة اسمية مضمونة • '
  return (
    <div
      dir="ltr"
      aria-hidden
      className={cn(
        'pointer-events-none select-none overflow-hidden whitespace-nowrap font-mono uppercase',
        'text-[7px] leading-4 tracking-[0.38em] text-amber-200/20 dark:text-amber-200/20',
        className,
      )}
    >
      {text.repeat(14)}
    </div>
  )
}

function CoinMedallion({
  icon: Icon,
  value,
  label,
  sub,
  tone = 'emerald',
  delay = 0,
}: {
  icon: LucideIcon
  value: string
  label: string
  sub?: React.ReactNode
  tone?: 'emerald' | 'gold' | 'zinc' | 'rose'
  delay?: number
}) {
  const inner: Record<string, string> = {
    emerald:
      'from-emerald-50 to-emerald-100 text-emerald-700 dark:from-emerald-900 dark:to-emerald-800 dark:text-emerald-200',
    gold: 'from-amber-50 to-yellow-100 text-amber-700 dark:from-amber-900/70 dark:to-amber-800/60 dark:text-amber-200',
    zinc: 'from-zinc-50 to-zinc-100 text-zinc-600 dark:from-zinc-800 dark:to-zinc-700 dark:text-zinc-300',
    rose: 'from-rose-50 to-rose-100 text-rose-600 dark:from-rose-950 dark:to-rose-900 dark:text-rose-300',
  }
  return (
    <div
      className="animate-in-up flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        aria-hidden
        className="grid size-12 shrink-0 place-items-center rounded-full p-[3px] sm:size-14"
        style={tone === 'rose' ? REED_RING_ROSE : REED_RING_GOLD}
      >
        <span
          className={cn(
            'grid size-full place-items-center rounded-full bg-gradient-to-br',
            inner[tone],
          )}
        >
          <Icon className="size-5 sm:size-6" strokeWidth={2.2} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-black tabular-nums leading-tight text-foreground sm:text-2xl">
          {value}
        </p>
        {sub && (
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

function StatusSeal({ r }: { r: CodeRow }) {
  if (r.status === 'available' && isCodeExpired(r)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
        <Clock className="size-3" />
        منتهي الصلاحية
      </span>
    )
  }
  if (r.status === 'available') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-gradient-to-l from-amber-300 to-yellow-400 px-2.5 py-0.5 text-[11px] font-black text-emerald-950 shadow-[0_2px_8px_-2px_rgba(245,158,11,0.55)]">
        <BadgeCheck className="size-3" strokeWidth={2.6} />
        متاح
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-200/80 px-2.5 py-0.5 text-[11px] font-bold text-zinc-600 ring-1 ring-inset ring-white/40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/5">
      <Coins className="size-3" />
      مُستخدم
    </span>
  )
}

function DurationCoin({ r }: { r: CodeRow }) {
  const custom = !!r.durationDays
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'relative grid size-9 shrink-0 cursor-default place-items-center rounded-full p-[2.5px] font-mono',
            custom && 'ring-2 ring-amber-400/60',
          )}
          style={custom ? REED_RING_GOLD : undefined}
        >
          <span
            className={cn(
              'grid size-full place-items-center rounded-full text-[11px] font-black tabular-nums',
              custom
                ? 'bg-gradient-to-br from-amber-100 to-yellow-200 text-amber-800 dark:from-amber-900 dark:to-amber-800 dark:text-amber-200'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
            )}
          >
            {durationOf(r)}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {custom
          ? `مدة مخصصة — ${durationLabel(r)}`
          : `فترة ${PERIOD_LABEL[r.period] ?? r.period} — ${durationOf(r)} يوم`}
      </TooltipContent>
    </Tooltip>
  )
}

function BanknoteCodeCell({
  code,
  copied,
  onCopy,
}: {
  code: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        dir="ltr"
        className="relative inline-flex items-center gap-2 overflow-hidden rounded-lg border border-emerald-300/70 bg-gradient-to-l from-emerald-50 to-emerald-100/70 py-1 pe-2 ps-2.5 dark:border-emerald-700/60 dark:from-emerald-950 dark:to-emerald-900/70"
      >
        <span
          aria-hidden
          className="absolute inset-y-1 start-0 w-[5px] rounded-sm opacity-70 dark:opacity-60"
          style={REED_EDGE}
        />
        <span className="ps-2 font-mono text-[12.5px] font-bold tracking-[0.12em] text-emerald-900 dark:text-emerald-100">
          {code}
        </span>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onCopy}
            aria-label={`نسخ الكود ${code}`}
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-md border transition-all',
              copied
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300',
            )}
          >
            {copied ? (
              <Check className="size-3.5" strokeWidth={2.6} />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{copied ? 'تم النسخ' : 'نسخ الكود'}</TooltipContent>
      </Tooltip>
    </div>
  )
}

type StatusTab = 'all' | 'available' | 'redeemed' | 'expired'
type SortMode = 'newest' | 'oldest' | 'expiry' | 'value'

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'available', label: 'متاح' },
  { key: 'redeemed', label: 'مُستخدم' },
  { key: 'expired', label: 'منتهي الصلاحية' },
]

export function AdminCodesView() {
  const [rows, setRows] = React.useState<CodeRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [plans, setPlans] = React.useState<PlanLite[]>([])
  const [tenants, setTenants] = React.useState<TenantLite[]>([])

  const [statusTab, setStatusTab] = React.useState<StatusTab>('all')
  const [planFilter, setPlanFilter] = React.useState('all')
  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [sortMode, setSortMode] = React.useState<SortMode>('newest')

  const [genOpen, setGenOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [generated, setGenerated] = React.useState<string[] | null>(null)
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await api<{ items: CodeRow[] }>('/api/admin/codes')
      setRows(data.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الأكواد')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadPlans = React.useCallback(async () => {
    try {
      const data = await api<{ items: PlanLite[] }>('/api/admin/plans')
      setPlans(data.items)
    } catch {
      /* ignore */
    }
  }, [])

  const loadTenants = React.useCallback(async () => {
    try {
      const data = await api<{ items: TenantLite[] }>('/api/admin/tenants?status=')
      setTenants(data.items)
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
  React.useEffect(() => {
    loadTenants()
  }, [loadTenants])

  React.useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const pricesById = React.useMemo(() => {
    const m = new Map<number, { monthly: number | null; yearly: number | null }>()
    for (const p of plans)
      m.set(p.id, { monthly: p.priceMonthly ?? null, yearly: p.priceYearly ?? null })
    return m
  }, [plans])

  const valueOf = React.useCallback(
    (r: CodeRow) => nominalValue(r, pricesById.get(r.planId) ?? { monthly: null, yearly: null }),
    [pricesById],
  )

  const stats = React.useMemo(() => {
    const available = rows.filter((r) => r.status === 'available')
    const redeemed = rows.filter((r) => r.status === 'redeemed')
    const expired = available.filter(isCodeExpired)
    const availableValue = available.reduce((s, r) => s + valueOf(r), 0)
    const rate = rows.length ? Math.round((redeemed.length / rows.length) * 100) : 0
    return {
      total: rows.length,
      available: available.length,
      redeemed: redeemed.length,
      expired: expired.length,
      availableValue,
      rate,
    }
  }, [rows, valueOf])

  const visible = React.useMemo(() => {
    let list = rows
    if (statusTab === 'available') list = list.filter((r) => r.status === 'available')
    else if (statusTab === 'redeemed') list = list.filter((r) => r.status === 'redeemed')
    else if (statusTab === 'expired')
      list = list.filter((r) => r.status === 'available' && isCodeExpired(r))

    if (planFilter !== 'all') list = list.filter((r) => r.planId === Number(planFilter))

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q),
      )
    }

    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sortMode) {
        case 'oldest':
          return +new Date(a.createdAt) - +new Date(b.createdAt)
        case 'expiry':
          return (
            (a.expiresAt ? +new Date(a.expiresAt) : Infinity) -
            (b.expiresAt ? +new Date(b.expiresAt) : Infinity)
          )
        case 'value':
          return valueOf(b) - valueOf(a)
        default:
          return +new Date(b.createdAt) - +new Date(a.createdAt)
      }
    })
    return sorted
  }, [rows, statusTab, planFilter, search, sortMode, valueOf])

  const hasActiveFilters =
    statusTab !== 'all' || planFilter !== 'all' || search !== ''

  const clearFilters = () => {
    setStatusTab('all')
    setPlanFilter('all')
    setSearchInput('')
    setSearch('')
    setSortMode('newest')
  }

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopiedCode(code)
    toast.success('تم نسخ الكود')
    window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1600)
  }

  const exportCSV = () => {
    const available = visible.filter((r) => r.status === 'available')
    if (available.length === 0) {
      toast.error('لا توجد أكواد متاحة للتصدير')
      return
    }
    const csv = ['Code,Plan,Period,DurationDays,ExpiresAt,AssignedTenant']
    for (const r of available) {
      const escaped = (s: string | null) => (s ? `"${s.replace(/"/g, '""')}"` : '')
      csv.push(
        [
          r.code,
          escaped(r.planName),
          PERIOD_LABEL[r.period] ?? r.period,
          r.durationDays ?? '',
          r.expiresAt ? formatShortDate(r.expiresAt) : '',
          r.tenantName ? escaped(r.tenantName) : '',
        ].join(','),
      )
    }
    const blob = new Blob(['\uFEFF' + csv.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activation-codes-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`تم تصدير ${available.length} كود`)
  }

  const deleteRow = rows.find((r) => r.id === deleteId) ?? null

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await api(`/api/admin/codes/${deleteId}`, { method: 'DELETE' })
      toast.success('تم حذف الكود')
      setDeleteId(null)
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  return (
    <div className="space-y-5">
      {/* ═══ الهيرو — الأخضر الأصلي (بنكنوت) ═══ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border border-emerald-800/60 bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 text-emerald-50 shadow-lg shadow-emerald-950/20 dark:border-emerald-700/40 dark:shadow-none">
        <div aria-hidden className="absolute inset-0" style={INTAGLIO} />
        <div
          aria-hidden
          className="absolute -top-24 start-1/3 size-72 rounded-full bg-amber-400/15 blur-3xl"
        />
        <Banknote
          aria-hidden
          className="absolute -bottom-14 -start-12 size-52 -rotate-12 text-amber-300/8"
          strokeWidth={1.2}
        />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-200 backdrop-blur">
                <Landmark className="size-3.5" />
                دار إصدار الأكواد
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                أكواد الاشتراك
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-emerald-100/75">
                كل كود عملة مسبقة الدفع — بفئة (باقة + مدة) ورقم تسلسلي وختم حالة.
                تولّد، تصدّر، وتتابع الاسترداد.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-bold text-emerald-100 backdrop-blur">
                <BadgeCheck className="size-3.5 text-emerald-300" />
                متاح {stats.available}
              </span>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-bold text-emerald-100/85 backdrop-blur">
                <Coins className="size-3.5 text-zinc-300" />
                مُستخدم {stats.redeemed}
              </span>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 text-xs font-bold text-amber-200 backdrop-blur">
                <TrendingUp className="size-3.5" />
                معدل الاسترداد {stats.rate}%
              </span>
              {stats.expired > 0 && (
                <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-300/25 bg-rose-400/10 px-3 text-xs font-bold text-rose-200 backdrop-blur">
                  <Clock className="size-3.5" />
                  منتهي {stats.expired}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="lg:text-end">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200/70">
                القيمة الاسمية المتاحة
              </p>
              <p className={cn('font-mono text-4xl font-black tabular-nums sm:text-5xl', GOLD_FOIL)}>
                {formatCurrency(stats.availableValue)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-emerald-100/60">
                {stats.available} كود جاهز للتوزيع
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                onClick={() => {
                  setGenerated(null)
                  setGenOpen(true)
                }}
                className="h-11 gap-2 rounded-xl border border-amber-300/50 bg-gradient-to-l from-amber-400 to-yellow-500 px-5 font-black text-emerald-950 shadow-[0_10px_26px_-10px_rgba(245,158,11,0.7)] transition-all hover:from-amber-300 hover:to-yellow-400 hover:shadow-[0_14px_30px_-10px_rgba(245,158,11,0.8)] active:scale-[0.97]"
              >
                <Printer className="size-4" strokeWidth={2.4} />
                توليد أكواد
              </Button>
              <Button
                variant="outline"
                onClick={exportCSV}
                className="h-11 gap-2 rounded-xl border-amber-400/40 bg-transparent px-4 font-bold text-amber-200 hover:border-amber-300 hover:bg-amber-400/10 hover:text-amber-100"
              >
                <Download className="size-4" />
                تصدير المتاح (CSV)
              </Button>
            </div>
          </div>
        </div>

        <Microprint className="border-t border-white/8 bg-black/15 px-4" />
      </section>

      <section className="animate-in-up stagger-1 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CoinMedallion
          icon={Ticket}
          value={String(stats.total)}
          label="إجمالي الأكواد المصدرة"
          sub="منذ بداية الدار"
          tone="emerald"
          delay={0}
        />
        <CoinMedallion
          icon={BadgeCheck}
          value={String(stats.available)}
          label="متاح للتوزيع"
          sub={
            <span className="font-bold text-amber-600 dark:text-amber-400">
              ≈ {formatCurrency(stats.availableValue)}
            </span>
          }
          tone="gold"
          delay={70}
        />
        <CoinMedallion
          icon={Coins}
          value={String(stats.redeemed)}
          label="مُستخدم (مُسترد)"
          sub={`معدل الاسترداد ${stats.rate}%`}
          tone="zinc"
          delay={140}
        />
        <CoinMedallion
          icon={Clock}
          value={String(stats.expired)}
          label="منتهي الصلاحية"
          sub="صلاحيتهم فُقدت قبل الاستخدام"
          tone="rose"
          delay={210}
        />
      </section>

      <section className="animate-in-up stagger-2 space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="فلتر الحالة">
            {STATUS_TABS.map((t) => {
              const count =
                t.key === 'all'
                  ? stats.total
                  : t.key === 'available'
                    ? stats.available
                    : t.key === 'redeemed'
                      ? stats.redeemed
                      : stats.expired
              const active = statusTab === t.key
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setStatusTab(t.key)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-all',
                    active
                      ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
                      : 'border-border bg-muted/40 text-muted-foreground hover:border-emerald-600/40 hover:bg-emerald-500/10 hover:text-emerald-800 dark:hover:text-emerald-300',
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums',
                      active ? 'bg-black/15 text-white' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-9 w-40 rounded-xl text-xs font-semibold">
                <SelectValue placeholder="الباقة" />
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

            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="h-9 w-40 rounded-xl text-xs font-semibold">
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">الأحدث إصداراً</SelectItem>
                <SelectItem value="oldest">الأقدم إصداراً</SelectItem>
                <SelectItem value="expiry">أقرب انتهاءً</SelectItem>
                <SelectItem value="value">الأعلى قيمة</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالكود/الملاحظات..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 w-56 rounded-xl pe-9 text-xs"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="مسح البحث"
                  onClick={() => setSearchInput('')}
                  className="absolute end-8 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <p className="text-[11px] font-semibold text-muted-foreground">
            عرض{' '}
            <span className="font-mono font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {visible.length}
            </span>{' '}
            من {rows.length} كود
          </p>
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5">
              {statusTab !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {STATUS_TABS.find((t) => t.key === statusTab)?.label}
                </span>
              )}
              {planFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {plans.find((p) => p.id === Number(planFilter))?.name}
                </span>
              )}
              {search && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {search}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                <X className="size-3" />
                مسح الفلاتر
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="animate-in-up stagger-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-l from-emerald-950 to-emerald-900 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full border border-amber-300/40 bg-amber-400/10">
              <Landmark className="size-4.5 text-amber-300" />
            </span>
            <div>
              <h2 className="text-sm font-black text-emerald-50">دفتر الإصدار</h2>
              <p className="text-[11px] font-medium text-emerald-100/60">
                سجل كل عملة مُصدرة برقمها التسلسلي وختمها
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-emerald-100">
              {visible.length} / {rows.length}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="تحديث"
                  onClick={() => load(true)}
                  className="size-9 rounded-xl border border-white/10 bg-white/5 text-emerald-100 hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw
                    className={cn('size-4', refreshing && 'animate-spin')}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">تحديث الدفتر</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div
              aria-hidden
              className="grid size-24 place-items-center rounded-full p-[4px]"
              style={REED_RING_GOLD}
            >
              <span className="grid size-full place-items-center rounded-full bg-muted">
                <Banknote className="size-9 text-muted-foreground" strokeWidth={1.6} />
              </span>
            </div>
            <h3 className="mt-4 text-base font-black">لا توجد أكواد بعد</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              الدار لم تطبع أي عملة حتى الآن — ابدأ أول إصدار وسيظهر هنا بكل
              أرقامه التسلسلية.
            </p>
            <Button
              onClick={() => {
                setGenerated(null)
                setGenOpen(true)
              }}
              className="mt-4 gap-2 rounded-xl border border-amber-300/50 bg-gradient-to-l from-amber-400 to-yellow-500 px-5 font-black text-emerald-950 hover:from-amber-300 hover:to-yellow-400"
            >
              <Printer className="size-4" />
              أول إصدار
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <Search className="size-8 text-muted-foreground" strokeWidth={1.6} />
            <h3 className="mt-3 text-sm font-black">لا نتائج لهذا الفلتر</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              جرّب توسيع نطاق الحالة أو الباقة.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={clearFilters}
              className="mt-3 gap-1.5 rounded-xl"
            >
              <X className="size-3.5" />
              مسح الفلاتر
            </Button>
          </div>
        ) : (
          <div className="max-h-[68vh] overflow-auto">
            <Table className="min-w-[1020px]">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="border-b-0 hover:bg-transparent">
                  {[
                    { t: '#', c: 'w-12 text-center' },
                    { t: 'الكود', c: 'w-52' },
                    { t: 'الباقة', c: 'w-40' },
                    { t: 'الفئة', c: 'w-20 text-center' },
                    { t: 'الحالة', c: 'w-32 text-center' },
                    { t: 'انتهاء الكود', c: 'w-32 text-center' },
                    { t: 'مخصّص لـ', c: 'w-32 text-center hidden lg:table-cell' },
                    { t: 'الإصدار', c: 'w-28 hidden md:table-cell' },
                    { t: 'الاستخدام', c: 'w-24' },
                    { t: '', c: 'w-16 text-center' },
                  ].map((h, i) => (
                    <TableHead
                      key={i}
                      className={cn(
                        'h-11 border-b border-emerald-700/50 bg-emerald-900 px-3 text-[11px] font-black text-emerald-50 dark:bg-emerald-950',
                        h.c,
                      )}
                    >
                      {h.t}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r, i) => {
                  const codeExpired = isCodeExpired(r)
                  return (
                    <TableRow
                      key={r.id}
                      className="animate-in-up border-border/60 transition-colors hover:bg-emerald-50/60 dark:hover:bg-emerald-950/25"
                      style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
                    >
                      <TableCell className="text-center font-mono text-[11px] tabular-nums text-muted-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </TableCell>

                      <TableCell>
                        <BanknoteCodeCell
                          code={r.code}
                          copied={copiedCode === r.code}
                          onCopy={() => copyCode(r.code)}
                        />
                      </TableCell>

                      <TableCell>
                        <p className="max-w-[150px] truncate text-xs font-bold" title={r.planName}>
                          {r.planName}
                        </p>
                        <p className="font-mono text-[10.5px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                          ≈ {formatCurrency(valueOf(r))}
                        </p>
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <DurationCoin r={r} />
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <StatusSeal r={r} />
                      </TableCell>

                      <TableCell className="text-center text-xs">
                        {r.expiresAt ? (
                          <span
                            className={cn(
                              'inline-flex flex-col leading-tight',
                              codeExpired
                                ? 'font-bold text-rose-600 dark:text-rose-400'
                                : 'text-foreground',
                            )}
                          >
                            {formatShortDate(r.expiresAt)}
                            {codeExpired && (
                              <span className="text-[10px] font-black">(فقدت)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="hidden text-center text-xs lg:table-cell">
                        {r.assignedTenantId ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                title={r.assignedTenantId}
                                className="inline-flex cursor-default items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300"
                              >
                                <UserCog className="size-3" />
                                مخصّص
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {r.tenantName ?? 'محل محدد'}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">عام</span>
                        )}
                      </TableCell>

                      <TableCell className="hidden text-xs md:table-cell">
                        {formatShortDate(r.createdAt)}
                      </TableCell>

                      <TableCell className="w-24">
                        {r.redeemedAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                className="inline-flex cursor-default items-center gap-1 text-[11px] font-semibold"
                              >
                                <Coins className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                {formatShortDate(r.redeemedAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div className="text-start">
                                <p className="font-bold">{formatShortDate(r.redeemedAt)}</p>
                                {r.tenantName && (
                                  <p className="text-[11px] text-muted-foreground">{r.tenantName}</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        {r.status === 'available' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`حذف الكود ${r.code}`}
                                className="size-8 rounded-lg text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setDeleteId(r.id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">إتلاف الكود</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="border-t bg-muted/30">
          <Microprint className="px-4 py-0.5 text-emerald-900/10 dark:text-amber-200/10" />
        </div>
      </section>

      <GenerateCodesDialog
        plans={plans}
        tenants={tenants}
        open={genOpen}
        onOpenChange={setGenOpen}
        generated={generated}
        onGenerated={setGenerated}
        onSaved={() => load(true)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full border border-rose-300/50 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Trash2 className="size-4.5" />
              </span>
              إتلاف الكود من الدفتر
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <span className="block">
                  سيتم حذف الكود نهائياً من دار الإصدار — كأن العملة أُتلفت قبل
                  التداول. لا يمكن التراجع عن هذا الإجراء.
                </span>
                {deleteRow && (
                  <span
                    dir="ltr"
                    className="flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 dark:border-emerald-700/60 dark:bg-emerald-950/60"
                  >
                    <span className="font-mono text-sm font-bold tracking-[0.12em] text-emerald-900 dark:text-emerald-100">
                      {deleteRow.code}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {deleteRow.planName}
                    </span>
                  </span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">تراجع — أرجعه للخزنة</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              نعم، أتلِفه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function GenerateCodesDialog({
  plans,
  tenants,
  open,
  onOpenChange,
  generated,
  onGenerated,
  onSaved,
}: {
  plans: PlanLite[]
  tenants: TenantLite[]
  open: boolean
  onOpenChange: (o: boolean) => void
  generated: string[] | null
  onGenerated: (s: string[] | null) => void
  onSaved: () => void
}) {
  const [planId, setPlanId] = React.useState('')
  const [period, setPeriod] = React.useState<'monthly' | 'yearly' | 'trial'>('monthly')
  const [quantity, setQuantity] = React.useState('5')
  const [notes, setNotes] = React.useState('')
  const [useCustomDuration, setUseCustomDuration] = React.useState(false)
  const [durationDays, setDurationDays] = React.useState('')
  const [expiresAt, setExpiresAt] = React.useState('')
  const [assignedTenantId, setAssignedTenantId] = React.useState('none')
  const [saving, setSaving] = React.useState(false)

  const [revealed, setRevealed] = React.useState<Set<number>>(new Set())

  React.useEffect(() => {
    if (open) {
      setPlanId(
        plans.find((p) => p.code === 'electronics-basic')?.id?.toString() ??
          plans[0]?.id?.toString() ??
          '',
      )
      setPeriod('monthly')
      setQuantity('5')
      setNotes('')
      setUseCustomDuration(false)
      setDurationDays('')
      setExpiresAt('')
      setAssignedTenantId('none')
      setRevealed(new Set())
    }
  }, [open, plans])

  const selectedPlan = plans.find((p) => p.id.toString() === planId)
  const qty = Math.min(100, Math.max(1, Number(quantity) || 1))

  const previewValue = React.useMemo(() => {
    if (!selectedPlan) return 0
    if (useCustomDuration && Number(durationDays) > 0) {
      return Math.round(((selectedPlan.priceMonthly ?? 0) / 30) * Number(durationDays))
    }
    if (period === 'monthly') return selectedPlan.priceMonthly ?? 0
    if (period === 'yearly') return selectedPlan.priceYearly ?? 0
    return 0
  }, [selectedPlan, period, useCustomDuration, durationDays])

  const previewDuration = useCustomDuration
    ? Number(durationDays) || 0
    : PERIOD_DAYS[period]

  const assignedShop = tenants.find((t) => t.id === assignedTenantId)?.shopName

  const generate = async () => {
    if (!planId) {
      toast.error('اختر الباقة')
      return
    }
    if (useCustomDuration) {
      const d = Number(durationDays)
      if (!d || d < 1 || d > 3650) {
        toast.error('مدة الكود يجب أن تكون بين 1 و 3650 يوم')
        return
      }
    }
    setSaving(true)
    try {
      const body: any = {
        planId: Number(planId),
        period,
        quantity: Number(quantity) || 1,
        notes,
      }
      if (useCustomDuration) body.durationDays = Number(durationDays)
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString()
      if (assignedTenantId !== 'none') body.assignedTenantId = assignedTenantId

      const data = await api<{ codes: string[] }>('/api/admin/codes', {
        method: 'POST',
        body,
      })
      onGenerated(data.codes)
      setRevealed(new Set())
      toast.success(`تم إصدار ${data.codes.length} كود من المطبعة`)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التوليد')
    } finally {
      setSaving(false)
    }
  }

  const exportGenerated = () => {
    if (!generated) return
    const csv = ['Code']
    for (const c of generated) csv.push(c)
    const blob = new Blob(['\uFEFF' + csv.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `generated-codes-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyAll = () => {
    if (!generated) return
    navigator.clipboard?.writeText(generated.join('\n')).catch(() => {})
    toast.success(`تم نسخ ${generated.length} كود`)
  }

  const revealAll = () => {
    if (!generated) return
    setRevealed(new Set(generated.map((_, i) => i)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="relative overflow-hidden border-b bg-gradient-to-l from-emerald-950 to-emerald-900 px-5 py-4 text-emerald-50 sm:px-6">
          <div aria-hidden className="absolute inset-0" style={INTAGLIO} />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-amber-300/40 bg-amber-400/10">
              <Printer className="size-5 text-amber-300" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-black text-white">
                مطبعة الأكواد — توليد أكواد تفعيل
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs leading-relaxed text-emerald-100/70">
                سيتم توليد أكواد عشوائية بطول 12 حرف (بدون أحرف ملتبسة مثل 0/O أو
                1/I). استخدم الخيارات المتقدمة لتخصيص المدة أو تخصيصها لمحل معين.
              </DialogDescription>
            </div>
          </div>
          <Microprint className="absolute inset-x-0 bottom-0 border-t border-white/8 bg-black/15 px-4" />
        </DialogHeader>

        {generated ? (
          <DialogBody className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-400">
                <BadgeCheck className="size-4.5" />
                خرجت من المطبعة: {generated.length} كود
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-lg text-xs"
                  onClick={revealAll}
                >
                  <Sparkles className="size-3.5 text-amber-500" />
                  اكشف الكل
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-lg text-xs"
                  onClick={copyAll}
                >
                  <Copy className="size-3.5" />
                  نسخ الكل
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-lg text-xs"
                  onClick={exportGenerated}
                >
                  <Download className="size-3.5" />
                  CSV
                </Button>
              </div>
            </div>

            <div className="max-h-[46dvh] space-y-2 overflow-y-auto pe-1">
              {generated.map((c, i) => (
                <ScratchCard
                  key={c}
                  code={c}
                  index={i + 1}
                  revealed={revealed.has(i)}
                  onReveal={() =>
                    setRevealed((s) => new Set(s).add(i))
                  }
                  onCopy={() => {
                    navigator.clipboard?.writeText(c).catch(() => {})
                    toast.success('تم نسخ الكود')
                  }}
                />
              ))}
            </div>

            <Button
              className="w-full gap-2 rounded-xl border border-amber-300/50 bg-gradient-to-l from-amber-400 to-yellow-500 font-black text-emerald-950 hover:from-amber-300 hover:to-yellow-400"
              onClick={() => {
                onGenerated(null)
                onOpenChange(false)
              }}
            >
              <Check className="size-4" strokeWidth={2.6} />
              تم — أغلق المطبعة
            </Button>
          </DialogBody>
        ) : (
          <DialogBody className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_290px]">
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">الباقة *</Label>
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
                  <Label className="text-xs font-bold">الفترة</Label>
                  <Select
                    value={period}
                    onValueChange={(v: any) => setPeriod(v)}
                    disabled={useCustomDuration}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">شهري (30 يوم)</SelectItem>
                      <SelectItem value="yearly">سنوي (365 يوم)</SelectItem>
                      <SelectItem value="trial">تجريبي (14 يوم)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-emerald-600"
                    checked={useCustomDuration}
                    onChange={(e) => setUseCustomDuration(e.target.checked)}
                  />
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <Clock className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    تخصيص مدة الكود (بالأيام)
                  </span>
                </label>
                {useCustomDuration && (
                  <div className="space-y-1.5 ps-6">
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                      placeholder="مثال: 45 (اشتراك 45 يوم بدلاً من 30)"
                      dir="ltr"
                      className="rounded-xl"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      عند التفعيل، يحصل المستخدم على اشتراك بالمدة المحددة بالأيام
                      بدلاً من الفترة الشهرية/السنوية.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">العدد (1-100)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    dir="ltr"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">تخصيص لمحل (اختياري)</Label>
                  <Select
                    value={assignedTenantId}
                    onValueChange={setAssignedTenantId}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="عام (أي محل)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عام (أي محل يقدر يفعّله)</SelectItem>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.shopName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-bold">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  تاريخ انتهاء صلاحية الكود (اختياري)
                </Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  dir="ltr"
                  className="rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">
                  إذا حُدّد، لا يمكن تفعيل الكود بعد هذا التاريخ (حتى لو لم يُستخدم).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">ملاحظات داخلية</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="مثال: حملة تسويقية ديسمبر — تُرسل للعملاء عبر WhatsApp"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2.5 lg:sticky lg:top-0 lg:self-start">
              <p className="flex items-center gap-1.5 text-[11px] font-black text-muted-foreground">
                <Banknote className="size-3.5 text-amber-500" />
                معاينة حية — العملة تحت الطباعة
              </p>
              <BanknotePreview
                planName={selectedPlan?.name ?? '— اختر باقة —'}
                periodLabel={
                  useCustomDuration && Number(durationDays) > 0
                    ? `مدة مخصصة — ${durationDays} يوم`
                    : `${PERIOD_LABEL[period]} — ${PERIOD_DAYS[period]} يوم`
                }
                duration={previewDuration}
                value={previewValue}
                quantity={qty}
                assignedShop={assignedShop}
                expiresAt={expiresAt || null}
              />
              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                كل كود سيحمل رقم تسلسلي فريد من 12 حرف — القيمة الاسمية
                تُحسب من الباقة والمدة المختارة.
              </p>
            </div>
          </DialogBody>
        )}

        {!generated && (
          <DialogFooter className="gap-2 border-t bg-muted/30 px-5 py-3.5 sm:px-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-bold"
            >
              إلغاء
            </Button>
            <Button
              onClick={generate}
              disabled={saving}
              className="gap-2 rounded-xl border border-amber-300/50 bg-gradient-to-l from-amber-400 to-yellow-500 font-black text-emerald-950 hover:from-amber-300 hover:to-yellow-400"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Printer className="size-4" />
              )}
              {saving ? 'جاري الطباعة…' : 'اطبع الأكواد'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BanknotePreview({
  planName,
  periodLabel,
  duration,
  value,
  quantity,
  assignedShop,
  expiresAt,
}: {
  planName: string
  periodLabel: string
  duration: number
  value: number
  quantity: number
  assignedShop?: string
  expiresAt: string | null
}) {
  return (
    <div
      dir="rtl"
      className="relative aspect-[16/10] overflow-hidden rounded-xl border-2 border-amber-400/40 bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 p-3.5 text-emerald-50 shadow-lg shadow-emerald-950/30"
    >
      <div aria-hidden className="absolute inset-0" style={INTAGLIO} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2 rounded-lg border border-dashed border-amber-200/25"
      />

      <div className="absolute start-3.5 top-2.5 text-amber-300">
        <p className="font-mono text-2xl font-black leading-none tabular-nums">
          {duration || '—'}
        </p>
        <p className="text-[8px] font-bold tracking-widest opacity-70">يوم</p>
      </div>
      <div className="absolute bottom-2.5 end-3.5 rotate-180 text-amber-300">
        <p className="font-mono text-2xl font-black leading-none tabular-nums">
          {duration || '—'}
        </p>
        <p className="text-[8px] font-bold tracking-widest opacity-70">يوم</p>
      </div>

      <span className="absolute end-3 top-3 -rotate-6 rounded-md border-2 border-amber-300/70 px-2 py-0.5 font-mono text-sm font-black tabular-nums text-amber-200">
        ×{quantity}
      </span>

      <div className="relative flex h-full flex-col items-center justify-center text-center">
        <p className="text-[8.5px] font-black uppercase tracking-[0.3em] text-amber-200/80">
          نِظام POS
        </p>
        <p className="mt-1 max-w-[180px] truncate text-sm font-black leading-snug text-amber-100">
          {planName}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold text-emerald-100/70">
          {periodLabel}
        </p>
        <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.22em] text-white/60" dir="ltr">
          NEZAM-••••-••••
        </p>
        {value > 0 && (
          <p className="mt-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-0.5 font-mono text-[11px] font-black tabular-nums text-amber-200">
            {formatCurrency(value)}
          </p>
        )}
      </div>

      <div className="absolute inset-x-3 bottom-2.5 flex flex-wrap items-center justify-center gap-1.5">
        {assignedShop && (
          <span className="max-w-[120px] truncate rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold text-emerald-100">
            مخصّص: {assignedShop}
          </span>
        )}
        {expiresAt && (
          <span className="rounded-full border border-rose-300/40 bg-rose-400/15 px-2 py-0.5 text-[9px] font-bold text-rose-200">
            صالح حتى {formatShortDate(expiresAt)}
          </span>
        )}
      </div>

      <Microprint className="absolute inset-x-0 bottom-0 py-0.5" />
    </div>
  )
}

function ScratchCard({
  code,
  index,
  revealed,
  onReveal,
  onCopy,
}: {
  code: string
  index: number
  revealed: boolean
  onReveal: () => void
  onCopy: () => void
}) {
  return (
    <div
      className={cn(
        'animate-in-up flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
        revealed
          ? 'border-emerald-300/70 bg-gradient-to-l from-emerald-50 to-emerald-100/60 dark:border-emerald-700/60 dark:from-emerald-950 dark:to-emerald-900/60'
          : 'border-border bg-muted/30',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-black tabular-nums',
          revealed
            ? 'bg-gradient-to-br from-amber-300 to-yellow-400 text-emerald-950'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          dir="ltr"
          onClick={() => (revealed ? onCopy() : onReveal())}
          className={cn(
            'group relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-start font-mono text-sm font-bold tracking-[0.14em] transition-all',
            revealed
              ? 'border-emerald-300/70 bg-white/70 text-emerald-900 dark:border-emerald-700/60 dark:bg-black/30 dark:text-emerald-100'
              : 'border-amber-400/50 bg-gradient-to-l from-amber-300 via-yellow-400 to-amber-400 text-emerald-950',
          )}
          aria-label={revealed ? `نسخ ${code}` : 'اكشف الكود'}
        >
          <span className={cn(revealed ? 'block' : 'opacity-0')}>
            {code}
          </span>
          {!revealed && (
            <span className="absolute inset-0 flex items-center justify-center gap-1.5 font-sans text-xs font-black tracking-normal">
              <Sparkles className="size-3.5 transition-transform group-hover:scale-125" />
              اكشف الكود — كشط
            </span>
          )}
        </button>
      </div>

      {revealed ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label="نسخ"
          onClick={onCopy}
          className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          <Copy className="size-3.5" />
        </Button>
      ) : (
        <KeyRound className="size-4 shrink-0 text-amber-500/60" />
      )}
    </div>
  )
}