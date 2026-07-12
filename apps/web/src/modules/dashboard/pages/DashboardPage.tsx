/**
 * Dashboard page — real-time overview from /reports/dashboard.
 */
import { Link } from 'react-router-dom';
import {
  ShoppingBag, Wrench, Users, AlertTriangle, TrendingUp, TrendingDown,
  Clock, ArrowUpRight, ArrowDownRight, Wallet, Package,
} from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { useDashboardOverview } from '@modules/reports/api/reports.api';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { cn } from '@core/utils/cn';

export default function DashboardPage() {
  const { data: overview, isLoading } = useDashboardOverview();

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container">
      <PageHeader title="لوحة التحكم" description="نظرة عامة على أداء المتجر" />

      {overview ? (
        <>
          {/* Sales KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="مبيعات اليوم" value={formatCurrency(overview.sales.todayTotal)} delta={`${overview.sales.todayCount} فاتورة`} trend="up" icon={<ShoppingBag className="size-5" />} />
            <KpiCard label="مبيعات الأسبوع" value={formatCurrency(overview.sales.weekTotal)} subtitle="آخر 7 أيام" icon={<TrendingUp className="size-5" />} />
            <KpiCard label="مبيعات الشهر" value={formatCurrency(overview.sales.monthTotal)} subtitle="آخر 30 يوم" icon={<TrendingUp className="size-5" />} />
            <KpiCard label="متوسط الفاتورة" value={formatCurrency(overview.sales.avgTicket)} icon={<ShoppingBag className="size-5" />} />
          </div>

          {/* Repairs + Inventory + Finance */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="صيانة نشطة" value={formatNumber(overview.repairs.activeCount, 0)} subtitle={`جاهزة: ${overview.repairs.readyCount}`} icon={<Wrench className="size-5" />} variant="warning" />
            <KpiCard label="مخزون منخفض" value={formatNumber(overview.inventory.lowStockCount, 0)} subtitle={`${formatNumber(overview.inventory.totalProducts, 0)} منتج`} icon={<AlertTriangle className="size-5" />} variant={overview.inventory.lowStockCount > 0 ? 'destructive' : 'default'} />
            <KpiCard label="قيمة المخزون" value={formatCurrency(overview.inventory.totalValue)} subtitle="تكلفة" icon={<Package className="size-5" />} />
            <KpiCard label="صافي اليوم" value={formatCurrency(overview.finance.netProfit)} delta={`إيراد: ${formatCurrency(overview.finance.todayRevenues)}`} trend={overview.finance.netProfit >= 0 ? 'up' : 'down'} icon={<Wallet className="size-5" />} variant={overview.finance.netProfit >= 0 ? 'success' : 'destructive'} />
          </div>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>إجراءات سريعة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <QuickAction label="نقطة البيع" icon={<ShoppingBag className="size-5" />} href="/pos" />
                <QuickAction label="استلام جهاز" icon={<Wrench className="size-5" />} href="/repairs/new" />
                <QuickAction label="إضافة عميل" icon={<Users className="size-5" />} href="/customers/new" />
                <QuickAction label="تقرير المبيعات" icon={<TrendingUp className="size-5" />} href="/reports/sales" />
              </div>
            </CardContent>
          </Card>

          {/* Reports links */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">تقرير المبيعات</p>
                  <p className="text-xs text-muted-foreground">تحليل المبيعات اليومية والشهرية</p>
                </div>
                <Button asChild variant="outline" size="sm"><Link to="/reports/sales">عرض</Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">تقرير المخزون</p>
                  <p className="text-xs text-muted-foreground">تقييم المخزون والأصناف</p>
                </div>
                <Button asChild variant="outline" size="sm"><Link to="/reports/inventory">عرض</Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">التقرير المالي</p>
                  <p className="text-xs text-muted-foreground">الأرباح والخسائر</p>
                </div>
                <Button asChild variant="outline" size="sm"><Link to="/reports/finance">عرض</Link></Button>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  delta?: string;
  trend?: 'up' | 'down';
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'destructive' | 'warning' | 'primary';
}

function KpiCard({ label, value, subtitle, delta, trend, icon, variant = 'default' }: KpiCardProps) {
  const colorClass = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/10 text-warning',
    primary: 'bg-primary/10 text-primary',
  }[variant];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon ? <div className={cn('flex size-9 items-center justify-center rounded-md', colorClass)}>{icon}</div> : null}
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
        {delta ? (
          <div className="mt-2 flex items-center gap-1 text-xs">
            {trend === 'up' ? <ArrowUpRight className="size-3 text-success" /> : trend === 'down' ? <ArrowDownRight className="size-3 text-destructive" /> : null}
            <span className={cn('font-medium', trend === 'up' && 'text-success', trend === 'down' && 'text-destructive')}>{delta}</span>
          </div>
        ) : subtitle ? <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

function QuickAction({ label, icon, href }: { label: string; icon: React.ReactNode; href: string }) {
  return (
    <Button variant="outline" className="h-auto justify-start gap-3 py-4" asChild>
      <Link to={href}>
        <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
        <span className="flex-1 text-right">{label}</span>
      </Link>
    </Button>
  );
}

void Clock;
void Badge;
