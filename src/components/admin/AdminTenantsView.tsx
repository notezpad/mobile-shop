'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AdminTenantsView — "المحلات المشتركة" (تصميم 2026-10-08)
 * ═══════════════════════════════════════════════════════════════════════
 *  هوية الصفحة: "غرفة تحكم شبكة المحلات" — نفس لغة التصميم بتاعة لوحة
 *  المستخدم (هيرو + خلفيات شعاعية + نقش منقّط + رقم كبير متدرّج) لكن
 *  بهوية الأدمن الذهبيّة (amber/orange) بدل الأخضر.
 *
 *  البنية:
 *    1. هيرو الصفحة — عدد المحلات النشطة + "صحة الشبكة" (توزيع الحالات
 *       على شريط مكدّس) + تنبيهات الانتهاء/التجارب + الأزرار الرئيسية.
 *    2. صف مؤشرات KPI (إجمالي/نشط/تجريبي/موقوف-منتهي).
 *    3. لوحة أوامر: بحث فوري + أقراص فلترة بالعدّادات + ترتيب.
 *    4. جدول فاخر (lg+) وبطاقات غنية (< lg) — أفاتار متدرّج لكل محل،
 *       شريط عدّ تنازلي للاشتراك، حالة بلون، وإجراءات بأدوات تلميح.
 *    5. دايلوجات معاد تصميمها بالكامل (تفاصيل/تعديل/إضافة/حذف).
 *
 *  كل منطق البيانات (API endpoints + العقود) زي ما هو بالظبط — تغيير
 *  العرض فقط.
 */

import * as React from 'react'
import {
  Store,
  Eye,
  Pencil,
  LogIn,
  Pause,
  Play,
  Trash2,
  Plus,
  Search,
  Loader2,
  User,
  Mail,
  Phone,
  MapPin,
  Save,
  Copy,
  X,
  Users,
  Activity,
  FlaskConical,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ShoppingBag,
  Wallet,
  Boxes,
  ReceiptText,
  CalendarDays,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Sparkles,
  Crown,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { useShopStore } from '@/lib/store'

/* ───────────────────────── أنواع البيانات ───────────────────────── */

interface TenantRow {
  id: string
  shopName: string
  phone: string | null
  address: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  status: string
  createdAt: string
  lastLoginAt: string | null
  usersCount: number
  planCode: string
  planName: string
  subscriptionEnd: string | null
}

interface Plan {
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

/** صياغة نسبية لآخر دخول: الآن / اليوم / أمس / من ٣ أيام … */
function relativeLastLogin(iso: string | null): string {
  if (!iso) return 'لم يسجل دخول'
  const d = -daysUntil(iso)
  if (d < 1 / 24) return 'الآن'
  if (d < 1) return 'اليوم'
  if (d < 2) return 'أمس'
  if (d < 7) return `من ${Math.floor(d)} أيام`
  if (d < 30) return `من ${Math.floor(d / 7)} أسابيع`
  if (d < 365) return `من ${Math.floor(d / 30)} شهور`
  return `من ${Math.floor(d / 365)} سنة`
}

/** تدرّج لوني ثابت لكل محل — نفس الاسم = نفس الأفاتار دايماً */
const AVATAR_GRADIENTS = [
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-indigo-600',
  'from-violet-400 to-purple-600',
  'from-rose-400 to-pink-600',
  'from-teal-400 to-cyan-600',
  'from-orange-400 to-red-500',
  'from-fuchsia-400 to-purple-600',
]
function gradientIndexOf(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % AVATAR_GRADIENTS.length
}

/** الأحرف الأولى من اسم المحل للأفاتار */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '؟'
  if (words.length === 1) return words[0].slice(0, 2)
  return words[0].slice(0, 1) + words[1].slice(0, 1)
}

/* ───────────────────────── خريطة الحالات والباقات ───────────────────────── */

const STATUS_META: Record<
  string,
  { label: string; color: string; soft: string; icon: LucideIcon }
> = {
  active: { label: 'نشط', color: '#10b981', soft: 'rgba(16,185,129,0.12)', icon: CheckCircle2 },
  trial: { label: 'تجريبي', color: '#0ea5e9', soft: 'rgba(14,165,233,0.12)', icon: FlaskConical },
  suspended: { label: 'موقوف', color: '#f59e0b', soft: 'rgba(245,158,11,0.14)', icon: Pause },
  expired: { label: 'منتهي', color: '#f43f5e', soft: 'rgba(244,63,94,0.12)', icon: Clock },
  cancelled: { label: 'ملغي', color: '#94a3b8', soft: 'rgba(148,163,184,0.16)', icon: X },
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: '#94a3b8', soft: 'rgba(148,163,184,0.16)', icon: Activity }
}

const PLAN_COLORS = ['#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1', '#f97316']
function planColor(code: string): string {
  if (code.includes('pro')) return '#8b5cf6'
  if (code.includes('fashion')) return '#ec4899'
  if (code === '-') return '#94a3b8'
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return PLAN_COLORS[h % PLAN_COLORS.length]
}

/* ───────────────────────── مكوّنات العرض الصغيرة ───────────────────────── */

/** شارة حالة — نقطة نابضة + خلفية ناعمة بلون الحالة */
function StatusPill({ status, size = 'sm' }: { status: string; size?: 'sm' | 'xs' }) {
  const m = statusMeta(status)
  const Icon = m.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-bold',
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]',
      )}
      style={{ backgroundColor: m.soft, color: m.color, borderColor: `${m.color}30` }}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-2.5'} strokeWidth={2.4} />
      {m.label}
    </span>
  )
}

/** شارة الباقة — نقطة بلون الباقة + اسمها */
function PlanPill({ code, name }: { code: string; name: string }) {
  const color = planColor(code)
  return (
    <span
      className="inline-flex max-w-[150px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}14`, color, borderColor: `${color}30` }}
      title={name}
    >
      <i className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** أفاتار المحل — تدرّج ثابت من الاسم + حلقة بلون الحالة */
function TenantAvatar({
  name,
  status,
  size = 'md',
}: {
  name: string
  status?: string
  size?: 'md' | 'lg' | 'xl'
}) {
  const grad = AVATAR_GRADIENTS[gradientIndexOf(name)]
  const ring = status ? statusMeta(status).color : undefined
  const dims =
    size === 'xl' ? 'size-16 text-xl' : size === 'lg' ? 'size-12 text-base' : 'size-10 text-sm'
  return (
    <span className="relative inline-flex shrink-0" title={name}>
      <span
        className={cn(
          'relative grid place-items-center overflow-hidden rounded-2xl bg-gradient-to-br font-extrabold text-white shadow-sm',
          grad,
          dims,
        )}
        style={ring ? { boxShadow: `0 0 0 2.5px ${ring}55, 0 2px 8px -2px ${ring}66` } : undefined}
        aria-hidden
      >
        <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/25" />
        <span className="relative">{initialsOf(name)}</span>
      </span>
      {status && (
        <span
          className="absolute -bottom-0.5 -left-0.5 grid size-4 place-items-center rounded-full ring-2 ring-card"
          style={{ backgroundColor: statusMeta(status).color }}
        >
          {(() => {
            const StatusIcon = statusMeta(status).icon
            return <StatusIcon className="size-2.5 text-white" strokeWidth={3} />
          })()}
        </span>
      )}
    </span>
  )
}

/** عدّاد تنازلي للاشتراك — شريط يتناقص مع الأيام + نص متبقي */
function SubCountdown({ row }: { row: TenantRow }) {
  if (!row.subscriptionEnd) {
    return <span className="text-[11px] text-muted-foreground">بدون اشتراك</span>
  }
  const d = Math.floor(daysUntil(row.subscriptionEnd))
  const dead = d <= 0 || row.status === 'expired' || row.status === 'cancelled'
  if (dead) {
    return (
      <div className="w-[110px]">
        <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">انتهى الاشتراك</p>
        <p className="text-[10px] text-muted-foreground">
          {d < 0 ? `منذ ${num(Math.abs(d))} يوم` : 'اليوم'}
        </p>
      </div>
    )
  }
  const pct = Math.min(100, Math.max((d / 30) * 100, 4))
  const color = d <= 3 ? '#f43f5e' : d <= 7 ? '#f59e0b' : '#10b981'
  return (
    <div className="w-[110px]">
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="text-xs font-extrabold tabular-nums" style={{ color }}>
          {num(d)}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">يوم متبقي</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${color}20` }}>
        <div
          className="h-full rounded-full transition-[width] duration-slow"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

/** بطاقة KPI — حد علوي ملوّن + علامة مائية + شريط تقدّم اختياري */
function KpiTile({
  color,
  icon: Icon,
  label,
  value,
  unit,
  sub,
  progress,
  progressLabel,
}: {
  color: string
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  sub?: string
  progress?: number
  progressLabel?: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-t-2 bg-card p-3 transition-shadow hover:shadow-md sm:p-4"
      style={{ borderTopColor: color, backgroundImage: `linear-gradient(135deg, ${color}14, transparent 60%)` }}
    >
      <Icon
        strokeWidth={1.25}
        className="pointer-events-none absolute -bottom-4 -start-3 size-20 opacity-[0.07] sm:size-24"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-xl sm:size-8"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon className="size-3.5 sm:size-4" />
          </span>
        </div>
        <p className="mt-1.5 truncate text-xl font-extrabold tabular-nums sm:mt-2 sm:text-2xl">
          {value}
          {unit && <span className="ms-1 text-[10px] font-medium text-muted-foreground sm:text-[11px]">{unit}</span>}
        </p>
        {sub && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground sm:mt-1 sm:text-[11px]">{sub}</p>}
        {progress !== undefined && (
          <div className="mt-2 flex items-center gap-2 sm:mt-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: `${color}22` }}>
              <div
                className="h-full rounded-full transition-[width] duration-slow ease-out"
                style={{ width: `${Math.min(100, Math.max(progress, 2))}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
              {progressLabel ?? `${Math.round(progress)}%`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** قرص فلتر بعدّاد — نفس عائلة أقراص لوحة المستخدم */
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
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all sm:px-3 sm:py-1.5 sm:text-xs',
        active
          ? color
            ? 'border-transparent text-white shadow-sm'
            : 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {color && !active && <i className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'min-w-5 rounded-full px-1.5 text-center text-[10px] font-bold tabular-nums',
            active ? 'bg-white/25' : 'bg-muted text-foreground/70',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** زر إجراء أيقوني مع تلميح */
function ActionButton({
  icon: Icon,
  title,
  onClick,
  tone = 'default',
  busy,
  size = 'md',
}: {
  icon: LucideIcon
  title: string
  onClick: () => void
  tone?: 'default' | 'amber' | 'rose'
  busy?: boolean
  size?: 'md' | 'sm'
}) {
  const tones: Record<string, string> = {
    default:
      'text-muted-foreground hover:bg-muted hover:text-foreground',
    amber:
      'text-amber-600 hover:bg-amber-500/12 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300',
    rose:
      'text-rose-600 hover:bg-rose-500/12 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300',
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          disabled={busy}
          aria-label={title}
          className={cn(
            'grid place-items-center rounded-lg transition-all active:scale-90 disabled:opacity-50',
            size === 'md' ? 'size-8' : 'size-7',
            tones[tone],
          )}
        >
          {busy ? (
            <Loader2 className={size === 'md' ? 'size-4 animate-spin' : 'size-3.5 animate-spin'} />
          ) : (
            <Icon className={size === 'md' ? 'size-4' : 'size-3.5'} strokeWidth={2} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

/* ═══════════════════════════ العرض الرئيسي ═══════════════════════════ */

type StatusFilter = 'all' | 'active' | 'trial' | 'suspended' | 'expired' | 'cancelled'
type SortKey = 'newest' | 'oldest' | 'name' | 'lastLogin' | 'expiring'

export function AdminTenantsView() {
  /* ── بيانات ── */
  const [rows, setRows] = React.useState<TenantRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [plans, setPlans] = React.useState<Plan[]>([])

  /* ── فلاتر وترتيب ── */
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [planFilter, setPlanFilter] = React.useState('all')
  const [sortKey, setSortKey] = React.useState<SortKey>('newest')

  /* ── دايلوجات ── */
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editRow, setEditRow] = React.useState<TenantRow | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteRow, setDeleteRow] = React.useState<TenantRow | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const setUser = useShopStore((s) => s.setUser)

  /* ── تحميل البيانات ── */
  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await api<{ items: TenantRow[] }>('/api/admin/tenants')
      setRows(data.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المحلات')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadPlans = React.useCallback(async () => {
    try {
      const data = await api<{ items: Plan[] }>('/api/admin/plans')
      setPlans(data.items)
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

  /* ── إجراءات ── */
  const handleImpersonate = async (id: string) => {
    setBusyId(id)
    try {
      await api(`/api/admin/tenants/${id}/impersonate`, { method: 'POST' })
      toast.success('تم الدخول كمالك للمحل')
      setUser(null)
      setTimeout(() => window.location.reload(), 200)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الدخول كمالك')
      setBusyId(null)
    }
  }

  const handleToggleStatus = async (row: TenantRow) => {
    setBusyId(row.id)
    try {
      const newStatus = row.status === 'suspended' ? 'active' : 'suspended'
      await api(`/api/admin/tenants/${row.id}`, {
        method: 'PUT',
        body: { status: newStatus },
      })
      toast.success(newStatus === 'active' ? 'تم تفعيل المحل' : 'تم إيقاف المحل')
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteRow) return
    setBusyId(deleteRow.id)
    try {
      await api(`/api/admin/tenants/${deleteRow.id}`, { method: 'DELETE' })
      toast.success('تم حذف (إلغاء) المحل')
      setDeleteRow(null)
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setBusyId(null)
    }
  }

  /* ── إحصائيات مشتقة من القائمة الكاملة (وقت البحث لا تتغير) ── */
  const startOfMonth = React.useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }, [])

  const stats = React.useMemo(() => {
    const by = (s: string) => rows.filter((r) => r.status === s).length
    const active = by('active')
    const trial = by('trial')
    const suspended = by('suspended')
    const expired = by('expired')
    const cancelled = by('cancelled')
    const expiringSoon = rows.filter(
      (r) =>
        r.subscriptionEnd &&
        r.status === 'active' &&
        daysUntil(r.subscriptionEnd) <= 7 &&
        daysUntil(r.subscriptionEnd) > 0,
    ).length
    const newThisMonth = rows.filter((r) => new Date(r.createdAt) >= startOfMonth).length
    const totalUsers = rows.reduce((s, r) => s + r.usersCount, 0)
    return {
      total: rows.length,
      active,
      trial,
      suspended,
      expired,
      cancelled,
      expiringSoon,
      newThisMonth,
      totalUsers,
    }
  }, [rows, startOfMonth])

  /* ── العدّادات الخاصة بالفلاتر (على النتائج الحالية) ── */
  const counts = React.useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      trial: rows.filter((r) => r.status === 'trial').length,
      suspended: rows.filter((r) => r.status === 'suspended').length,
      expired: rows.filter((r) => r.status === 'expired').length,
      cancelled: rows.filter((r) => r.status === 'cancelled').length,
    }),
    [rows],
  )

  /* ── النتائج المعروضة: فلترة + ترتيب (فوري — بدون رحلة سيرفر) ── */
  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (planFilter !== 'all' && r.planCode !== planFilter) return false
      if (!q) return true
      return (
        r.shopName.toLowerCase().includes(q) ||
        (r.ownerEmail ?? '').toLowerCase().includes(q) ||
        (r.ownerPhone ?? r.phone ?? '').includes(q)
      )
    })
    list = [...list].sort((a, b) => {
      if (sortKey === 'newest')
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortKey === 'oldest')
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (sortKey === 'name') return a.shopName.localeCompare(b.shopName, 'ar')
      if (sortKey === 'lastLogin') {
        const av = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0
        const bv = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0
        return bv - av
      }
      if (sortKey === 'expiring') {
        const av = a.subscriptionEnd ? daysUntil(a.subscriptionEnd) : Infinity
        const bv = b.subscriptionEnd ? daysUntil(b.subscriptionEnd) : Infinity
        return av - bv
      }
      return 0
    })
    return list
  }, [rows, search, statusFilter, planFilter, sortKey])

  const hasFilters =
    statusFilter !== 'all' || planFilter !== 'all' || sortKey !== 'newest' || search.trim() !== ''
  const clearFilters = () => {
    setStatusFilter('all')
    setPlanFilter('all')
    setSortKey('newest')
    setSearch('')
  }

  const openDetail = (r: TenantRow) => {
    setDetailId(r.id)
    setDetailOpen(true)
  }
  const openEdit = (r: TenantRow) => {
    setEditRow(r)
    setEditOpen(true)
  }

  const noData = loading && rows.length === 0

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═════════════ 1. هيرو الصفحة — "غرفة تحكم شبكة المحلات" ═════════════ */}
      <section
        className="animate-in-up relative overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm"
        style={{
          background:
            'radial-gradient(620px 240px at 100% 0%, rgba(245,158,11,0.16), transparent), radial-gradient(520px 240px at 0% 100%, rgba(249,115,22,0.10), transparent)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage: 'radial-gradient(rgba(245,158,11,0.18) 1px, transparent 1.2px)',
            backgroundSize: '16px 16px',
            maskImage: 'linear-gradient(to left, black, transparent 65%)',
            WebkitMaskImage: 'linear-gradient(to left, black, transparent 65%)',
          }}
        />

        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 p-4 sm:gap-x-8 sm:gap-y-5 sm:p-6">
          {/* العنوان + الرقم الكبير */}
          <div className="w-full min-w-0 sm:w-auto sm:min-w-[220px]">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-md shadow-amber-500/25">
                <Store className="size-[18px]" />
              </span>
              <div>
                <h1 className="text-lg font-extrabold leading-tight">المحلات المشتركة</h1>
                <p className="text-[11px] text-muted-foreground">شبكة محلاتك المشتركة في المنصة</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-medium text-muted-foreground sm:mt-4">محلات تعمل الآن على المنصة</p>
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-l from-amber-600 to-orange-500 bg-clip-text text-4xl font-extrabold tracking-tight tabular-nums text-transparent sm:text-5xl dark:from-amber-300 dark:to-orange-300">
                {noData ? '—' : num(stats.active)}
              </span>
              <span className="text-sm font-semibold text-muted-foreground sm:text-base">محل نشط</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              من إجمالي {noData ? '—' : num(stats.total)} محل مسجّل على المنصة
            </p>
          </div>

          {/* صحة الشبكة — توزيع الحالات على شريط مكدّس */}
          <div className="w-full min-w-0 sm:min-w-[300px] sm:flex-1">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3.5 backdrop-blur-sm sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-extrabold">
                  <Activity className="size-3.5 text-amber-600 dark:text-amber-400" />
                  صحة الشبكة
                </h3>
                <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                  {noData ? '—' : num(stats.total)} محل إجمالاً
                </span>
              </div>

              {/* الشريط المكدّس */}
              <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {noData ? (
                  <div className="w-full animate-pulse bg-muted-foreground/20" />
                ) : (
                  (['active', 'trial', 'suspended', 'expired', 'cancelled'] as const).map((s) => {
                    const m = statusMeta(s)
                    const w = (counts[s] / Math.max(stats.total, 1)) * 100
                    if (w <= 0) return null
                    return (
                      <Tooltip key={s}>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full transition-all duration-slow first:rounded-s-full"
                            style={{ width: `${w}%`, backgroundColor: m.color }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px]">
                          {m.label}: {counts[s]}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })
                )}
              </div>

              {/* مفتاح الرموز */}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {(
                  [
                    ['active', 'نشط'],
                    ['trial', 'تجريبي'],
                    ['suspended', 'موقوف'],
                    ['expired', 'منتهي'],
                    ['cancelled', 'ملغي'],
                  ] as const
                ).map(([k, l]) => (
                  <span key={k} className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <i
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: statusMeta(k).color }}
                    />
                    {l}
                    <span className="tabular-nums text-foreground/80">{noData ? '—' : counts[k]}</span>
                  </span>
                ))}
              </div>

              {/* تنبيهان: انتهاء قريب + تجارب */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stats.expiringSoon > 0 && (
                  <button
                    type="button"
                    onClick={() => setSortKey('expiring')}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[10.5px] font-bold text-rose-600 transition-colors hover:bg-rose-500/15 dark:text-rose-400"
                  >
                    <AlertTriangle className="size-3" />
                    {num(stats.expiringSoon)} اشتراك ينتهي خلال ٧ أيام
                  </button>
                )}
                {stats.trial > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('trial')}
                    className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10.5px] font-bold text-sky-600 transition-colors hover:bg-sky-500/15 dark:text-sky-400"
                  >
                    <FlaskConical className="size-3" />
                    {num(stats.trial)} تجربة جارية
                  </button>
                )}
                {stats.newThisMonth > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="size-3" />
                    {num(stats.newThisMonth)} محل جديد هذا الشهر
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* الأزرار */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto lg:flex-col lg:items-stretch">
            <Button
              size="lg"
              onClick={() => setAddOpen(true)}
              className="gap-1.5 border border-amber-300/40 bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-md shadow-amber-500/25 hover:from-amber-300 hover:to-orange-500 hover:shadow-lg hover:shadow-amber-500/30 sm:w-auto lg:w-auto"
            >
              <Plus className="size-4" />
              إضافة محل
            </Button>
            <Button
              variant="outline"
              onClick={() => load(true)}
              disabled={refreshing}
              className="gap-1.5 sm:w-auto lg:w-auto"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              تحديث
            </Button>
          </div>
        </div>
      </section>

      {/* ═════════════ 2. مؤشرات KPI ═════════════ */}
      <section className="animate-in-up stagger-1 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <KpiTile
          color="#f59e0b"
          icon={Store}
          label="إجمالي المحلات"
          value={noData ? '—' : num(stats.total)}
          unit="محل"
          sub={
            stats.newThisMonth > 0
              ? `${num(stats.newThisMonth)} محل انضم هذا الشهر`
              : 'كل المحلات المسجّلة على المنصة'
          }
        />
        <KpiTile
          color="#10b981"
          icon={CheckCircle2}
          label="اشتراكات نشطة"
          value={noData ? '—' : num(stats.active)}
          unit="محل"
          sub={`إجمالي ${num(stats.totalUsers)} مستخدم يعملون على المنصة`}
          progress={stats.total > 0 ? (stats.active / stats.total) * 100 : undefined}
        />
        <KpiTile
          color="#0ea5e9"
          icon={FlaskConical}
          label="تجارب جارية"
          value={noData ? '—' : num(stats.trial)}
          unit="تجربة"
          sub={
            stats.trial > 0
              ? 'مصيرها يتقرر قريباً — تابعها قبل انتهائها'
              : 'لا توجد تجارب جارية حالياً'
          }
        />
        <KpiTile
          color="#f43f5e"
          icon={AlertTriangle}
          label="بحاجة انتباه"
          value={noData ? '—' : num(stats.suspended + stats.expired)}
          unit="محل"
          sub={`${num(stats.suspended)} موقوف · ${num(stats.expired)} منتهي · ${num(stats.cancelled)} ملغي`}
          progress={stats.total > 0 ? ((stats.suspended + stats.expired) / stats.total) * 100 : undefined}
        />
      </section>

      {/* ═════════════ 3. لوحة الأوامر — بحث + فلاتر + ترتيب ═════════════ */}
      <div className="animate-in-up stagger-2 space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        {/* البحث + العدّاد */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد أو الهاتف..."
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
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
            <Store className="size-3.5" />
            <span className="tabular-nums text-foreground">{num(shown.length)}</span>
            من {noData ? '—' : num(rows.length)}
          </span>
        </div>

        {/* حالة المحل — أقراص بالعدّادات */}
        <div className="space-y-1.5 sm:flex sm:items-center sm:gap-1.5 sm:space-y-0">
          <span className="block text-[11px] font-semibold text-muted-foreground sm:me-1 sm:shrink-0">
            الحالة
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={counts.all}>
              الكل
            </FilterPill>
            <FilterPill
              active={statusFilter === 'active'}
              onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
              count={counts.active}
              color="#10b981"
            >
              نشط
            </FilterPill>
            <FilterPill
              active={statusFilter === 'trial'}
              onClick={() => setStatusFilter(statusFilter === 'trial' ? 'all' : 'trial')}
              count={counts.trial}
              color="#0ea5e9"
            >
              تجريبي
            </FilterPill>
            <FilterPill
              active={statusFilter === 'suspended'}
              onClick={() => setStatusFilter(statusFilter === 'suspended' ? 'all' : 'suspended')}
              count={counts.suspended}
              color="#f59e0b"
            >
              موقوف
            </FilterPill>
            <FilterPill
              active={statusFilter === 'expired'}
              onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')}
              count={counts.expired}
              color="#f43f5e"
            >
              منتهي
            </FilterPill>
            <FilterPill
              active={statusFilter === 'cancelled'}
              onClick={() => setStatusFilter(statusFilter === 'cancelled' ? 'all' : 'cancelled')}
              count={counts.cancelled}
              color="#94a3b8"
            >
              ملغي
            </FilterPill>
          </div>
        </div>

        {/* الباقة — أقراص ملونة بأسماء الباقات */}
        <div className="space-y-1.5 sm:flex sm:items-center sm:gap-1.5 sm:space-y-0">
          <span className="block text-[11px] font-semibold text-muted-foreground sm:me-1 sm:shrink-0">
            الباقة
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={planFilter === 'all'} onClick={() => setPlanFilter('all')}>
              كل الباقات
            </FilterPill>
            {plans.map((p) => (
              <FilterPill
                key={p.code}
                active={planFilter === p.code}
                onClick={() => setPlanFilter(planFilter === p.code ? 'all' : p.code)}
                color={planColor(p.code)}
              >
                {p.name}
              </FilterPill>
            ))}
          </div>
        </div>

        {/* الترتيب */}
        <div className="space-y-1.5 sm:flex sm:items-center sm:gap-1.5 sm:space-y-0">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground sm:me-1 sm:shrink-0">
            <ArrowUpDown className="size-3" />
            ترتيب
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['newest', 'الأحدث تسجيلاً'],
                ['oldest', 'الأقدم'],
                ['name', 'الاسم (أ – ي)'],
                ['lastLogin', 'الأحدث دخولاً'],
                ['expiring', 'الأقرب انتهاءً'],
              ] as [SortKey, string][]
            ).map(([k, l]) => (
              <FilterPill key={k} active={sortKey === k} onClick={() => setSortKey(k)} color="#f59e0b">
                {l}
              </FilterPill>
            ))}
          </div>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span>
              النتائج: <b className="tabular-nums text-foreground">{num(shown.length)}</b> محل مطابق للفلاتر
            </span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" />
              مسح الفلاتر
            </Button>
          </div>
        )}
      </div>

      {/* ═════════════ 4. المحلات — جدول (lg+) / بطاقات (< lg) ═════════════ */}
      {noData ? (
        /* هيكل تحميل */
        <div className="animate-in-up stagger-3 space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[118px] w-full rounded-2xl" />
            ))}
          </div>
          <div className="space-y-2 rounded-2xl border bg-card p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : shown.length === 0 ? (
        /* حالة فارغة */
        <div className="animate-in-up stagger-3 flex flex-col items-center justify-center rounded-3xl border bg-card px-6 py-16 text-center shadow-sm">
          <div className="relative">
            <span className="absolute inset-0 -z-10 rounded-full bg-amber-500/15 blur-2xl" />
            <span className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 text-amber-600 dark:text-amber-400">
              <Store className="size-8" strokeWidth={1.5} />
            </span>
          </div>
          <h3 className="mt-4 text-base font-extrabold">لا توجد محلات مطابقة</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            جرّب تعديل كلمة البحث أو مسح الفلاتر — أو أضف محل جديد للمنصة.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {hasFilters && (
              <Button variant="outline" onClick={clearFilters} className="gap-1.5">
                <X className="size-4" />
                مسح الفلاتر
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              إضافة محل
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* ── جدول سطح المكتب (lg+) ── */}
          <div className="animate-in-up stagger-3 hidden overflow-hidden rounded-2xl border bg-card shadow-sm lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[290px]">المحل</TableHead>
                    <TableHead className="w-[150px]">التواصل</TableHead>
                    <TableHead className="w-[170px]">الباقة</TableHead>
                    <TableHead className="w-[110px]">الحالة</TableHead>
                    <TableHead className="w-[130px]">الاشتراك</TableHead>
                    <TableHead className="w-[90px] text-center">الفريق</TableHead>
                    <TableHead className="w-[130px]">آخر دخول</TableHead>
                    <TableHead className="w-[190px] text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r, i) => (
                    <TableRow
                      key={r.id}
                      onClick={() => openDetail(r)}
                      className="animate-in-up cursor-pointer"
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    >
                      {/* المحل: أفاتار + اسم + بريد */}
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <TenantAvatar name={r.shopName} status={r.status} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold leading-tight">{r.shopName}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" dir="ltr">
                              {r.ownerEmail ?? '—'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      {/* التواصل: تليفون */}
                      <TableCell>
                        {(r.ownerPhone ?? r.phone) ? (
                          <a
                            href={`tel:${r.ownerPhone ?? r.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                            dir="ltr"
                          >
                            <Phone className="size-3 text-amber-600 dark:text-amber-400" />
                            {r.ownerPhone ?? r.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* الباقة */}
                      <TableCell>
                        <PlanPill code={r.planCode} name={r.planName} />
                      </TableCell>
                      {/* الحالة */}
                      <TableCell>
                        <StatusPill status={r.status} />
                      </TableCell>
                      {/* الاشتراك — عدّاد تنازلي */}
                      <TableCell>
                        <SubCountdown row={r} />
                      </TableCell>
                      {/* الفريق */}
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">
                          <Users className="size-3 text-muted-foreground" />
                          {num(r.usersCount)}
                        </span>
                      </TableCell>
                      {/* آخر دخول */}
                      <TableCell>
                        <p className="text-[11px] font-semibold text-foreground/80">
                          {relativeLastLogin(r.lastLoginAt)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          انضم {formatShortDate(r.createdAt)}
                        </p>
                      </TableCell>
                      {/* الإجراءات */}
                      <TableCell>
                        <div className="flex items-center justify-center gap-0.5">
                          <ActionButton icon={Eye} title="عرض التفاصيل" onClick={() => openDetail(r)} />
                          <ActionButton icon={Pencil} title="تعديل البيانات" onClick={() => openEdit(r)} />
                          <ActionButton
                            icon={LogIn}
                            title="دخول كمالك المحل"
                            tone="amber"
                            busy={busyId === r.id}
                            onClick={() => handleImpersonate(r.id)}
                          />
                          <ActionButton
                            icon={r.status === 'suspended' ? Play : Pause}
                            title={r.status === 'suspended' ? 'تفعيل المحل' : 'إيقاف المحل'}
                            busy={busyId === r.id}
                            onClick={() => handleToggleStatus(r)}
                          />
                          <ActionButton
                            icon={Trash2}
                            title="حذف (إلغاء) المحل"
                            tone="rose"
                            busy={busyId === r.id}
                            onClick={() => setDeleteRow(r)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* تذييل الجدول */}
            <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3 text-amber-500" />
                اضغط على أي صف لعرض التفاصيل الكاملة
              </span>
              <span className="tabular-nums">
                عرض {num(shown.length)} من {num(rows.length)} محل
              </span>
            </div>
          </div>

          {/* ── بطاقات الموبايل/التابلت (< lg) ── */}
          <div className="animate-in-up stagger-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {shown.map((r, i) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(r)}
                onKeyDown={(e) => e.key === 'Enter' && openDetail(r)}
                className="animate-in-up group rounded-2xl border bg-card p-3.5 shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                {/* رأس البطاقة: أفاتار + اسم + حالة */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TenantAvatar name={r.shopName} status={r.status} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-tight">{r.shopName}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <PlanPill code={r.planCode} name={r.planName} />
                      </div>
                    </div>
                  </div>
                  <StatusPill status={r.status} size="xs" />
                </div>

                {/* الاشتراك + التواصل */}
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-border/60 pt-2.5">
                  <SubCountdown row={r} />
                  <div className="min-w-0 text-end">
                    <p className="truncate text-[10px] text-muted-foreground" dir="ltr">
                      {r.ownerEmail ?? '—'}
                    </p>
                    {(r.ownerPhone ?? r.phone) && (
                      <a
                        href={`tel:${r.ownerPhone ?? r.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                        dir="ltr"
                      >
                        <Phone className="size-3" />
                        {r.ownerPhone ?? r.phone}
                      </a>
                    )}
                  </div>
                </div>

                {/* ميتا: فريق + آخر دخول */}
                <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-border/60 pt-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 rounded-lg bg-muted/50 py-1.5">
                    <Users className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-bold tabular-nums">{num(r.usersCount)} مستخدم</span>
                  </div>
                  <div className="flex items-center justify-center gap-1 rounded-lg bg-muted/50 py-1.5">
                    <Clock className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold">
                      {relativeLastLogin(r.lastLoginAt)}
                    </span>
                  </div>
                </div>

                {/* الإجراءات */}
                <div className="mt-2.5 flex items-center justify-end gap-0.5 border-t border-border/60 pt-2.5">
                  <ActionButton icon={Eye} title="التفاصيل" onClick={() => openDetail(r)} size="sm" />
                  <ActionButton icon={Pencil} title="تعديل" onClick={() => openEdit(r)} size="sm" />
                  <ActionButton
                    icon={LogIn}
                    title="دخول كمالك"
                    tone="amber"
                    size="sm"
                    busy={busyId === r.id}
                    onClick={() => handleImpersonate(r.id)}
                  />
                  <ActionButton
                    icon={r.status === 'suspended' ? Play : Pause}
                    title={r.status === 'suspended' ? 'تفعيل' : 'إيقاف'}
                    size="sm"
                    busy={busyId === r.id}
                    onClick={() => handleToggleStatus(r)}
                  />
                  <ActionButton
                    icon={Trash2}
                    title="حذف"
                    tone="rose"
                    size="sm"
                    busy={busyId === r.id}
                    onClick={() => setDeleteRow(r)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═════════════ 5. الدايلوجات ═════════════ */}
      {detailOpen && detailId && (
        <TenantDetailDialog
          id={detailId}
          open={detailOpen}
          onOpenChange={(o) => {
            setDetailOpen(o)
            if (!o) setDetailId(null)
          }}
        />
      )}

      {editOpen && editRow && (
        <EditTenantDialog
          row={editRow}
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o)
            if (!o) setEditRow(null)
          }}
          onSaved={() => load(true)}
        />
      )}

      <AddTenantDialog
        plans={plans}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => load(true)}
      />

      {/* تأكيد الحذف */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400">
                <Trash2 className="size-4" />
              </span>
              تأكيد حذف المحل
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إلغاء «{deleteRow?.shopName}» وتعطيل جميع اشتراكاته. لن يتم حذف البيانات فعلياً —
              هذا الإجراء قابل للتراجع بتفعيل المحل يدوياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-600/90"
            >
              <Trash2 className="size-4" />
              نعم، احذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ═══════════════════════════ دايلوج التفاصيل ═══════════════════════════ */

function TenantDetailDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [data, setData] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [notes, setNotes] = React.useState('')
  const [savingNotes, setSavingNotes] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<any>(`/api/admin/tenants/${id}`)
      setData(d)
      setNotes(d.adminNotes ?? '')
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      await api(`/api/admin/tenants/${id}`, {
        method: 'PUT',
        body: { adminNotes: notes },
      })
      toast.success('تم حفظ الملاحظات')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSavingNotes(false)
    }
  }

  const detailStats: Array<{ icon: LucideIcon; label: string; value: string; color: string }> = data
    ? [
        { icon: Boxes, label: 'المنتجات', value: num(data.stats.productsCount), color: '#f59e0b' },
        { icon: ReceiptText, label: 'إجمالي المبيعات', value: num(data.stats.salesCount), color: '#0ea5e9' },
        { icon: Users, label: 'المستخدمين', value: num(data.stats.usersCount), color: '#8b5cf6' },
        { icon: Wallet, label: 'رصيد الخزنة', value: formatCurrency(data.stats.cashBalance), color: '#10b981' },
        { icon: ShoppingBag, label: 'مبيعات ٣٠ يوم', value: formatCurrency(data.stats.last30Sales), color: '#14b8a6' },
        { icon: TrendingUp, label: 'أرباح ٣٠ يوم', value: formatCurrency(data.stats.last30Profit), color: '#ec4899' },
      ]
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-3xl max-h-[92dvh] gap-0 p-0">
        {/* عنوان مخفي لقارئات الشاشة (الرأس المرئي مخصص بالكامل) */}
        <DialogTitle className="sr-only">تفاصيل المحل</DialogTitle>
        <DialogDescription className="sr-only">
          معلومات شاملة عن المحل واشتراكاته وفريقه
        </DialogDescription>
        {loading || !data ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <>
            {/* شريط الرأس — أفاتار + هوية المحل */}
            <div
              className="relative overflow-hidden border-b px-5 pb-4 pt-5 sm:px-6"
              style={{
                background:
                  'radial-gradient(420px 160px at 100% 0%, rgba(245,158,11,0.15), transparent), radial-gradient(320px 140px at 0% 100%, rgba(249,115,22,0.10), transparent)',
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  backgroundImage: 'radial-gradient(rgba(245,158,11,0.16) 1px, transparent 1.2px)',
                  backgroundSize: '14px 14px',
                  maskImage: 'linear-gradient(to left, black, transparent 70%)',
                  WebkitMaskImage: 'linear-gradient(to left, black, transparent 70%)',
                }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3.5">
                  <TenantAvatar name={data.shopName} status={data.status} size="xl" />
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-extrabold leading-tight">{data.shopName}</h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                      {data.ownerEmail ?? '—'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusPill status={data.status} />
                      <PlanPill code={data.subscriptions[0]?.plan?.code ?? '-'} name={data.subscriptions[0]?.plan?.name ?? 'بدون باقة'} />
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <CalendarDays className="size-3" />
                        انضم {formatShortDate(data.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded-lg border bg-background/70 px-2 py-1 font-mono text-[10px] text-muted-foreground" dir="ltr">
                  {data.invoicePrefix}-•••
                </span>
              </div>
            </div>

            <DialogBody className="space-y-5 px-5 py-4 sm:px-6">
              {/* أرقام المحل */}
              <section>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-extrabold">
                  <Activity className="size-4 text-amber-600 dark:text-amber-400" />
                  أرقام المحل
                </h3>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {detailStats.map((s) => (
                    <div
                      key={s.label}
                      className="relative overflow-hidden rounded-xl border bg-card p-3"
                      style={{ borderTopColor: s.color, borderTopWidth: 2 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
                        <span
                          className="grid size-6 place-items-center rounded-lg"
                          style={{ backgroundColor: `${s.color}18`, color: s.color }}
                        >
                          <s.icon className="size-3" />
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-extrabold tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* بيانات التواصل */}
              <section>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-extrabold">
                  <MapPin className="size-4 text-amber-600 dark:text-amber-400" />
                  بيانات التواصل
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <InfoTile icon={Phone} label="الهاتف" value={data.phone ?? data.ownerPhone ?? '—'} dir="ltr" />
                  <InfoTile icon={Mail} label="بريد المالك" value={data.ownerEmail ?? '—'} dir="ltr" />
                  <InfoTile icon={MapPin} label="العنوان" value={data.address ?? '—'} className="sm:col-span-2" />
                </div>
              </section>

              {/* سجل الاشتراكات */}
              <section>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-extrabold">
                  <ReceiptText className="size-4 text-amber-600 dark:text-amber-400" />
                  سجل الاشتراكات ({data.subscriptions.length})
                </h3>
                <div className="max-h-56 overflow-y-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs">الباقة</TableHead>
                        <TableHead className="text-xs">الفترة</TableHead>
                        <TableHead className="text-xs">البداية</TableHead>
                        <TableHead className="text-xs">النهاية</TableHead>
                        <TableHead className="text-xs">المبلغ</TableHead>
                        <TableHead className="text-xs">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.subscriptions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-5 text-center text-muted-foreground">
                            لا توجد اشتراكات
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.subscriptions.map((s: any) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-xs font-semibold">{s.plan.name}</TableCell>
                            <TableCell className="text-xs">
                              {s.period === 'monthly' ? 'شهري' : s.period === 'yearly' ? 'سنوي' : 'تجريبي'}
                            </TableCell>
                            <TableCell className="text-xs">{formatShortDate(s.startDate)}</TableCell>
                            <TableCell className="text-xs">{formatShortDate(s.endDate)}</TableCell>
                            <TableCell className="text-xs font-semibold tabular-nums">
                              {formatCurrency(s.amountPaid)}
                            </TableCell>
                            <TableCell>
                              <StatusPill status={s.status} size="xs" />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {/* الفريق */}
              <section>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-extrabold">
                  <Users className="size-4 text-amber-600 dark:text-amber-400" />
                  الفريق ({data.users.length})
                </h3>
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {data.users.map((u: any) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2"
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-xs font-bold text-white',
                          AVATAR_GRADIENTS[gradientIndexOf(u.name)],
                        )}
                      >
                        <span className="absolute inset-0 rounded-lg bg-gradient-to-tr from-white/0 to-white/20" />
                        <span className="relative">{initialsOf(u.name)}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold">{u.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground" dir="ltr">
                          {u.email}
                        </p>
                      </div>
                      <Badge
                        variant={u.role === 'SUPER_ADMIN' ? 'gradient' : u.role === 'ADMIN' ? 'warning' : 'secondary'}
                        size="sm"
                      >
                        {u.role === 'ADMIN' ? 'مدير' : u.role === 'SUPER_ADMIN' ? 'أدمن أعلى' : 'موظف'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>

              {/* ملاحظات إدارية */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold">
                  <Crown className="size-4 text-amber-600 dark:text-amber-400" />
                  ملاحظات إدارية
                </h3>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات داخلية للأدمن فقط — لا يراها أصحاب المحل..."
                  rows={3}
                  className="rounded-xl"
                />
                <Button
                  size="sm"
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="mt-2 gap-1.5"
                >
                  {savingNotes ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  حفظ الملاحظات
                </Button>
              </section>
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoTile({
  icon: Icon,
  label,
  value,
  dir,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string
  dir?: 'ltr' | 'rtl'
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2.5', className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-semibold" dir={dir}>
          {value}
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════ دايلوج التعديل ═══════════════════════════ */

function EditTenantDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: TenantRow
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [shopName, setShopName] = React.useState(row.shopName)
  const [phone, setPhone] = React.useState(row.ownerPhone ?? row.phone ?? '')
  const [address, setAddress] = React.useState(row.address ?? '')
  const [status, setStatus] = React.useState(row.status)
  const [ownerEmail, setOwnerEmail] = React.useState(row.ownerEmail ?? '')
  const [adminNotes, setAdminNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setShopName(row.shopName)
    setPhone(row.ownerPhone ?? row.phone ?? '')
    setAddress(row.address ?? '')
    setStatus(row.status)
    setOwnerEmail(row.ownerEmail ?? '')
  }, [row])

  React.useEffect(() => {
    if (open) {
      api<any>(`/api/admin/tenants/${row.id}`)
        .then((d) => setAdminNotes(d.adminNotes ?? ''))
        .catch(() => {})
    }
  }, [open, row.id])

  const save = async () => {
    setSaving(true)
    try {
      await api(`/api/admin/tenants/${row.id}`, {
        method: 'PUT',
        body: {
          shopName,
          phone,
          address,
          status,
          ownerEmail,
          ownerPhone: phone,
          adminNotes,
        },
      })
      toast.success('تم تحديث بيانات المحل')
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-lg">
        {/* رأس بسيط بأفاتار */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <TenantAvatar name={row.shopName} size="lg" />
            <span>
              تعديل بيانات المحل
              <span className="block text-xs font-normal text-muted-foreground">{row.shopName}</span>
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Store className="size-3.5 text-muted-foreground" />
              اسم المحل
            </Label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} className="rounded-xl" />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" />
                بريد المالك
              </Label>
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                dir="ltr"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone className="size-3.5 text-muted-foreground" />
                الهاتف
              </Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted-foreground" />
              العنوان
            </Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="suspended">موقوف</SelectItem>
                <SelectItem value="expired">منتهي</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Crown className="size-3.5 text-muted-foreground" />
              ملاحظات إدارية
            </Label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="ملاحظات داخلية..."
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="gap-1.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-orange-500"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" />
            حفظ التعديلات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════ دايلوج الإضافة ═══════════════════════════ */

function AddTenantDialog({
  plans,
  open,
  onOpenChange,
  onSaved,
}: {
  plans: Plan[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [shopName, setShopName] = React.useState('')
  const [ownerEmail, setOwnerEmail] = React.useState('')
  const [ownerPhone, setOwnerPhone] = React.useState('')
  const [planId, setPlanId] = React.useState<string>('')
  const [period, setPeriod] = React.useState<'monthly' | 'yearly' | 'trial'>('monthly')
  const [saving, setSaving] = React.useState(false)
  const [result, setResult] = React.useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setShopName('')
      setOwnerEmail('')
      setOwnerPhone('')
      const defaultPlan =
        plans.find((p) => p.code === 'electronics-pro') ??
        plans.find((p) => p.code === 'electronics-basic') ??
        plans.find((p) => p.code === 'pro') ??
        plans[0]
      setPlanId(defaultPlan?.id?.toString() ?? '')
      setPeriod('monthly')
      setResult(null)
      setCopied(false)
    }
  }, [open, plans])

  const save = async () => {
    if (!shopName || !ownerEmail || !planId) {
      toast.error('يرجى تعبئة جميع الحقول المطلوبة')
      return
    }
    setSaving(true)
    try {
      const data = await api<{ user: { email: string; password: string } }>(
        '/api/admin/tenants',
        {
          method: 'POST',
          body: {
            shopName,
            ownerEmail,
            ownerPhone,
            planId: Number(planId),
            period,
          },
        }
      )
      setResult(data.user)
      toast.success('تم إنشاء المحل بنجاح')
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإنشاء')
    } finally {
      setSaving(false)
    }
  }

  const copyCreds = () => {
    if (!result) return
    const text = `البريد: ${result.email}\nكلمة المرور: ${result.password}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('تم نسخ البيانات')
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedPlan = plans.find((p) => p.id.toString() === planId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-lg">
        {result ? (
          /* ── نجاح الإنشاء: بطاقة بيانات الدخول ── */
          <div className="space-y-4">
            <DialogTitle className="sr-only">تم إنشاء المحل بنجاح</DialogTitle>
            <div className="flex flex-col items-center pt-2 text-center">
              <span className="relative grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
                <span className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/0 to-white/25" />
                <CheckCircle2 className="relative size-8" strokeWidth={2.2} />
              </span>
              <h3 className="mt-3 text-base font-extrabold">تم إنشاء «{shopName}» بنجاح</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                انسخ بيانات الدخول الآن — كلمة المرور تظهر مرة واحدة فقط.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Mail className="size-4" />
                    البريد
                  </span>
                  <span dir="ltr" className="font-mono text-sm font-bold">
                    {result.email}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <User className="size-4" />
                    كلمة المرور
                  </span>
                  <span dir="ltr" className="font-mono text-sm font-extrabold tracking-wider">
                    {result.password}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full gap-1.5"
                onClick={copyCreds}
              >
                {copied ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                {copied ? 'تم النسخ!' : 'نسخ بيانات الدخول'}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShopName('')
                  setOwnerEmail('')
                  setOwnerPhone('')
                  setResult(null)
                }}
              >
                <Plus className="size-4" />
                محل آخر
              </Button>
              <Button className="flex-1" onClick={() => onOpenChange(false)}>
                تم
              </Button>
            </div>
          </div>
        ) : (
          /* ── نموذج الإنشاء ── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-md shadow-amber-500/25">
                  <Plus className="size-5" strokeWidth={2.4} />
                </span>
                إضافة محل جديد
              </DialogTitle>
              <DialogDescription className="pt-1.5">
                سيتم إنشاء المحل + حساب مالك + اشتراك مبدئي. كلمة المرور ستظهر مرة واحدة بعد الإنشاء.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Store className="size-3.5 text-muted-foreground" />
                  اسم المحل <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="مثال: محل النور للاتصالات"
                  className="rounded-xl"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-muted-foreground" />
                    بريد المالك <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@example.com"
                    dir="ltr"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Phone className="size-3.5 text-muted-foreground" />
                    الهاتف
                  </Label>
                  <Input
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    الباقة <span className="text-rose-500">*</span>
                  </Label>
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
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-muted/30 p-1">
                    {(
                      [
                        ['monthly', 'شهري'],
                        ['yearly', 'سنوي'],
                        ['trial', 'تجريبي'],
                      ] as ['monthly' | 'yearly' | 'trial', string][]
                    ).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPeriod(k)}
                        className={cn(
                          'rounded-lg py-1.5 text-xs font-bold transition-all',
                          period === k
                            ? 'bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-sm'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {selectedPlan && period !== 'trial' && (
                <div className="flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-2.5 text-xs">
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    {period === 'yearly' ? 'يُحصّل سنوياً' : 'يُحصّل شهرياً'}
                  </span>
                  <span className="font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                    {formatCurrency(
                      period === 'yearly' ? selectedPlan.priceYearly : selectedPlan.priceMonthly,
                    )}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="gap-1.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-orange-500"
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                <Plus className="size-4" />
                إنشاء المحل
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
