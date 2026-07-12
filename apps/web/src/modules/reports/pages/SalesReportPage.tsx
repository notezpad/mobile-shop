/**
 * Sales report page — summary KPIs + charts + breakdowns.
 */
import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ShoppingBag, TrendingUp, Receipt, Tag, ArrowDownCircle } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { useSalesReport } from '../api/reports.api';
import { DateRangePicker, StatCard, ChartCard, ExportButton, formatReportDate, formatReportCurrency } from '../components/report-shared';
import { formatCurrency, formatNumber } from '@core/utils/format';

const PIE_COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const PAYMENT_LABELS: Record<string, string> = { cash: 'كاش', card: 'بطاقة', vodafone_cash: 'فودافون كاش', instapay: 'إنستاباي', fawry: 'فوري', credit: 'آجل', mixed: 'متعدد' };

export default function SalesReportPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: report, isLoading } = useSalesReport(fromDate || undefined, toDate || undefined);

  const handlePreset = (days: number) => {
    const to = new Date();
    const from = days === 0 ? new Date(to) : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    setFromDate(from.toISOString().split('T')[0]!);
    setToDate(to.toISOString().split('T')[0]!);
  };

  if (isLoading) return <LoadingState />;
  if (!report) return null;

  const dailyChartData = report.byDay.map((d) => ({ date: formatReportDate(d.date), المبيعات: d.total, الفواتير: d.count }));
  const methodChartData = report.byPaymentMethod.map((m) => ({ name: PAYMENT_LABELS[m.method] ?? m.method, value: m.total }));
  const cashierChartData = report.byCashier.map((c) => ({ name: c.cashierName, المبيعات: c.total, الفواتير: c.count }));

  return (
    <div className="page-container">
      <PageHeader
        title="تقرير المبيعات"
        description="تحليل شامل للمبيعات حسب الفترة"
        actions={<ExportButton onPrint={() => window.print()} />}
      />

      <DateRangePicker fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} onPreset={handlePreset} />

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={formatCurrency(report.summary.totalSales)} icon={<ShoppingBag className="size-5" />} variant="primary" />
        <StatCard label="عدد الفواتير" value={formatNumber(report.summary.totalTransactions, 0)} icon={<Receipt className="size-5" />} />
        <StatCard label="متوسط الفاتورة" value={formatCurrency(report.summary.avgTicket)} icon={<TrendingUp className="size-5" />} variant="success" />
        <StatCard label="صافي المبيعات" value={formatCurrency(report.summary.netSales)} subtitle={`مرتجعات: ${formatCurrency(report.summary.totalRefunds)}`} icon={<ArrowDownCircle className="size-5" />} variant="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily sales chart */}
        <ChartCard title="المبيعات اليومية">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
              <Legend />
              <Line type="monotone" dataKey="المبيعات" stroke="#0f172a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Payment methods pie */}
        <ChartCard title="وسائل الدفع">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={methodChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}>
                {methodChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* By cashier */}
      <ChartCard title="المبيعات حسب الكاشير">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={cashierChartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
            <Legend />
            <Bar dataKey="المبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top products table */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h3 className="text-sm font-semibold">أعلى 10 منتجات مبيعاً</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-right">
                <tr>
                  <th className="px-4 py-2 font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">المنتج</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">الكمية</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.topProducts.map((p, i) => (
                  <tr key={p.productId} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{p.productName}</td>
                    <td className="px-4 py-2 tabular-nums">{formatNumber(p.quantity, 0)}</td>
                    <td className="px-4 py-2 font-bold tabular-nums">{formatCurrency(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {void Tag}
      {void formatReportCurrency}
      {void Badge}
    </div>
  );
}
