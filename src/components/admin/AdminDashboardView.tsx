'use client'

import * as React from 'react'
import {
  Store, Bell, Wallet, AlertTriangle, PauseCircle, FlaskConical, TrendingUp,
  Repeat, Loader2, Zap, Activity, ArrowUpRight, ArrowDownRight, Minus,
  RefreshCw, Clock3, CheckCircle2, Rocket, Crown, Users, Building2,
  CircleAlert, CircleDollarSign,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatShortDate } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Stats {
  totalTenants: number
  activeSubscriptions: number
  mrr: number
  expiringWithin7Days: number
  suspendedCount: number
  expiredCount: number
  activeTrials: number
  arpu: number
  retentionRate: number
  growth: Array<{ month: string; newSubs: number; cancelled: number }>
  planDistribution: Array<{ plan: string; name: string; count: number }>
  expiringSoon: Array<{
    subscriptionId: number
    tenantId: string
    shopName: string
    planName: string
    endDate: string
    daysLeft: number
  }>
  recentTenants: Array<{
    id: string
    shopName: string
    planName: string
    createdAt: string
    status: string
  }>
}

const PLAN_COLORS: Record<string, string> = {
  trial: 'var(--chart-2)',
  pro: 'var(--chart-1)',
  business: 'var(--chart-3)',
  enterprise: 'var(--chart-4)',
}

const nf = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US').format(n)

function Spark({ values, color = 'currentColor', height = 24 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <div style={{ height }} className="w-full" />
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const rng = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${height - 4 - ((v - min) / rng) * (height - 8)}`).join(' ')
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Delta({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value == null || !isFinite(value)) {
    return <span className="text-[10px] text-muted-foreground">—</span>
  }
  const flat = Math.abs(value) < 0.5
  const up = value > 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 font-mono text-[10.5px] font-bold tabular-nums',
      flat ? 'text-muted-foreground' : up ? 'text-success' : 'text-destructive',
    )}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(value).toFixed(0)}{suffix}
    </span>
  )
}

function TopBar({ stats, loading, onRefresh, refreshing }: {
  stats: Stats | null
  loading: boolean
  onRefresh: () => void
  refreshing: boolean
}) {
  const growth = stats?.growth ?? []
  const lastMonth = growth[growth.length - 1]
  const prevMonth = growth[growth.length - 2]

  const newDelta = lastMonth && prevMonth && prevMonth.newSubs > 0
    ? ((lastMonth.newSubs - prevMonth.newSubs) / prevMonth.newSubs) * 100
    : null

  const mrrSeries = growth.map((_, i) =>
    (stats?.arpu ?? 0) * (i + 1) + growth.slice(0, i + 1).reduce((a, g) => a + g.newSubs, 0)
  )

  const alertCount = stats?.expiringWithin7Days ?? 0
  const hasAlerts = alertCount > 0

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(600px 240px at 90% -30%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 65%),
            radial-gradient(500px 220px at 0% 130%, color-mix(in oklab, var(--chart-3) 8%, transparent), transparent 60%)
          `,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(to left, transparent, color-mix(in oklab, var(--primary) 45%, transparent), transparent)' }}
      />

      <div className="relative p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20">
              <Activity className="size-5" aria-hidden />
              <span className="absolute -top-1 -end-1 flex size-3">
                <span className="absolute inline-flex size-full rounded-full bg-success opacity-70 animate-ping" />
                <span className="relative inline-flex size-3 rounded-full bg-success ring-2 ring-card" />
              </span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black sm:text-lg">مركز التحكم</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-subtle px-2 py-0.5 text-[10px] font-bold text-success-subtle-foreground">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden />
                  live
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {loading ? 'جارٍ التحميل…' : stats ? `مراقبة ${nf(stats.totalTenants)} محل · ${nf(stats.activeSubscriptions)} اشتراك نشط` : '—'}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-8 gap-1.5 rounded-lg text-[11px]"
          >
            <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} aria-hidden />
            تحديث
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">MRR</span>
              <CircleDollarSign className="size-3.5 text-primary" aria-hidden />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              {loading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <>
                  <span className="font-mono text-xl font-black leading-none tabular-nums text-foreground">{nf(stats?.mrr ?? 0)}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">ج.م</span>
                </>
              )}
            </div>
            {!loading && mrrSeries.length >= 2 && (
              <div className="mt-2"><Spark values={mrrSeries} color="var(--primary)" height={24} /></div>
            )}
          </div>

          <div className="relative overflow-hidden rounded-xl border border-chart-3/20 bg-gradient-to-br from-chart-3/[0.06] via-transparent to-transparent p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-chart-3">اشتراكات</span>
              <Users className="size-3.5 text-chart-3" aria-hidden />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              {loading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <span className="font-mono text-xl font-black leading-none tabular-nums text-foreground">{nf(stats?.activeSubscriptions ?? 0)}</span>
              )}
            </div>
            {!loading && lastMonth && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                <Delta value={newDelta} />
                <span className="text-muted-foreground">من السابق</span>
              </div>
            )}
          </div>

          <div className="relative overflow-hidden rounded-xl border border-chart-6/20 bg-gradient-to-br from-chart-6/[0.06] via-transparent to-transparent p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-chart-6">محلات</span>
              <Building2 className="size-3.5 text-chart-6" aria-hidden />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              {loading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <span className="font-mono text-xl font-black leading-none tabular-nums text-foreground">{nf(stats?.totalTenants ?? 0)}</span>
              )}
            </div>
            {!loading && stats && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <b className="font-mono text-foreground">{nf(stats.activeTrials)}</b> تجريبي
              </div>
            )}
          </div>

          <div className={cn(
            'relative overflow-hidden rounded-xl border p-3',
            hasAlerts
              ? 'border-warning/35 bg-gradient-to-br from-warning/[0.12] via-transparent to-transparent'
              : 'border-success/25 bg-gradient-to-br from-success/[0.06] via-transparent to-transparent',
          )}>
            <div className="flex items-center justify-between">
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-wider',
                hasAlerts ? 'text-warning' : 'text-success',
              )}>
                تنبيهات
              </span>
              {hasAlerts
                ? <CircleAlert className="size-3.5 text-warning" aria-hidden />
                : <CheckCircle2 className="size-3.5 text-success" aria-hidden />}
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              {loading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <span className={cn(
                  'font-mono text-xl font-black leading-none tabular-nums',
                  hasAlerts ? 'text-warning' : 'text-foreground',
                )}>
                  {nf(alertCount)}
                </span>
              )}
            </div>
            {!loading && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {hasAlerts ? 'تحتاج متابعة' : 'كل شيء تمام'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    active: { label: 'نشط', cls: 'bg-success-subtle text-success-subtle-foreground', dot: 'bg-success' },
    suspended: { label: 'موقوف', cls: 'bg-warning-subtle text-warning-subtle-foreground', dot: 'bg-warning' },
    expired: { label: 'منتهي', cls: 'bg-destructive-subtle text-destructive-subtle-foreground', dot: 'bg-destructive' },
    cancelled: { label: 'ملغي', cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
    trial: { label: 'تجريبي', cls: 'bg-info-subtle text-info-subtle-foreground', dot: 'bg-info' },
  }
  const cfg = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-bold', cfg.cls)}>
      <span className={cn('size-1.5 rounded-full', cfg.dot)} aria-hidden />
      {cfg.label}
    </span>
  )
}

function ThemedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div dir="rtl" className="rounded-lg border bg-popover/98 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur">
      {label && <p className="mb-1 font-bold text-foreground">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="size-1.5 rounded-full" style={{ background: p.color ?? p.fill }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <b className="ms-auto ps-2 font-mono tabular-nums text-foreground">{nf(Number(p.value))}</b>
        </p>
      ))}
    </div>
  )
}

function MiniMetric({
  icon: Icon, label, value, hint, tone, loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
  tone: 'primary' | 'success' | 'warning' | 'info'
  loading?: boolean
}) {
  const tones = {
    primary: 'bg-primary/12 text-primary ring-primary/20',
    success: 'bg-chart-1/15 text-chart-1 ring-chart-1/20',
    warning: 'bg-chart-2/15 text-chart-2 ring-chart-2/20',
    info: 'bg-chart-3/15 text-chart-3 ring-chart-3/20',
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset', tones[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-1">
          {loading ? (
            <Skeleton className="h-5 w-14 rounded" />
          ) : (
            <span className="truncate font-mono text-base font-black leading-none tabular-nums">{value}</span>
          )}
        </div>
        {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

/* ═════════════════════════ Component ═════════════════════════ */

export function AdminDashboardView() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [extending, setExtending] = React.useState<number | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await api<Stats>('/api/admin/stats')
      setStats(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الإحصائيات')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const handleQuickExtend = async (subId: number) => {
    setExtending(subId)
    try {
      await api(`/api/admin/subscriptions/${subId}`, {
        method: 'PUT',
        body: { action: 'extend', period: 'monthly', amountPaid: 0, paymentMethod: 'manual' },
      })
      toast.success('تم تمديد الاشتراك شهراً')
      load(true)
    } catch (e: any) {
      toast.error(e?.message || 'فشل التمديد')
    } finally {
      setExtending(null)
    }
  }

  const totalPlans = stats?.planDistribution.reduce((a, p) => a + p.count, 0) ?? 0
  const expiringSoon = stats?.expiringSoon ?? []

  return (
    <div className="space-y-4" dir="rtl">
      <TopBar stats={stats} loading={loading} onRefresh={() => load(true)} refreshing={refreshing} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniMetric
          icon={PauseCircle}
          label="محلات موقوفة"
          value={stats ? nf(stats.suspendedCount) : '—'}
          hint={stats && stats.totalTenants > 0
            ? `${((stats.suspendedCount / stats.totalTenants) * 100).toFixed(0)}% من الإجمالي`
            : undefined}
          tone="warning"
          loading={loading}
        />
        <MiniMetric
          icon={FlaskConical}
          label="تجريبي نشط"
          value={stats ? nf(stats.activeTrials) : '—'}
          hint={stats && stats.activeTrials > 0
            ? `فرصة تحويل ${((stats.activeSubscriptions / (stats.activeSubscriptions + stats.activeTrials)) * 100).toFixed(0)}%`
            : 'لا توجد تجارب'}
          tone="info"
          loading={loading}
        />
        <MiniMetric
          icon={Crown}
          label="ARPU"
          value={stats ? formatCurrency(stats.arpu) : '—'}
          hint="متوسط الإيراد / محل"
          tone="primary"
          loading={loading}
        />
        <MiniMetric
          icon={Repeat}
          label="معدل الاحتفاظ"
          value={stats ? `${stats.retentionRate}%` : '—'}
          hint="نسبة التجديد"
          tone="success"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-chart-1/15 text-chart-1 ring-1 ring-inset ring-chart-1/20">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-black">نمو الاشتراكات</CardTitle>
                <p className="text-[11px] text-muted-foreground">آخر 6 أشهر</p>
              </div>
            </div>
            <div className="hidden items-center gap-3 text-[10.5px] sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-1" aria-hidden />
                <span className="text-muted-foreground">جديد</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-5" aria-hidden />
                <span className="text-muted-foreground">ملغي</span>
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-[220px] w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats?.growth ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="newSubs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cancelled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-5)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-5)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab, var(--border) 50%, transparent)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ stroke: 'var(--border)', strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="newSubs" name="جديد" stroke="var(--chart-1)" fill="url(#newSubs)" strokeWidth={2} />
                  <Area type="monotone" dataKey="cancelled" name="ملغي" stroke="var(--chart-5)" fill="url(#cancelled)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-chart-4/15 text-chart-4 ring-1 ring-inset ring-chart-4/20">
                <Crown className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-black">توزيع الباقات</CardTitle>
                <p className="text-[11px] text-muted-foreground">{nf(totalPlans)} اشتراك</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-[220px] w-full rounded-lg" />
            ) : (
              <>
                <div className="relative mx-auto" style={{ maxWidth: 180 }}>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={stats?.planDistribution ?? []}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={70}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {(stats?.planDistribution ?? []).map((entry, i) => (
                          <Cell key={i} fill={PLAN_COLORS[entry.plan] ?? '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip content={<ThemedTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-xl font-black tabular-nums">{nf(totalPlans)}</span>
                    <span className="text-[9.5px] text-muted-foreground">اشتراك</span>
                  </div>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {(stats?.planDistribution ?? []).map((p, i) => {
                    const pct = totalPlans > 0 ? (p.count / totalPlans) * 100 : 0
                    return (
                      <li key={i} className="flex items-center gap-2 text-[11.5px]">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: PLAN_COLORS[p.plan] ?? '#94a3b8' }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                          {nf(p.count)} · {pct.toFixed(0)}%
                        </span>
                      </li>
                    )
                  })}
                  {!stats?.planDistribution.length && (
                    <li className="py-4 text-center text-[11px] text-muted-foreground">لا توجد بيانات</li>
                  )}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-chart-2/15 text-chart-2 ring-1 ring-inset ring-chart-2/20">
                <Clock3 className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-black">تنتهي قريباً</CardTitle>
                <p className="text-[11px] text-muted-foreground">{nf(expiringSoon.length)} اشتراك يحتاج متابعة</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4"><Skeleton className="h-40 w-full rounded-lg" /></div>
            ) : expiringSoon.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 className="mx-auto mb-2 size-8 text-success/50" aria-hidden />
                <p className="text-[12px] text-muted-foreground">لا توجد اشتراكات قريبة من الانتهاء</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-10 ps-4 text-[10.5px] font-bold uppercase">#</TableHead>
                      <TableHead className="w-56 text-[10.5px] font-bold uppercase">المحل</TableHead>
                      <TableHead className="w-32 text-[10.5px] font-bold uppercase">الباقة</TableHead>
                      <TableHead className="w-24 text-[10.5px] font-bold uppercase">الانتهاء</TableHead>
                      <TableHead className="w-16 text-center text-[10.5px] font-bold uppercase">متبقي</TableHead>
                      <TableHead className="w-20 pe-4 text-center text-[10.5px] font-bold uppercase">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiringSoon.slice(0, 5).map((s, i) => {
                      const urgent = s.daysLeft <= 3
                      return (
                        <TableRow key={s.subscriptionId} className="group">
                          <TableCell className="w-10 ps-4">
                            <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                          </TableCell>

                          <TableCell className="w-56">
                            <span className="block truncate text-[12.5px] font-semibold" title={s.shopName}>
                              {s.shopName}
                            </span>
                          </TableCell>

                          <TableCell className="w-32">
                            <span
                              className="inline-flex max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                              title={s.planName}
                            >
                              {s.planName}
                            </span>
                          </TableCell>

                          <TableCell className="w-24 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {formatShortDate(s.endDate)}
                          </TableCell>

                          <TableCell className="w-16 text-center">
                            <span className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-bold tabular-nums',
                              urgent
                                ? 'bg-destructive-subtle text-destructive-subtle-foreground'
                                : 'bg-warning-subtle text-warning-subtle-foreground',
                            )}>
                              {s.daysLeft} ي
                            </span>
                          </TableCell>

                          <TableCell className="w-20 pe-4 text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              disabled={extending === s.subscriptionId}
                              onClick={() => handleQuickExtend(s.subscriptionId)}
                            >
                              {extending === s.subscriptionId
                                ? <Loader2 className="size-3 animate-spin" aria-hidden />
                                : <Zap className="size-3" aria-hidden />}
                              تمديد
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {expiringSoon.length > 5 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-2 text-center text-[11px] text-muted-foreground">
                          + {expiringSoon.length - 5} اشتراك آخر
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-chart-3/15 text-chart-3 ring-1 ring-inset ring-chart-3/20">
                <Rocket className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-black">أحدث المسجلين</CardTitle>
                <p className="text-[11px] text-muted-foreground">آخر 5 محلات</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4"><Skeleton className="h-40 w-full rounded-lg" /></div>
            ) : (stats?.recentTenants ?? []).length === 0 ? (
              <div className="py-12 text-center">
                <Store className="mx-auto mb-2 size-8 text-muted-foreground/40" aria-hidden />
                <p className="text-[12px] text-muted-foreground">لا توجد محلات مسجلة</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {(stats?.recentTenants ?? []).slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-[11px] font-black text-primary-foreground">
                      {(t.shopName || '؟').trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold">{t.shopName}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                        {t.planName} · {formatShortDate(t.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}