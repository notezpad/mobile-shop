/**
 * Finance report page — P&L + cash flow + category breakdown.
 */
import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { useFinanceReport } from '../api/reports.api';
import { DateRangePicker, StatCard, ChartCard, ExportButton, formatReportDate } from '../components/report-shared';
import { formatCurrency } from '@core/utils/format';

const EXPENSE_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#3b82f6'];
const REVENUE_COLORS = ['#10b981', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6'];

export default function FinanceReportPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { data: report, isLoading } = useFinanceReport(fromDate || undefined, toDate || undefined);

  const handlePreset = (days: number) => {
    const to = new Date();
    const from = days === 0 ? new Date(to) : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    setFromDate(from.toISOString().split('T')[0]!);
    setToDate(to.toISOString().split('T')[0]!);
  };

  if (isLoading) return <LoadingState />;
  if (!report) return null;

  const dailyData = report.dailyPnL.map((d) => ({
    date: formatReportDate(d.date),
    إيرادات: d.revenues,
    مصروفات: d.expenses,
    صافي: d.net,
  }));
  const expCatData = report.expensesByCategory.map((c) => ({ name: c.categoryName, value: c.total }));
  const revCatData = report.revenuesByCategory.map((c) => ({ name: c.categoryName, value: c.total }));

  return (
    <div className="page-container">
      <PageHeader title="التقرير المالي" description="الأرباح والخسائر والتدفقات النقدية" actions={<ExportButton onPrint={() => window.print()} />} />

      <DateRangePicker fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} onPreset={handlePreset} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي الإيرادات" value={formatCurrency(report.summary.totalRevenues)} icon={<TrendingUp className="size-5" />} variant="success" />
        <StatCard label="إجمالي المصروفات" value={formatCurrency(report.summary.totalExpenses)} icon={<TrendingDown className="size-5" />} variant="destructive" />
        <StatCard label="صافي الربح" value={formatCurrency(report.summary.netProfit)} icon={<DollarSign className="size-5" />} variant={report.summary.netProfit >= 0 ? 'primary' : 'destructive'} />
        <StatCard label="هامش الربح" value={`${formatNumber(report.summary.profitMargin, 1)}%`} icon={<Percent className="size-5" />} variant="warning" />
      </div>

      {/* Daily P&L chart */}
      <ChartCard title="التدفق النقدي اليومي">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
            <Legend />
            <Bar dataKey="إيرادات" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="مصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="المصروفات حسب الفئة">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={expCatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name}: ${formatCurrency(e.value)}`}>
                {expCatData.map((_, i) => <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="الإيرادات حسب الفئة">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={revCatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name}: ${formatCurrency(e.value)}`}>
                {revCatData.map((_, i) => <Cell key={i} fill={REVENUE_COLORS[i % REVENUE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Daily P&L Line chart */}
      <ChartCard title="صافي الربح اليومي">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
            <Line type="monotone" dataKey="صافي" stroke="#0f172a" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {void LineChart}
      {void Line}
      {void CardContent}
      {void formatNumber}
    </div>
  );
}

function formatNumber(v: number, d: number) {
  return v.toFixed(d);
}
