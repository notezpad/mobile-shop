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
  trial: '#94a3b8',
  pro: '#22c55e',
  business: '#0ea5e9',
  enterprise: '#a855f7',
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'نشط', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    suspended: { label: 'موقوف', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    expired: { label: 'منتهي', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30' },
    cancelled: { label: 'ملغي', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30' },
    trial: { label: 'تجريبي', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30' },
  }
  const cfg = map[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={`text-[11px] ${cfg.className}`}>
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
  tone?: 'default' | 'green' | 'primary' | 'destructive' | 'red' | 'blue' | 'purple'
  loading?: boolean
}) {
  const toneClass: Record<string, string> = {
    default: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    primary: 'bg-primary/15 text-primary',
    destructive: 'bg-destructive/15 text-destructive',
    red: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    purple: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  }
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-4 p-4 sm:p-5">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClass[tone]}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-24" />
          ) : (
            <p className="mt-0.5 text-xl font-bold tracking-tight truncate">{value}</p>
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
          tone="green"
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
          tone="destructive"
          loading={loading}
        />
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon={PauseCircle}
          label="محلات موقوفة"
          value={stats ? String(stats.suspendedCount) : '—'}
          tone="red"
          loading={loading}
        />
        <KpiCard
          icon={FlaskConical}
          label="طلبات تجريبية نشطة"
          value={stats ? String(stats.activeTrials) : '—'}
          tone="blue"
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
          tone="green"
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
            <div className="overflow-x-auto">
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
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
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
            <div className="overflow-x-auto">
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
