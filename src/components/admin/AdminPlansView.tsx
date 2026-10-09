'use client'

import * as React from 'react'
import {
  Plus, Pencil, Loader2, Save, Check, Minus, Users, Package, Building2, Factory,
  Flame, Gauge, Search, RefreshCw, Smartphone, Shirt, Clock3, CalendarDays,
  CalendarRange, LayoutGrid, Table2, MoreVertical, Power, CircleOff, Lock, Layers,
  TrendingUp, Copy, ArrowUpDown, Sparkles, DollarSign, Percent, Eye, BarChart3,
  Rows3, Rows4, Command, X, CheckCircle2, AlertTriangle,
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/* ══════════════════════════════════════════════════════════════════
   غرفة تحكم الباقات — هوية 2026
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
  isCanonical?: boolean
}

function parseFeatures(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join('\n')
    return raw
  } catch { return raw }
}

const CAPABILITIES_META: { key: string; label: string; desc: string }[] = [
  { key: 'multi_unit',       label: 'وحدات الجملة (دستة)',    desc: 'بيع بالجملة — نص دستة / دستة / كرتونة. لو حاب تبيع بلقطعة، ضيف وحدة factor=1.' },
  { key: 'collections',      label: 'الكوليكشن',              desc: 'تجميع المنتجات في كوليكشنات وخصم جماعي' },
  { key: 'variants',         label: 'الأشكال/المقاسات (Variants)', desc: 'إدارة منتجات بأشكال أو مقاسات متعددة (ألوان/مقاسات) + المساعد الذكي — متاحة في كل باقات الملابس.' },
  { key: 'returns_exchange', label: 'المرتجعات والاستبدال',    desc: 'تسجيل مرتجعات واستبدال الفواتير' },
  { key: 'loyalty',          label: 'نقاط الولاء',            desc: 'تجميع واستبدال نقاط ولاء العملاء' },
]

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
  { key: 'finance',    label: 'المعاملات المالية', desc: 'فودافون كاش/إنستابيت/فوري — إلكترونيات فقط', electronicsOnly: true },
  { key: 'expenses',   label: 'المصروفات',        desc: 'مصروفات المحل (إيجار، مرتبات، كهرباء)' },
  { key: 'cash',       label: 'الخزنة',           desc: 'حركات الخزنة (نقدية)' },
]

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

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function logNorm(v: number): number {
  if (v >= 999999) return 1
  if (v <= 1) return 0.07
  return Math.min(1, Math.max(0.07, Math.log10(v) / Math.log10(5000)))
}

/* ══════════════════════════════════════════════════════════════════ */
const THEME_CSS = `
.pl-root{
  --pl-bg:#fafafa; --pl-surface:#ffffff; --pl-surface-2:#f4f4f5; --pl-surface-3:#e4e4e7;
  --pl-ink:#18181b; --pl-ink-2:#3f3f46; --pl-muted:#71717a;
  --pl-line:rgba(24,24,27,.09); --pl-line-strong:rgba(24,24,27,.18);
  --pl-a:#dc2626; --pl-a-2:#e11d48; --pl-a-soft:rgba(220,38,38,.09);
  --pl-copper:#b45309; --pl-copper-soft:rgba(180,83,9,.11);
  --pl-good:#059669; --pl-warn:#d97706; --pl-info:#0284c7;
  --pl-steel-1:#18181b; --pl-steel-2:#27272a; --pl-steel-3:#3f3f46;
  --pl-glow:rgba(220,38,38,.14);
  --pl-shadow-sm:0 1px 2px rgba(24,24,27,.05);
  --pl-shadow:0 2px 6px -1px rgba(24,24,27,.08),0 1px 2px rgba(24,24,27,.04);
  --pl-shadow-lg:0 12px 32px -8px rgba(24,24,27,.14),0 4px 8px -2px rgba(24,24,27,.06);
}
.dark .pl-root{
  --pl-bg:#09090b; --pl-surface:#18181b; --pl-surface-2:#27272a; --pl-surface-3:#3f3f46;
  --pl-ink:#fafafa; --pl-ink-2:#d4d4d8; --pl-muted:#a1a1aa;
  --pl-line:rgba(250,250,250,.09); --pl-line-strong:rgba(250,250,250,.18);
  --pl-a:#f87171; --pl-a-2:#fb7185; --pl-a-soft:rgba(248,113,113,.13);
  --pl-copper:#fbbf24; --pl-copper-soft:rgba(251,191,36,.13);
  --pl-good:#34d399; --pl-warn:#fbbf24; --pl-info:#38bdf8;
  --pl-steel-1:#fafafa; --pl-steel-2:#e4e4e7; --pl-steel-3:#a1a1aa;
  --pl-glow:rgba(248,113,113,.22);
  --pl-shadow-sm:0 1px 2px rgba(0,0,0,.4);
  --pl-shadow:0 2px 6px -1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.3);
  --pl-shadow-lg:0 12px 32px -8px rgba(0,0,0,.6),0 4px 8px -2px rgba(0,0,0,.4);
}
.pl-root{color:var(--pl-ink)}
.pl-panel{background:var(--pl-surface);border:1px solid var(--pl-line);border-radius:16px;color:var(--pl-ink);box-shadow:var(--pl-shadow-sm)}
.pl-muted{color:var(--pl-muted)}
.pl-ink-2{color:var(--pl-ink-2)}

.pl-grid{
  background-image:
    linear-gradient(var(--pl-line) 1px,transparent 1px),
    linear-gradient(90deg,var(--pl-line) 1px,transparent 1px);
  background-size:24px 24px;
}
.pl-grid-dark{
  background-image:
    linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
  background-size:24px 24px;
}

.pl-grad{background:linear-gradient(90deg,var(--pl-a),var(--pl-a-2));-webkit-background-clip:text;background-clip:text;color:transparent}

@keyframes pl-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.pl-rise{animation:pl-rise .4s cubic-bezier(.2,.8,.2,1) both}
@keyframes pl-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pl-bar{transform-origin:right center;animation:pl-grow .8s cubic-bezier(.2,.8,.2,1) both}
@keyframes pl-pulse{0%,100%{opacity:1}50%{opacity:.4}}
.pl-pulse{animation:pl-pulse 2s ease-in-out infinite}

@media (prefers-reduced-motion:reduce){
  .pl-rise,.pl-bar,.pl-pulse{animation:none}
}
`

function HazardTape({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: light
          ? 'repeating-linear-gradient(-45deg, rgba(220,38,38,.85) 0 6px, rgba(244,244,245,.92) 6px 12px)'
          : 'repeating-linear-gradient(-45deg, rgba(220,38,38,.85) 0 6px, rgba(24,24,27,.92) 6px 12px)',
      }}
    />
  )
}

function TierPlate({ tier, size = 'md', className }: { tier: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'lg' ? 'size-11' : size === 'sm' ? 'size-6' : 'size-8'
  const txt = size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-[8px]' : 'text-[10.5px]'
  const n = String(tier + 1).padStart(2, '0')
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 text-white shadow-sm ring-1 ring-inset ring-white/10',
        box, className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg"
        style={{ background: 'repeating-linear-gradient(-45deg, rgba(220,38,38,.7) 0 3px, transparent 3px 6px)', opacity: 0.5, mixBlendMode: 'overlay' }}
      />
      <span className={cn('relative font-mono font-black leading-none tabular-nums', txt)}>{n}</span>
    </span>
  )
}

function SteelTag({
  children, tone = 'steel', className,
}: {
  children: React.ReactNode
  tone?: 'steel' | 'red' | 'copper' | 'good' | 'zinc' | 'dark'
  className?: string
}) {
  const tones = {
    steel: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600/60 dark:bg-zinc-800 dark:text-zinc-300',
    red: 'border-red-300/80 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-300',
    copper: 'border-amber-600/30 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300',
    good: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-300',
    zinc: 'border-border bg-muted text-muted-foreground',
    dark: 'border-white/15 bg-white/[0.07] text-zinc-200',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-none', tones[tone], className)}>
      {children}
    </span>
  )
}

function LiveDot({ tone = 'good' }: { tone?: 'good' | 'warn' | 'off' | 'red' }) {
  const c = tone === 'good' ? 'var(--pl-good)' : tone === 'warn' ? 'var(--pl-warn)' : tone === 'red' ? 'var(--pl-a)' : 'var(--pl-muted)'
  return (
    <span className="relative inline-flex size-1.5 shrink-0">
      {tone === 'good' && <span className="absolute inline-flex size-full rounded-full opacity-50 pl-pulse" style={{ background: c }} />}
      <span className="relative inline-flex size-1.5 rounded-full" style={{ background: c }} />
    </span>
  )
}

function Sparkline({ values, tone = 'var(--pl-a)' }: { values: number[]; tone?: string }) {
  if (values.length < 2) return <div className="h-6 w-full" />
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const rng = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${22 - ((v - min) / rng) * 20}`).join(' ')
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <defs>
        <linearGradient id="pl-spk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity={0.35} />
          <stop offset="100%" stopColor={tone} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,24 ${pts} 100,24`} fill="url(#pl-spk)" />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════ */
type Billing = 'monthly' | 'yearly'
type ViewMode = 'gallery' | 'matrix'
type TypeFilter = 'all' | 'electronics' | 'fashion'
type StatusFilter = 'all' | 'active' | 'inactive'
type SortKey = 'default' | 'subs' | 'revenue' | 'price-asc' | 'price-desc' | 'name'

export function AdminPlansView() {
  const [plans, setPlans] = React.useState<PlanRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [editPlan, setEditPlan] = React.useState<PlanRow | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [duplicating, setDuplicating] = React.useState(false)

  const [billing, setBilling] = React.useState<Billing>('monthly')
  const [viewMode, setViewMode] = React.useState<ViewMode>('gallery')
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [sortKey, setSortKey] = React.useState<SortKey>('default')
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable')
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const searchRef = React.useRef<HTMLInputElement>(null)

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

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault(); searchRef.current?.focus()
      }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); setAddOpen(true)
      }
      if (e.key === 'Escape') setSelectedIds(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const stats = React.useMemo(() => {
    const totalSubs = plans.reduce((s, p) => s + p.subscribersCount, 0)
    const active = plans.filter((p) => p.isActive)
    const canonical = plans.filter((p) => p.isCanonical).length
    const custom = plans.length - canonical
    const topPlan = totalSubs > 0
      ? plans.reduce((a, b) => (b.subscribersCount > a.subscribersCount ? b : a), plans[0])
      : null
    const mrr = plans.reduce((s, p) => s + p.priceMonthly * p.subscribersCount, 0)
    const arr = mrr * 12
    const arpu = totalSubs > 0 ? Math.round(mrr / totalSubs) : 0
    const priced = active.filter((p) => p.priceMonthly > 0)
    const avgMonthly = priced.length ? Math.round(priced.reduce((s, p) => s + p.priceMonthly, 0) / priced.length) : 0
    const priceMin = priced.length ? Math.min(...priced.map((p) => p.priceMonthly)) : 0
    const priceMax = priced.length ? Math.max(...priced.map((p) => p.priceMonthly)) : 0
    return {
      totalSubs, activeCount: active.length, canonical, custom, topPlan,
      mrr, arr, arpu, avgMonthly, priceMin, priceMax,
      electronics: plans.filter((p) => (p.businessType ?? 'electronics') === 'electronics').length,
      fashion: plans.filter((p) => p.businessType === 'fashion').length,
      maxSubs: plans.reduce((m, p) => Math.max(m, p.subscribersCount), 0),
    }
  }, [plans])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const arr = plans.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && (p.businessType ?? 'electronics') !== typeFilter) return false
      if (statusFilter === 'active' && !p.isActive) return false
      if (statusFilter === 'inactive' && p.isActive) return false
      return true
    })
    const sorted = [...arr]
    switch (sortKey) {
      case 'subs': sorted.sort((a, b) => b.subscribersCount - a.subscribersCount); break
      case 'revenue': sorted.sort((a, b) => (b.priceMonthly * b.subscribersCount) - (a.priceMonthly * a.subscribersCount)); break
      case 'price-asc': sorted.sort((a, b) => a.priceMonthly - b.priceMonthly); break
      case 'price-desc': sorted.sort((a, b) => b.priceMonthly - a.priceMonthly); break
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar')); break
      default: sorted.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    }
    return sorted
  }, [plans, search, typeFilter, statusFilter, sortKey])

  const hasFilters = search.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all' || sortKey !== 'default'
  const clearFilters = () => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setSortKey('default') }

  const patchPlan = async (p: PlanRow, patch: Partial<PlanRow>) => {
    setPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
    try {
      await api(`/api/admin/plans/${p.id}`, { method: 'PUT', body: patch })
    } catch (e: any) {
      setPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...pick(p, Object.keys(patch)) } : x)))
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const r = await api<{ ok?: boolean; message?: string }>(`/api/admin/plans/${deleteId}`, { method: 'DELETE' })
      toast.success(r?.message || 'تم إلغاء تفعيل الباقة')
      setDeleteId(null); load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally { setDeleting(false) }
  }

  const quickToggleActive = async (p: PlanRow) => {
    await patchPlan(p, { isActive: !p.isActive })
    toast.success(!p.isActive ? `تم تفعيل «${p.name}»` : `تم تعطيل «${p.name}»`)
  }

  const duplicatePlan = async (p: PlanRow) => {
    setDuplicating(true)
    try {
      await api('/api/admin/plans', {
        method: 'POST',
        body: {
          code: `${p.code}-copy-${Date.now().toString(36).slice(-4)}`,
          name: `${p.name} (نسخة)`,
          description: p.description,
          businessType: p.businessType ?? 'electronics',
          priceMonthly: p.priceMonthly,
          priceYearly: p.priceYearly,
          maxUsers: p.maxUsers,
          maxProducts: p.maxProducts,
          maxBranches: p.maxBranches,
          trialDays: p.trialDays,
          features: parseFeatures(p.features),
          capabilities: parseCaps(p.capabilities),
          enabledModules: parseCaps(p.enabledModules),
          sortOrder: (p.sortOrder ?? 0) + 1,
          isActive: false,
        },
      })
      toast.success('تم نسخ الباقة — عطّلها افتراضيًا')
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل النسخ')
    } finally { setDuplicating(false) }
  }

  const allSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id))
  const someSelected = selectedIds.size > 0

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map((p) => p.id)))
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  const bulkToggleActive = async (active: boolean) => {
    const targets = plans.filter((p) => selectedIds.has(p.id))
    if (targets.length === 0) return
    setPlans((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, isActive: active } : p)))
    try {
      await Promise.all(targets.map((p) => api(`/api/admin/plans/${p.id}`, { method: 'PUT', body: { isActive: active } })))
      toast.success(`تم ${active ? 'تفعيل' : 'تعطيل'} ${targets.length} باقة`)
      setSelectedIds(new Set())
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث الجماعي')
      load(true)
    }
  }

  const deletePlan = plans.find((p) => p.id === deleteId) ?? null
  const noData = !loading && plans.length === 0

  return (
    <div className="pl-root space-y-4 pb-24" dir="rtl">
      <style>{THEME_CSS}</style>

      {/* ═══ الهيرو — Bento Grid ═══ */}
      <section className="pl-rise relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-50 shadow-[0_8px_32px_-8px_rgba(0,0,0,.4)] dark:border-zinc-800">
        <HazardTape className="absolute inset-x-0 top-0 h-[3px]" />
        <div aria-hidden className="pl-grid-dark pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(600px 260px at 92% -10%, rgba(220,38,38,.28), transparent 60%)' }}
        />

        <div className="relative p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg shadow-red-900/30 ring-1 ring-inset ring-white/15">
                <Factory className="size-5" strokeWidth={2.2} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-extrabold leading-tight sm:text-xl">غرفة تحكم الباقات</h1>
                  <SteelTag tone="dark"><LiveDot /> مباشر</SteelTag>
                </div>
                <p className="mt-0.5 text-[11.5px] text-zinc-400">
                  إدارة الأسعار والحدود والقدرات · اختصارات: <kbd className="rounded border border-white/15 bg-white/[.06] px-1 font-mono text-[9.5px]">/</kbd> للبحث
                  · <kbd className="rounded border border-white/15 bg-white/[.06] px-1 font-mono text-[9.5px]">N</kbd> باقة جديدة
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setAddOpen(true)}
                className="gap-1.5 rounded-xl bg-gradient-to-b from-red-600 to-red-700 text-white shadow-lg shadow-red-900/40 hover:from-red-500 hover:to-red-600"
              >
                <Plus className="size-4" strokeWidth={2.5} />
                باقة جديدة
              </Button>
              <Button
                variant="outline" size="icon" onClick={() => load(true)} disabled={refreshing}
                aria-label="تحديث"
                className="rounded-xl border-white/15 bg-white/[.06] text-zinc-200 hover:bg-white/[.12] hover:text-white"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              </Button>
            </div>
          </div>

          {!noData && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {/* ── MRR (البطل) ── */}
              <div className="col-span-2 relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-red-950/60 via-zinc-950 to-zinc-950 p-4 sm:col-span-2 lg:col-span-2">
                <div aria-hidden className="pl-grid-dark pointer-events-none absolute inset-0 opacity-50" />
                <div aria-hidden className="pointer-events-none absolute -top-16 -end-16 size-40 rounded-full bg-red-500/25 blur-3xl" />
                <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/70 to-transparent" />
                <div className="relative">
                  <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-red-300">
                    <DollarSign className="size-3.5" /> الإيراد الشهري المتكرر (MRR)
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="pl-grad font-mono text-3xl font-black leading-none tabular-nums sm:text-4xl">
                      {num(stats.mrr)}
                    </span>
                    <span className="text-xs font-bold text-zinc-400">ج.م</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-zinc-400">
                    <span>سنويًا <b className="font-mono text-zinc-200">{num(stats.arr)}</b></span>
                    <span className="size-1 rounded-full bg-zinc-600" />
                    <span>ARPU <b className="font-mono text-zinc-200">{num(stats.arpu)}</b></span>
                  </div>
                  <div className="mt-3">
                    <Sparkline values={[3, 5, 4, 7, 6, 9, stats.mrr > 0 ? stats.mrr / 100 : 8]} tone="#fb7185" />
                  </div>
                </div>
              </div>

              {/* ── إجمالي المشتركين ── */}
              <BentoStat
                icon={Users}
                label="إجمالي المشتركين"
                tone="info"
                value={num(stats.totalSubs)}
                sub={`موزّعين على ${plans.length} باقة`}
                progress={stats.totalSubs > 0 ? Math.min(100, (stats.totalSubs / Math.max(1, stats.maxSubs * 3)) * 100) : 0}
              />

              {/* ── باقات نشطة ── */}
              <BentoStat
                icon={CheckCircle2}
                label="باقات نشطة"
                tone="good"
                value={num(stats.activeCount)}
                sub={`قياسي ${stats.canonical} · مخصّص ${stats.custom}`}
                progress={plans.length > 0 ? (stats.activeCount / plans.length) * 100 : 0}
              />

              {/* ── الأكثر اشتراكًا ── */}
              {stats.topPlan && stats.topPlan.subscribersCount > 0 ? (
                <BentoStat
                  icon={Flame}
                  label="الأكثر اشتراكًا"
                  tone="copper"
                  isText
                  value={stats.topPlan.name.length > 22 ? stats.topPlan.name.slice(0, 22) + '…' : stats.topPlan.name}
                  feature={
                    <div className="flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[.08]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, Math.max(4, (stats.topPlan.subscribersCount / Math.max(1, stats.totalSubs)) * 100))}%`,
                            background: 'linear-gradient(90deg, #fb923c, rgba(251,146,60,.55))',
                          }}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-[11px] font-extrabold tabular-nums text-orange-300">
                        {num(stats.topPlan.subscribersCount)}
                      </span>
                    </div>
                  }
                  sub={
                    stats.totalSubs > 0
                      ? `${Math.round((stats.topPlan.subscribersCount / stats.totalSubs) * 100)}% من إجمالي المشتركين`
                      : undefined
                  }
                />
              ) : (
                <BentoStat
                  icon={Flame}
                  label="الأكثر اشتراكًا"
                  tone="zinc"
                  isText
                  value="—"
                  sub="لا يوجد مشتركون بعد"
                />
              )}
            </div>
          )}

          {!noData && stats.totalSubs > 0 && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.03] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300">
                  <BarChart3 className="size-3.5 text-red-400" />
                  توزيع المشتركين عبر الباقات
                </span>
                <span className="text-[10px] font-medium text-zinc-500">الترتيب: الأكثر اشتراكًا أولاً</span>
              </div>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                {[...plans].sort((a, b) => b.subscribersCount - a.subscribersCount).map((p, i) => {
                  const w = (p.subscribersCount / stats.totalSubs) * 100
                  if (w <= 0) return null
                  return (
                    <div
                      key={p.id}
                      title={`${p.name}: ${num(p.subscribersCount)} مشترك (${Math.round(w)}%)`}
                      className="h-full transition-all hover:brightness-125"
                      style={{
                        width: `${w}%`,
                        background: `linear-gradient(90deg, hsl(${(i * 40) % 60 + 0}, 80%, ${55 - i * 4}%), hsl(${(i * 40) % 60 + 0}, 70%, ${40 - i * 3}%))`,
                      }}
                    />
                  )
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {[...plans].sort((a, b) => b.subscribersCount - a.subscribersCount).slice(0, 4).map((p, i) => {
                  const w = stats.totalSubs > 0 ? (p.subscribersCount / stats.totalSubs) * 100 : 0
                  return (
                    <span key={p.id} className="flex items-center gap-1.5 text-[10.5px] text-zinc-400">
                      <span className="size-2 rounded-[2px]" style={{ background: `hsl(${(i * 40) % 60 + 0}, 75%, ${50 - i * 4}%)` }} />
                      <span className="font-semibold text-zinc-300">{p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name}</span>
                      <span className="font-mono tabular-nums">{Math.round(w)}%</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ شريط الأدوات ═══ */}
      {!noData && (
        <section className="pl-rise stagger-1 pl-panel p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pl-muted)]" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الكود… (اضغط / للتركيز)"
                className="h-10 rounded-xl border-[var(--pl-line)] bg-[var(--pl-surface-2)] pe-9 ps-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="مسح البحث"
                  className="absolute end-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--pl-muted)] hover:bg-[var(--pl-surface-3)]"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div role="group" aria-label="وضع الفوترة" className="inline-flex rounded-xl border border-[var(--pl-line)] bg-[var(--pl-surface-2)] p-0.5">
              {([['monthly', 'شهري', CalendarDays], ['yearly', 'سنوي', CalendarRange]] as const).map(([v, l, I]) => (
                <button
                  key={v} type="button" onClick={() => setBilling(v)} aria-pressed={billing === v}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                    billing === v
                      ? 'bg-gradient-to-b from-red-600 to-red-700 text-white shadow-sm'
                      : 'text-[var(--pl-muted)] hover:text-[var(--pl-ink)]',
                  )}
                >
                  <I className="size-3.5" /> {l}
                </button>
              ))}
            </div>

            <div role="group" aria-label="وضع العرض" className="inline-flex rounded-xl border border-[var(--pl-line)] bg-[var(--pl-surface-2)] p-0.5">
              {([['gallery', 'معرض', LayoutGrid], ['matrix', 'مواصفات', Table2]] as const).map(([v, l, I]) => (
                <button
                  key={v} type="button" onClick={() => setViewMode(v)} aria-pressed={viewMode === v}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                    viewMode === v
                      ? 'bg-gradient-to-b from-red-600 to-red-700 text-white shadow-sm'
                      : 'text-[var(--pl-muted)] hover:text-[var(--pl-ink)]',
                  )}
                >
                  <I className="size-3.5" /> {l}
                </button>
              ))}
            </div>

            {viewMode === 'gallery' && (
              <div role="group" aria-label="كثافة العرض" className="inline-flex rounded-xl border border-[var(--pl-line)] bg-[var(--pl-surface-2)] p-0.5">
                {([['comfortable', Rows3], ['compact', Rows4]] as const).map(([v, I]) => (
                  <button
                    key={v} type="button" onClick={() => setDensity(v as any)} aria-pressed={density === v}
                    aria-label={v === 'comfortable' ? 'مريح' : 'مضغوط'}
                    className={cn(
                      'inline-flex items-center rounded-lg px-2 py-1.5 text-xs font-bold transition-all',
                      density === v
                        ? 'bg-gradient-to-b from-red-600 to-red-700 text-white shadow-sm'
                        : 'text-[var(--pl-muted)] hover:text-[var(--pl-ink)]',
                    )}
                  >
                    <I className="size-3.5" />
                  </button>
                ))}
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 gap-1.5 rounded-xl border-[var(--pl-line)]">
                  <ArrowUpDown className="size-3.5" />
                  {sortKey === 'default' ? 'ترتيب' :
                   sortKey === 'subs' ? 'الأكثر اشتراكًا' :
                   sortKey === 'revenue' ? 'الأعلى إيرادًا' :
                   sortKey === 'price-asc' ? 'الأرخص أولاً' :
                   sortKey === 'price-desc' ? 'الأغلى أولاً' : 'أبجديًا'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {([
                  ['default', 'افتراضي'],
                  ['subs', 'الأكثر اشتراكًا'],
                  ['revenue', 'الأعلى إيرادًا'],
                  ['price-asc', 'السعر تصاعديًا'],
                  ['price-desc', 'السعر تنازليًا'],
                  ['name', 'أبجديًا'],
                ] as [SortKey, string][]).map(([k, l]) => (
                  <DropdownMenuItem key={k} onClick={() => setSortKey(k)} className={cn('gap-2', sortKey === k && 'bg-[var(--pl-a-soft)]')}>
                    {sortKey === k && <Check className="size-3.5" />}
                    {l}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline" size="sm"
              onClick={toggleSelectAll}
              className={cn('h-10 gap-1.5 rounded-xl border-[var(--pl-line)]', allSelected && 'border-[var(--pl-a)] bg-[var(--pl-a-soft)] text-[var(--pl-a)]')}
            >
              {allSelected ? <CheckCircle2 className="size-3.5" /> : <CircleOff className="size-3.5" />}
              {allSelected ? 'إلغاء الكل' : 'تحديد الكل'}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--pl-line)] pt-3">
            <span className="text-[10.5px] font-bold text-[var(--pl-muted)]">النوع:</span>
            {([
              ['all', 'الكل', plans.length],
              ['electronics', 'موبايل وكمبيوتر', stats.electronics],
              ['fashion', 'ملابس وأحذية', stats.fashion],
            ] as const).map(([v, l, c]) => (
              <button
                key={v} type="button" onClick={() => setTypeFilter(v)} aria-pressed={typeFilter === v}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors',
                  typeFilter === v
                    ? 'border-[var(--pl-a)] bg-[var(--pl-a)] text-white shadow-sm'
                    : 'border-[var(--pl-line)] bg-[var(--pl-surface)] text-[var(--pl-muted)] hover:border-[var(--pl-a)]/50 hover:text-[var(--pl-ink)]',
                )}
              >
                {l}
                <span className={cn('rounded-md px-1 text-[9.5px] font-black tabular-nums', typeFilter === v ? 'bg-white/20' : 'bg-[var(--pl-surface-2)]')}>{c}</span>
              </button>
            ))}

            <span className="mx-1 hidden h-4 w-px bg-[var(--pl-line)] sm:block" />
            <span className="text-[10.5px] font-bold text-[var(--pl-muted)]">الحالة:</span>
            {([['all', 'الكل'], ['active', 'مفعّلة'], ['inactive', 'معطّلة']] as const).map(([v, l]) => (
              <button
                key={v} type="button" onClick={() => setStatusFilter(v)} aria-pressed={statusFilter === v}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors',
                  statusFilter === v
                    ? 'border-[var(--pl-a)] bg-[var(--pl-a)] text-white shadow-sm'
                    : 'border-[var(--pl-line)] bg-[var(--pl-surface)] text-[var(--pl-muted)] hover:border-[var(--pl-a)]/50 hover:text-[var(--pl-ink)]',
                )}
              >
                {l}
              </button>
            ))}

            {(hasFilters || filtered.length !== plans.length) && (
              <span className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--pl-a-soft)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--pl-a)]">
                {filtered.length} / {plans.length}
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="rounded-md bg-[var(--pl-a)]/20 px-1.5 font-black">
                    مسح
                  </button>
                )}
              </span>
            )}
          </div>
        </section>
      )}

      {/* ═══ المحتوى ═══ */}
      {loading ? (
        <div className={cn('grid gap-3', density === 'compact' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4')}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="pl-panel space-y-3 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-2 w-5/6 rounded-full" />
            </div>
          ))}
        </div>
      ) : noData ? (
        <div className="pl-rise flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--pl-line-strong)] bg-[var(--pl-surface)] px-6 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg shadow-red-900/30">
            <Factory className="size-8" strokeWidth={1.8} />
          </div>
          <h3 className="mt-4 text-lg font-extrabold">لا توجد باقات بعد</h3>
          <p className="mt-1 max-w-md text-sm text-[var(--pl-muted)]">
            ابدأ بإنشاء أول باقة — سعر، حدود، مميزات، ووحدات. ستظهر هنا على الفور في المعرض.
          </p>
          <Button
            onClick={() => setAddOpen(true)}
            className="mt-4 gap-1.5 rounded-xl bg-gradient-to-b from-red-600 to-red-700 text-white shadow-lg shadow-red-900/30 hover:from-red-500 hover:to-red-600"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            أنشئ أول باقة
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="pl-rise flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--pl-line-strong)] bg-[var(--pl-surface)] px-6 py-12 text-center">
          <Search className="size-8 text-[var(--pl-muted)]/60" strokeWidth={1.6} />
          <h3 className="mt-3 text-sm font-extrabold">لا توجد نتائج مطابقة</h3>
          <p className="mt-1 text-xs text-[var(--pl-muted)]">جرّب تعديل البحث أو الفلاتر</p>
          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 gap-1.5 rounded-lg">
            مسح الفلاتر
          </Button>
        </div>
      ) : viewMode === 'gallery' ? (
        <div className={cn('grid gap-3', density === 'compact' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4')}>
          {filtered.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              tier={idx}
              billing={billing}
              totalSubs={stats.totalSubs}
              isTop={stats.topPlan?.id === p.id && p.subscribersCount > 0}
              stagger={idx}
              density={density}
              selected={selectedIds.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              onEdit={() => setEditPlan(p)}
              onDeactivate={() => setDeleteId(p.id)}
              onToggleActive={() => quickToggleActive(p)}
              onDuplicate={() => duplicatePlan(p)}
              onPatch={(patch) => patchPlan(p, patch)}
            />
          ))}
        </div>
      ) : (
        <MatrixView
          plans={filtered}
          stats={stats}
          billing={billing}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onEdit={(p) => setEditPlan(p)}
        />
      )}

      {/* ═══ شريط التحديد الجماعي ═══ */}
      {someSelected && (
        <div
          role="status" aria-live="polite"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center"
        >
          <div className="pl-rise pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-zinc-50 shadow-2xl">
            <span className="flex items-center gap-2 text-sm font-bold">
              <span className="flex size-6 items-center justify-center rounded-md bg-red-600 font-mono text-xs font-black tabular-nums">{selectedIds.size}</span>
              باقة محددة
            </span>
            <span className="ms-auto flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => bulkToggleActive(true)} className="h-8 gap-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300">
                <Power className="size-3.5" /> تفعيل
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulkToggleActive(false)} className="h-8 gap-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
                <CircleOff className="size-3.5" /> تعطيل
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="h-8 gap-1.5 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white">
                <X className="size-3.5" /> إلغاء
              </Button>
            </span>
          </div>
        </div>
      )}

      {/* ═══ الديالوقات ═══ */}
      {editPlan ? (
        <PlanDialog
          plan={editPlan}
          tier={filtered.findIndex((p) => p.id === editPlan.id)}
          open={!!editPlan}
          onOpenChange={(o) => !o && setEditPlan(null)}
          onSaved={() => load(true)}
        />
      ) : (
        <PlanDialog plan={null} open={addOpen} onOpenChange={setAddOpen} onSaved={() => load(true)} />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-red-600/10 text-red-600 dark:text-red-400">
                <AlertTriangle className="size-4" />
              </span>
              إلغاء تفعيل الباقة
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletePlan && <span className="block font-bold text-foreground">{deletePlan.name}</span>}
              سيتم تعطيل الباقة (لن تظهر للعملاء الجدد) وستستمر الاشتراكات الحالية حتى انتهائها.
              الباقات القياسية لا تُحذف نهائيًا — أما الباقات المخصّصة غير المرتبطة بأي اشتراك فتُحذف نهائيًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="gap-1.5 bg-gradient-to-b from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600"
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

/* ══════════════════════════════════════════════════════════════════
   بطاقة إحصاء Bento — مستوى 2026
   ══════════════════════════════════════════════════════════════════ */
type BentoTone = 'info' | 'good' | 'copper' | 'red' | 'violet' | 'zinc'

const BENTO_TONES: Record<BentoTone, { color: string; glow: string; edge: string; bg: string }> = {
  info:   { color: '#38bdf8', glow: 'rgba(56,189,248,.28)',  edge: 'rgba(56,189,248,.55)',  bg: 'rgba(56,189,248,.12)' },
  good:   { color: '#34d399', glow: 'rgba(52,211,153,.28)',  edge: 'rgba(52,211,153,.55)',  bg: 'rgba(52,211,153,.12)' },
  copper: { color: '#fb923c', glow: 'rgba(251,146,60,.28)',  edge: 'rgba(251,146,60,.55)',  bg: 'rgba(251,146,60,.12)' },
  red:    { color: '#f87171', glow: 'rgba(248,113,113,.28)', edge: 'rgba(248,113,113,.55)', bg: 'rgba(248,113,113,.12)' },
  violet: { color: '#a78bfa', glow: 'rgba(167,139,250,.28)', edge: 'rgba(167,139,250,.55)', bg: 'rgba(167,139,250,.12)' },
  zinc:   { color: '#a1a1aa', glow: 'rgba(161,161,170,.20)', edge: 'rgba(161,161,170,.35)', bg: 'rgba(161,161,170,.10)' },
}

function BentoStat({
  icon: Icon, label, value, sub, tone = 'info', isText = false, progress, feature,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  tone?: BentoTone
  isText?: boolean
  progress?: number | null
  feature?: React.ReactNode
}) {
  const t = BENTO_TONES[tone]
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.06] to-white/[.02] p-3.5 backdrop-blur-sm transition-all hover:border-white/20">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${t.edge}, transparent)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -end-10 size-28 rounded-full blur-2xl transition-opacity group-hover:opacity-100"
        style={{ background: t.glow, opacity: 0.65 }}
      />
      <div aria-hidden className="pl-grid-dark pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative">
        <div className="flex items-center gap-2">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg shadow-inner"
            style={{ background: t.bg, color: t.color, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${t.color} 30%, transparent)` }}
          >
            <Icon className="size-3.5" strokeWidth={2.4} />
          </span>
          <span className="truncate text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
            {label}
          </span>
        </div>

        <p
          className={cn(
            'mt-3 truncate font-black leading-none tabular-nums text-zinc-50',
            isText ? 'text-base sm:text-lg' : 'font-mono text-3xl',
          )}
          title={value}
        >
          {value}
        </p>

        {progress != null && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[.08]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.max(3, progress))}%`,
                background: `linear-gradient(90deg, ${t.color}, color-mix(in oklab, ${t.color} 55%, transparent))`,
              }}
            />
          </div>
        )}

        {feature && <div className="mt-2.5">{feature}</div>}

        {sub && <p className="mt-2 truncate text-[10.5px] font-medium text-zinc-500" title={sub}>{sub}</p>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   بطاقة الباقة
   ══════════════════════════════════════════════════════════════════ */
function PlanCard({
  plan: p, tier, billing, totalSubs, isTop, stagger, density,
  selected, onToggleSelect, onEdit, onDeactivate, onToggleActive, onDuplicate, onPatch,
}: {
  plan: PlanRow
  tier: number
  billing: Billing
  totalSubs: number
  isTop: boolean
  stagger: number
  density: 'comfortable' | 'compact'
  selected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDeactivate: () => void
  onToggleActive: () => void
  onDuplicate: () => void
  onPatch: (patch: Partial<PlanRow>) => void
}) {
  const features = parseFeatures(p.features).split('\n').filter(Boolean)
  const isFashion = (p.businessType ?? 'electronics') === 'fashion'
  const isFree = p.priceMonthly === 0 && p.priceYearly === 0
  const price = billing === 'monthly' ? p.priceMonthly : p.priceYearly
  const savings = p.priceMonthly * 12 - p.priceYearly
  const savingsPct = p.priceMonthly > 0 && savings > 0 ? Math.round((savings / (p.priceMonthly * 12)) * 100) : 0
  const share = totalSubs > 0 ? Math.max(3, (p.subscribersCount / totalSubs) * 100) : 0
  const planRevenue = p.priceMonthly * p.subscribersCount
  const compact = density === 'compact'

  const meters = [
    { icon: Users, label: 'مستخدمين', value: p.maxUsers },
    { icon: Package, label: 'منتجات', value: p.maxProducts },
    { icon: Building2, label: 'فروع', value: p.maxBranches },
  ]

  return (
    <Card
      className={cn(
        'group relative flex animate-in-up flex-col overflow-hidden rounded-2xl border-[var(--pl-line)] bg-[var(--pl-surface)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--pl-a)]/40 hover:shadow-lg',
        !p.isActive && 'opacity-70 saturate-[.6]',
        selected && 'border-[var(--pl-a)] ring-2 ring-[var(--pl-a-soft)]',
      )}
      style={{ animationDelay: `${Math.min(stagger, 8) * 40}ms` }}
    >
      {isTop && <HazardTape className="h-[3px] w-full" light />}

      <button
        type="button"
        onClick={onToggleSelect}
        aria-label={selected ? 'إلغاء التحديد' : 'تحديد'}
        aria-pressed={selected}
        className={cn(
          'absolute end-3 top-3 z-20 flex size-5 items-center justify-center rounded-md border transition-all',
          selected
            ? 'border-[var(--pl-a)] bg-[var(--pl-a)] text-white'
            : 'border-[var(--pl-line-strong)] bg-[var(--pl-surface)]/80 opacity-0 backdrop-blur group-hover:opacity-100',
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3.5} />}
      </button>

      <div className={cn('border-b border-[var(--pl-line)] bg-[var(--pl-surface-2)]/60', compact ? 'px-3 py-2.5' : 'px-4 py-3')}>
        <div className="flex items-start gap-2.5">
          <TierPlate tier={tier} size={compact ? 'sm' : 'md'} />
          <div className="min-w-0 flex-1 pe-6">
            <h3 className={cn('truncate font-extrabold leading-tight', compact ? 'text-sm' : 'text-[15px]')}>{p.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="truncate font-mono text-[10px] text-[var(--pl-muted)]" dir="ltr">{p.code}</span>
              <SteelTag tone={p.isActive ? 'good' : 'zinc'}>
                <LiveDot tone={p.isActive ? 'good' : 'off'} />
                {p.isActive ? 'مفعّلة' : 'معطّلة'}
              </SteelTag>
              {isTop && (
                <SteelTag tone="red">
                  <Flame className="size-2.5" />
                  الأكثر
                </SteelTag>
              )}
              <SteelTag tone={isFashion ? 'copper' : 'steel'}>
                {isFashion ? <Shirt className="size-2.5" /> : <Smartphone className="size-2.5" />}
                <span className="hidden sm:inline">{isFashion ? 'ملابس' : 'موبايل'}</span>
              </SteelTag>
            </div>
          </div>
        </div>
      </div>

      <div className={cn('flex flex-1 flex-col', compact ? 'gap-2 p-3' : 'gap-3 p-4')}>
        <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-center text-zinc-50">
          <div aria-hidden className="pl-grid-dark pointer-events-none absolute inset-0 opacity-60" />
          <span aria-hidden className="absolute start-2 top-2 size-2 border-s-2 border-t-2 border-red-500/70" />
          <span aria-hidden className="absolute bottom-2 end-2 size-2 border-b-2 border-e-2 border-red-500/70" />
          {isFree ? (
            <span className="relative text-2xl font-black text-red-400">مجاناً</span>
          ) : (
            <>
              <p className="relative text-[9.5px] font-bold uppercase tracking-wider text-zinc-400">
                {billing === 'monthly' ? 'شهريًا' : 'سنويًا'}
              </p>
              <p className="relative mt-0.5 flex items-baseline justify-center gap-1">
                <span className="text-3xl font-black tracking-tight text-white tabular-nums">{num(price)}</span>
                <span className="text-[10px] font-semibold text-zinc-400">ج.م</span>
              </p>
              {billing === 'yearly' && savings > 0 && p.priceMonthly > 0 && (
                <span className="relative mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                  <Percent className="size-2.5" />
                  وفّر {num(savings)} ج.م ({savingsPct}%)
                </span>
              )}
            </>
          )}
          {p.trialDays > 0 && (
            <span className="relative mt-1.5 inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[.06] px-2 py-0.5 text-[9.5px] font-bold text-zinc-300">
              <Clock3 className="size-2.5" />
              تجربة {p.trialDays} يوم
            </span>
          )}
        </div>

        {planRevenue > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-[var(--pl-line)] bg-[var(--pl-surface-2)]/60 px-2.5 py-1.5">
            <span className="text-[10.5px] font-bold text-[var(--pl-muted)]">إيراد شهري</span>
            <span className="font-mono text-sm font-extrabold tabular-nums text-[var(--pl-a)]">{num(planRevenue)} ج.م</span>
          </div>
        )}

        <div className={cn('space-y-1.5', compact && 'space-y-1')}>
          {meters.map((m) => (
            <div key={m.label} className={cn('flex items-center gap-2', compact ? 'text-[10.5px]' : 'text-[11px]')}>
              <m.icon className="size-3.5 shrink-0 text-[var(--pl-a)]" />
              <span className="w-14 shrink-0 font-semibold text-[var(--pl-muted)]">{m.label}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--pl-surface-3)]">
                <div
                  className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-red-600 to-red-500"
                  style={{ width: `${logNorm(m.value) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-end font-mono font-extrabold tabular-nums">
                {m.value >= 999999 ? '∞' : num(m.value)}
              </span>
            </div>
          ))}
        </div>

        {features.length > 0 && !compact && (
          <ul className="max-h-32 space-y-1 overflow-y-auto pe-1 text-[11.5px] leading-snug">
            {features.slice(0, 4).map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-[var(--pl-a-soft)] text-[var(--pl-a)]">
                  <Check className="size-2.5" strokeWidth={3.5} />
                </span>
                <span className="truncate">{f}</span>
              </li>
            ))}
            {features.length > 4 && (
              <li className="ps-5 text-[10.5px] font-semibold text-[var(--pl-muted)]">+{features.length - 4} ميزة إضافية</li>
            )}
          </ul>
        )}

        <div className="mt-auto space-y-2.5 border-t border-[var(--pl-line)] pt-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[var(--pl-muted)]">المشتركون</span>
            <span className="font-mono font-extrabold tabular-nums">
              {num(p.subscribersCount)}
              <span className="ms-1 font-sans font-semibold text-[var(--pl-muted)]">
                ({totalSubs > 0 ? Math.round((p.subscribersCount / totalSubs) * 100) : 0}%)
              </span>
            </span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--pl-surface-3)]">
            <div
              className="pl-bar h-full rounded-full bg-gradient-to-l from-red-600 to-red-500"
              style={{ width: `${share}%` }}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline" size="sm"
              onClick={onEdit}
              className="h-8 flex-1 gap-1.5 rounded-lg border-[var(--pl-line)] text-[11.5px] hover:border-[var(--pl-a)]/50 hover:text-[var(--pl-a)]"
            >
              <Pencil className="size-3" />
              تعديل
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="خيارات" className="size-8 rounded-lg">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="size-3.5" /> تعديل كامل
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleActive} className="gap-2">
                  <Power className="size-3.5" />
                  {p.isActive ? 'تعطيل مؤقت' : 'تفعيل الباقة'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate} disabled={duplicatingState} className="gap-2">
                  <Copy className="size-3.5" /> نسخ كباقة جديدة
                </DropdownMenuItem>
                {p.isActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDeactivate}
                      className="gap-2 text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                    >
                      <CircleOff className="size-3.5" /> إلغاء التفعيل
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

function pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: (string | number | symbol)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys as K[]) out[k] = obj[k]
  return out
}

let duplicatingState = false

/* ══════════════════════════════════════════════════════════════════
   Matrix View
   ══════════════════════════════════════════════════════════════════ */
function MatrixView({
  plans: filtered, stats, billing, selectedIds, onToggleSelect, onEdit,
}: {
  plans: PlanRow[]
  stats: { totalSubs: number }
  billing: Billing
  selectedIds: Set<number>
  onToggleSelect: (id: number) => void
  onEdit: (p: PlanRow) => void
}) {
  return (
    <div className="pl-rise stagger-2 overflow-hidden rounded-2xl border border-[var(--pl-line)] bg-[var(--pl-surface)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950 text-zinc-50">
              <th className="sticky start-0 z-10 w-40 bg-zinc-950 px-3 py-3.5 text-start text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
                وجه المقارنة
              </th>
              {filtered.map((p, i) => (
                <th key={p.id} className="min-w-[170px] px-3 pb-3 pt-3 align-top">
                  <div className="mb-2 h-1 rounded-full bg-gradient-to-l from-red-600 to-red-400" />
                  <div className="flex items-start gap-2">
                    <TierPlate tier={i} size="sm" />
                    <div className="min-w-0 flex-1 text-start">
                      <p className="truncate text-[12.5px] font-extrabold leading-tight text-white">{p.name}</p>
                      <p className="truncate font-mono text-[9.5px] text-zinc-400" dir="ltr">{p.code}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <SteelTag tone="dark">{p.isCanonical ? 'قياسي' : 'مخصّص'}</SteelTag>
                        {!p.isActive && <SteelTag tone="dark">معطّلة</SteelTag>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleSelect(p.id)}
                      aria-label={selectedIds.has(p.id) ? 'إلغاء التحديد' : 'تحديد'}
                      aria-pressed={selectedIds.has(p.id)}
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-md border transition-all',
                        selectedIds.has(p.id)
                          ? 'border-red-500 bg-red-600 text-white'
                          : 'border-white/25 hover:border-red-500/60',
                      )}
                    >
                      {selectedIds.has(p.id) && <Check className="size-3" strokeWidth={3.5} />}
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pl-line)]">
            {(
              [
                {
                  label: billing === 'monthly' ? 'السعر الشهري' : 'السعر السنوي',
                  render: (p: PlanRow) => {
                    const price = billing === 'monthly' ? p.priceMonthly : p.priceYearly
                    return price === 0 ? (
                      <span className="font-extrabold text-[var(--pl-a)]">مجاناً</span>
                    ) : (
                      <span className="font-mono text-[13px] font-extrabold tabular-nums">{formatCurrency(price)}</span>
                    )
                  },
                },
                {
                  label: 'أيام التجربة',
                  render: (p: PlanRow) => (
                    <span className="inline-flex items-center gap-1 text-xs font-bold">
                      <Clock3 className="size-3 text-[var(--pl-a)]" />
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
                        <Smartphone className="size-3 text-zinc-500" />
                      )}
                      {BUSINESS_TYPE_LABEL[p.businessType ?? 'electronics'] ?? p.businessType}
                    </span>
                  ),
                },
                { label: 'المستخدمون', render: (p: PlanRow) => (<span className="font-mono text-xs font-bold tabular-nums">{p.maxUsers >= 999999 ? '∞' : num(p.maxUsers)}</span>) },
                { label: 'المنتجات', render: (p: PlanRow) => (<span className="font-mono text-xs font-bold tabular-nums">{p.maxProducts >= 999999 ? '∞' : num(p.maxProducts)}</span>) },
                { label: 'الفروع', render: (p: PlanRow) => (<span className="font-mono text-xs font-bold tabular-nums">{p.maxBranches >= 999999 ? '∞' : num(p.maxBranches)}</span>) },
                {
                  label: 'المشتركون',
                  render: (p: PlanRow) => (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold tabular-nums">
                      {num(p.subscribersCount)}
                      <span className="relative inline-block h-1.5 w-10 overflow-hidden rounded-full bg-[var(--pl-surface-3)] align-middle">
                        <span
                          className="block h-full rounded-full bg-gradient-to-l from-red-600 to-red-500"
                          style={{ width: stats.totalSubs > 0 ? `${Math.max(4, (p.subscribersCount / stats.totalSubs) * 100)}%` : '0%' }}
                        />
                      </span>
                    </span>
                  ),
                },
                {
                  label: 'الوحدات',
                  render: (p: PlanRow) => {
                    const mods = parseCaps(p.enabledModules)
                    if (mods.length === 0) {
                      const def = (p.businessType ?? 'electronics') === 'fashion' ? FASHION_DEFAULTS : ELECTRONICS_DEFAULTS
                      return (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--pl-muted)]">
                          <Layers className="size-3" />
                          {def.length}
                          <SteelTag tone="zinc">افتراضي</SteelTag>
                        </span>
                      )
                    }
                    return (
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold">
                        <Layers className="size-3 text-[var(--pl-a)]" />
                        {mods.length}
                      </span>
                    )
                  },
                },
              ] as { label: string; render: (p: PlanRow) => React.ReactNode }[]
            ).map((row) => (
              <tr key={row.label} className="transition-colors hover:bg-[var(--pl-surface-2)]/40">
                <th scope="row" className="sticky start-0 z-10 bg-[var(--pl-surface)] px-3 py-2.5 text-start text-[11px] font-bold text-[var(--pl-muted)]">
                  {row.label}
                </th>
                {filtered.map((p) => (
                  <td key={p.id} className="px-3 py-2.5 text-center">{row.render(p)}</td>
                ))}
              </tr>
            ))}

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
                <tr key={f} className="transition-colors hover:bg-[var(--pl-surface-2)]/40">
                  <th scope="row" className="sticky start-0 z-10 max-w-[160px] truncate bg-[var(--pl-surface)] px-3 py-2 text-start text-[11px] font-semibold text-[var(--pl-muted)]" title={f}>
                    <span className="inline-flex items-center gap-1">
                      <Check className="size-3 text-[var(--pl-a)]" />
                      {f}
                    </span>
                  </th>
                  {filtered.map((p) => {
                    const has = parseFeatures(p.features).split('\n').map((x) => x.trim()).includes(f)
                    return (
                      <td key={p.id} className="px-3 py-2 text-center">
                        {has ? (
                          <span className="mx-auto flex size-5 items-center justify-center rounded-md bg-[var(--pl-a-soft)] text-[var(--pl-a)]">
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="mx-auto flex size-5 items-center justify-center rounded-md text-[var(--pl-muted)]/40">
                            <Minus className="size-3" strokeWidth={3} />
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            })()}

            <tr>
              <th scope="row" className="sticky start-0 z-10 bg-[var(--pl-surface)] px-3 py-3 text-start text-[11px] font-bold text-[var(--pl-muted)]">
                الإجراءات
              </th>
              {filtered.map((p) => (
                <td key={p.id} className="px-3 py-3 text-center">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => onEdit(p)}
                    className="gap-1.5 rounded-lg border-[var(--pl-line)] hover:border-[var(--pl-a)]/50 hover:text-[var(--pl-a)]"
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
      <p className="border-t border-[var(--pl-line)] bg-[var(--pl-surface-2)]/40 px-4 py-2 text-center text-[10px] font-medium text-[var(--pl-muted)]">
        مقارنة {filtered.length} باقة · الأسعار بالجنيه المصري · الوحدات الافتراضية محسوبة بحسب نوع النشاط
      </p>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Plan Dialog
   ══════════════════════════════════════════════════════════════════ */
function PlanDialog({
  plan, tier = 0, open, onOpenChange, onSaved,
}: {
  plan: PlanRow | null
  tier?: number
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
  const [enabledModules, setEnabledModules] = React.useState<string[]>([])
  const [sortOrder, setSortOrder] = React.useState('0')
  const [isActive, setIsActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => { if (open) setTab('basic') }, [open])

  React.useEffect(() => {
    if (plan) {
      setCode(plan.code); setName(plan.name); setDescription(plan.description ?? '')
      setBusinessType((plan.businessType as any) === 'fashion' ? 'fashion' : 'electronics')
      setPriceMonthly(String(plan.priceMonthly)); setPriceYearly(String(plan.priceYearly))
      setMaxUsers(String(plan.maxUsers)); setMaxProducts(String(plan.maxProducts))
      setMaxBranches(String(plan.maxBranches)); setTrialDays(String(plan.trialDays))
      setFeatures(parseFeatures(plan.features)); setCapabilities(parseCaps(plan.capabilities))
      setEnabledModules(parseCaps(plan.enabledModules)); setSortOrder(String(plan.sortOrder))
      setIsActive(plan.isActive)
    } else {
      setCode(''); setName(''); setDescription(''); setBusinessType('electronics')
      setPriceMonthly('0'); setPriceYearly('0'); setMaxUsers('1'); setMaxProducts('50')
      setMaxBranches('1'); setTrialDays('0'); setFeatures(''); setCapabilities([])
      setEnabledModules([...ELECTRONICS_DEFAULTS]); setSortOrder('0'); setIsActive(true)
    }
  }, [plan, open])

  const liveMonthly = Number(priceMonthly) || 0
  const liveYearly = Number(priceYearly) || 0
  const liveSavings = liveMonthly * 12 - liveYearly
  const liveSavingsPct = liveMonthly > 0 && liveSavings > 0 ? Math.round((liveSavings / (liveMonthly * 12)) * 100) : 0

  const save = async () => {
    if (!code || !name) { toast.error('الكود والاسم مطلوبان'); setTab('basic'); return }
    setSaving(true)
    try {
      const finalModules = Array.from(new Set([...enabledModules, 'settings', 'users']))
      const payload = {
        code, name, description, businessType, capabilities, enabledModules: finalModules,
        priceMonthly: Number(priceMonthly) || 0, priceYearly: Number(priceYearly) || 0,
        maxUsers: Number(maxUsers) || 1, maxProducts: Number(maxProducts) || 50,
        maxBranches: Number(maxBranches) || 1, trialDays: Number(trialDays) || 0,
        features, sortOrder: Number(sortOrder) || 0, isActive,
      }
      if (isEdit && plan) {
        await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', body: payload })
        toast.success('تم تحديث الباقة')
      } else {
        await api('/api/admin/plans', { method: 'POST', body: payload })
        toast.success('تم إنشاء الباقة')
      }
      onOpenChange(false); onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl [&>button]:text-white"
      >
        <div className="relative overflow-hidden bg-zinc-950 px-5 pb-4 pt-5 text-white">
          <HazardTape className="absolute inset-x-0 top-0 h-[3px]" />
          <div aria-hidden className="pl-grid-dark pointer-events-none absolute inset-0" />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(420px 160px at 90% -10%, rgba(220,38,38,.25), transparent)' }} />

          <DialogHeader className="relative space-y-1.5">
            <div className="flex items-center gap-2.5">
              {isEdit ? (
                <TierPlate tier={tier >= 0 ? tier : 0} size="sm" />
              ) : (
                <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-red-800 text-white shadow-sm ring-1 ring-inset ring-white/15">
                  <Plus className="size-3.5" strokeWidth={2.8} />
                </span>
              )}
              <DialogTitle className="text-base font-extrabold">{isEdit ? 'تعديل الباقة' : 'باقة جديدة'}</DialogTitle>
            </div>
            <DialogDescription className="text-[11.5px] text-zinc-400">
              {isEdit ? `تعديل: ${plan?.name}` : 'سعر، حدود، مميزات، وحدات — كل شيء في مكان واحد.'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-md border border-white/15 bg-white/[.07] px-2.5 py-1 text-[10.5px] font-bold backdrop-blur-sm">
              <Factory className="size-3 shrink-0 text-red-400" />
              <span className="truncate">{name || 'باقة بدون اسم'}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[.07] px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums backdrop-blur-sm">
              {liveMonthly === 0 && liveYearly === 0 ? 'مجاناً' : `${num(liveMonthly)} ج.م/شهر`}
            </span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[var(--pl-line)] px-3 pt-2.5">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
              {([
                { v: 'basic', label: 'الأساسيات', icon: Factory },
                { v: 'pricing', label: 'التسعير والحدود', icon: Gauge },
                { v: 'features', label: 'المزايا', icon: Sparkles },
                { v: 'modules', label: 'الوحدات', icon: Layers },
              ] as const).map((t) => (
                <TabsTrigger
                  key={t.v} value={t.v}
                  className="gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-xs font-bold text-[var(--pl-muted)] shadow-none data-[state=active]:border-[var(--pl-a)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--pl-a)]"
                >
                  <t.icon className="size-3.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="basic" className="mt-0 space-y-3.5">
              <div className="space-y-1.5">
                <Label>نوع النشاط التجاري</Label>
                <Select value={businessType} onValueChange={(v: any) => setBusinessType(v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electronics">📱 موبايل وكمبيوتر</SelectItem>
                    <SelectItem value="fashion">👗 ملابس وأحذية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>الكود *</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="electronics-pro" dir="ltr" className="rounded-xl font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>الاسم *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الباقة الاحترافية" className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>الوصف</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="وصف مختصر يظهر للعملاء…" className="rounded-xl" />
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="mt-0 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>السعر الشهري (ج.م)</Label>
                  <Input type="number" min={0} value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} dir="ltr" className="rounded-xl font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>السعر السنوي (ج.م)</Label>
                  <Input type="number" min={0} value={priceYearly} onChange={(e) => setPriceYearly(e.target.value)} dir="ltr" className="rounded-xl font-mono" />
                </div>
              </div>

              {liveMonthly > 0 && liveYearly > 0 && (
                <div className={cn(
                  'flex items-center justify-between rounded-xl border px-3.5 py-2.5',
                  liveSavings > 0 ? 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-700/40 dark:bg-emerald-950/40'
                    : 'border-rose-300/60 bg-rose-50/70 dark:border-rose-700/40 dark:bg-rose-950/40',
                )}>
                  <span className="text-[11px] font-bold">
                    {liveSavings > 0 ? 'وفّر العميل سنويًا' : 'السنوي أعلى من ١٢× شهري'}
                  </span>
                  <span className={cn('font-mono text-sm font-extrabold tabular-nums',
                    liveSavings > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>
                    {liveSavings > 0 ? `${num(liveSavings)} ج.م` : `+${num(-liveSavings)} ج.م`}
                    {liveSavingsPct > 0 && <span className="ms-1 text-[10px]">({liveSavingsPct}%)</span>}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>أقصى مستخدمين</Label>
                  <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} dir="ltr" className="rounded-xl font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>أقصى منتجات</Label>
                  <Input type="number" min={0} value={maxProducts} onChange={(e) => setMaxProducts(e.target.value)} dir="ltr" className="rounded-xl font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>أقصى فروع</Label>
                  <Input type="number" min={1} value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} dir="ltr" className="rounded-xl font-mono" />
                </div>
              </div>
              <p className="text-[10.5px] text-[var(--pl-muted)]">
                💡 استخدم <span className="font-mono font-bold">999999</span> للإطلاق (∞ بلا حدود).
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>أيام التجربة المجانية</Label>
                  <Input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} dir="ltr" className="rounded-xl font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>ترتيب العرض</Label>
                  <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} dir="ltr" className="rounded-xl font-mono" />
                </div>
              </div>

              <label htmlFor="plan-active" className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--pl-line)] p-3.5 transition-colors hover:bg-[var(--pl-surface-2)]">
                <span className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-red-800 text-white shadow-sm">
                    <Power className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">الباقة مفعّلة</span>
                    <span className="block text-[10.5px] text-[var(--pl-muted)]">الباقات المعطّلة لا تظهر للعملاء الجدد</span>
                  </span>
                </span>
                <Switch checked={isActive} onCheckedChange={setIsActive} id="plan-active" />
              </label>
            </TabsContent>

            <TabsContent value="features" className="mt-0 space-y-3.5">
              <div className="space-y-1.5">
                <Label>المميزات (كل ميزة في سطر)</Label>
                <Textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={6} placeholder={'حتى 500 منتج\n5 مستخدمين\nتقارير متقدمة'} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>الصلاحيات المتاحة (Capabilities)</Label>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--pl-line)] p-3 sm:grid-cols-2">
                  {CAPABILITIES_META.map((cap) => {
                    const checked = capabilities.includes(cap.key)
                    return (
                      <button
                        key={cap.key} type="button" role="switch" aria-checked={checked}
                        onClick={() => setCapabilities((prev) => checked ? prev.filter((c) => c !== cap.key) : [...prev, cap.key])}
                        className={cn(
                          'flex items-start gap-2.5 rounded-lg border p-2.5 text-start transition-all',
                          checked
                            ? 'border-[var(--pl-a)]/50 bg-[var(--pl-a-soft)] shadow-sm'
                            : 'border-[var(--pl-line)] hover:border-[var(--pl-a)]/40',
                        )}
                      >
                        <span className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-all',
                          checked ? 'border-[var(--pl-a)] bg-gradient-to-br from-red-600 to-red-800 text-white' : 'border-[var(--pl-line-strong)] text-transparent',
                        )}>
                          <Check className="size-3" strokeWidth={3.5} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold leading-tight">{cap.label}</span>
                          <span className="block text-[10.5px] leading-snug text-[var(--pl-muted)]">{cap.desc}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="modules" className="mt-0 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[13px]">الصفحات المتاحة (Modules)</Label>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setEnabledModules(businessType === 'fashion' ? [...FASHION_DEFAULTS] : [...ELECTRONICS_DEFAULTS])}
                  className="gap-1.5 rounded-lg"
                >
                  <RefreshCw className="size-3.5" />
                  افتراضي {businessType === 'fashion' ? 'ملابس' : 'موبايل'}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--pl-line)] p-3 sm:grid-cols-2">
                {MODULES_META.map((mod) => {
                  const isCritical = mod.key === 'settings' || mod.key === 'users'
                  const checked = isCritical || enabledModules.includes(mod.key)
                  const isDisabledForCurrentType = businessType === 'fashion' && !!mod.electronicsOnly
                  const effectivelyDisabled = isCritical || isDisabledForCurrentType
                  return (
                    <button
                      key={mod.key} type="button" role="switch" aria-checked={checked}
                      disabled={effectivelyDisabled}
                      onClick={() => setEnabledModules((prev) => checked ? prev.filter((m) => m !== mod.key) : [...prev, mod.key])}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border p-2.5 text-start transition-all',
                        isCritical ? 'cursor-not-allowed border-[var(--pl-line)] bg-[var(--pl-surface-2)]/50'
                          : isDisabledForCurrentType ? 'cursor-not-allowed border-[var(--pl-line)] opacity-50'
                            : checked ? 'cursor-pointer border-[var(--pl-a)]/50 bg-[var(--pl-a-soft)] shadow-sm'
                              : 'cursor-pointer border-[var(--pl-line)] hover:border-[var(--pl-a)]/40',
                      )}
                    >
                      <span className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-all',
                        checked ? 'border-[var(--pl-a)] bg-gradient-to-br from-red-600 to-red-800 text-white' : 'border-[var(--pl-line-strong)] text-transparent',
                      )}>
                        {effectivelyDisabled ? <Lock className="size-2.5 text-[var(--pl-muted)]" strokeWidth={2.5} /> : <Check className="size-3" strokeWidth={3.5} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold leading-tight">
                          {mod.label}
                          {isCritical && <span className="ms-1 text-[9.5px] font-semibold text-[var(--pl-muted)]">(إجباري)</span>}
                          {isDisabledForCurrentType && <span className="ms-1 text-[9.5px] font-semibold text-[var(--pl-muted)]">(غير متاح لملابس)</span>}
                        </span>
                        <span className="block text-[10.5px] leading-snug text-[var(--pl-muted)]">{mod.desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="shrink-0 gap-2 border-t border-[var(--pl-line)] bg-[var(--pl-surface-2)]/40 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5 rounded-xl bg-gradient-to-b from-red-600 to-red-700 text-white shadow-md shadow-red-900/30 hover:from-red-500 hover:to-red-600">
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" />
            {isEdit ? 'حفظ' : 'إنشاء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}