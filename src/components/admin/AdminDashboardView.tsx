'use client'

import * as React from 'react'
import {
  Store,
  Bell,
  Wallet,
  AlertTriangle,
  PauseCircle,
  FlaskConical,
  TrendingUp,
  Repeat,
  Loader2,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatShortDate } from '@/lib/format'
import { toast } from 'sonner'

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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
    active: { label: 'نشط', variant: 'success' },
    suspended: { label: 'موقوف', variant: 'warning' },
    expired: { label: 'منتهي', variant: 'danger' },
    cancelled: { label: 'ملغي', variant: 'secondary' },
    trial: { label: 'تجريبي', variant: 'info' },
  }
  const cfg = map[status] ?? { label: status, variant: 'outline' as const }
  return (
    <Badge variant={cfg.variant} size="sm">
      {cfg.label}
    </Badge>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
  loading,
}: {
  icon: any
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'info' | 'purple'
  loading?: boolean
}) {
  const toneClass: Record<string, string> = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary-subtle text-primary-subtle-foreground',
    success: 'bg-success-subtle text-success-subtle-foreground',
    danger: 'bg-destructive-subtle text-destructive-subtle-foreground',
    info: 'bg-info-subtle text-info-subtle-foreground',
    purple: 'bg-chart-4/15 text-chart-4',
  }
  return (
    <Card variant="bento">
      <CardContent className="flex items-start gap-3 p-5">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5 ${toneClass[tone]}`}>
          <Icon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-24" />
          ) : (
            <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums truncate">{value}</p>
          )}
          {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function AdminDashboardView() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [extending, setExtending] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<Stats>('/api/admin/stats')
      setStats(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الإحصائيات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleQuickExtend = async (subId: number) => {
    setExtending(subId)
    try {
      await api(`/api/admin/subscriptions/${subId}`, {
        method: 'PUT',
        body: { action: 'extend', period: 'monthly', amountPaid: 0, paymentMethod: 'manual' },
      })
      toast.success('تم تمديد الاشتراك شهراً')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التمديد')
    } finally {
      setExtending(null)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon={Store}
          label="إجمالي المحلات"
          value={stats ? String(stats.totalTenants) : '—'}
          tone="default"
          loading={loading}
        />
        <KpiCard
          icon={Bell}
          label="الاشتراكات النشطة"
          value={stats ? String(stats.activeSubscriptions) : '—'}
          tone="success"
          loading={loading}
        />
        <KpiCard
          icon={Wallet}
          label="الإيرادات الشهرية المتكررة (MRR)"
          value={stats ? formatCurrency(stats.mrr) : '—'}
          tone="primary"
          loading={loading}
        />
        <KpiCard
          icon={AlertTriangle}
          label="تنبيهات الانتهاء (7 أيام)"
          value={stats ? String(stats.expiringWithin7Days) : '—'}
          tone="danger"
          loading={loading}
        />
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon={PauseCircle}
          label="محلات موقوفة"
          value={stats ? String(stats.suspendedCount) : '—'}
          tone="danger"
          loading={loading}
        />
        <KpiCard
          icon={FlaskConical}
          label="طلبات تجريبية نشطة"
          value={stats ? String(stats.activeTrials) : '—'}
          tone="info"
          loading={loading}
        />
        <KpiCard
          icon={TrendingUp}
          label="متوسط الإيراد لكل محل (ARPU)"
          value={stats ? formatCurrency(stats.arpu) : '—'}
          tone="purple"
          loading={loading}
        />
        <KpiCard
          icon={Repeat}
          label="معدل الاحتفاظ"
          value={stats ? `${stats.retentionRate}%` : '—'}
          tone="success"
          loading={loading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">نمو الاشتراكات (آخر 6 أشهر)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats?.growth ?? []}>
                  <defs>
                    <linearGradient id="newSubs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cancelled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="rgba(148,163,184,0.6)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="rgba(148,163,184,0.6)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.92)',
                      border: 'none',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="newSubs"
                    name="اشتراكات جديدة"
                    stroke="#22c55e"
                    fill="url(#newSubs)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="cancelled"
                    name="ملغية"
                    stroke="#ef4444"
                    fill="url(#cancelled)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">توزيع الباقات</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={stats?.planDistribution ?? []}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {(stats?.planDistribution ?? []).map((entry, i) => (
                      <Cell
                        key={i}
                        fill={PLAN_COLORS[entry.plan] ?? '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.92)',
                      border: 'none',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expiring soon table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">أحدث الاشتراكات المنتهية قريباً</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block" dir="ltr">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>المحل</TableHead>
                      <TableHead className="w-32">الباقة</TableHead>
                      <TableHead className="w-36">تاريخ الانتهاء</TableHead>
                      <TableHead className="w-32 text-center">الأيام المتبقية</TableHead>
                      <TableHead className="w-36 text-center">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats?.expiringSoon ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          لا توجد اشتراكات منتهية قريباً
                        </TableCell>
                      </TableRow>
                    ) : (
                      (stats?.expiringSoon ?? []).map((s, i) => (
                        <TableRow key={s.subscriptionId}>
                          <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.shopName}</TableCell>
                          <TableCell>{s.planName}</TableCell>
                          <TableCell>{formatShortDate(s.endDate)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-warning-subtle text-warning-subtle-foreground dark:text-warning-subtle-foreground border-warning-subtle">
                              {s.daysLeft} يوم
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={extending === s.subscriptionId}
                              onClick={() => handleQuickExtend(s.subscriptionId)}
                            >
                              {extending === s.subscriptionId ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Zap className="size-3.5" />
                              )}
                              تمديد سريع
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* كروت — تظهر تحت lg */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
                {(stats?.expiringSoon ?? []).length === 0 ? (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    لا توجد اشتراكات منتهية قريباً
                  </p>
                ) : (
                  (stats?.expiringSoon ?? []).map((s, i) => (
                    <div key={s.subscriptionId} className="rounded-lg border bg-card p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{i + 1}
                            </span>
                            <p className="truncate text-sm font-medium leading-tight">
                              {s.shopName}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            الباقة: {s.planName}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 bg-warning-subtle text-warning-subtle-foreground dark:text-warning-subtle-foreground border-warning-subtle text-[10px]">
                          {s.daysLeft} يوم
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>النهاية: {formatShortDate(s.endDate)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2"
                          disabled={extending === s.subscriptionId}
                          onClick={() => handleQuickExtend(s.subscriptionId)}
                        >
                          {extending === s.subscriptionId ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Zap className="size-3" />
                          )}
                          تمديد
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent tenants */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">أحدث 5 محلات مسجلة</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block" dir="ltr">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>اسم المحل</TableHead>
                      <TableHead className="w-32">الباقة</TableHead>
                      <TableHead className="w-36">تاريخ التسجيل</TableHead>
                      <TableHead className="w-28 text-center">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats?.recentTenants ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          لا توجد محلات مسجلة بعد
                        </TableCell>
                      </TableRow>
                    ) : (
                      (stats?.recentTenants ?? []).map((t, i) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{t.shopName}</TableCell>
                          <TableCell>{t.planName}</TableCell>
                          <TableCell>{formatShortDate(t.createdAt)}</TableCell>
                          <TableCell className="text-center"><StatusBadge status={t.status} /></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* كروت — تظهر تحت lg */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
                {(stats?.recentTenants ?? []).length === 0 ? (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    لا توجد محلات مسجلة بعد
                  </p>
                ) : (
                  (stats?.recentTenants ?? []).map((t, i) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{i + 1}
                          </span>
                          <p className="truncate text-sm font-medium leading-tight">
                            {t.shopName}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t.planName} • {formatShortDate(t.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
