/**
 * Repairs report page — productivity + revenue + turnaround.
 */
import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Wrench, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { useRepairsReport } from '../api/reports.api';
import { DateRangePicker, StatCard, ChartCard, ExportButton, formatReportDate } from '../components/report-shared';
import { formatCurrency, formatNumber } from '@core/utils/format';

const PIE_COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const STATUS_LABELS: Record<string, string> = {
  received: 'مستلم', diagnosing: 'تحت الفحص', waiting_parts: 'بانتظار قطع', repairing: 'قيد الإصلاح',
  ready: 'جاهز', delivered: 'تم التسليم', canceled: 'ملغي', warranty_return: 'ضمان',
};

export default function RepairsReportPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { data: report, isLoading } = useRepairsReport(fromDate || undefined, toDate || undefined);

  const handlePreset = (days: number) => {
    const to = new Date();
    const from = days === 0 ? new Date(to) : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    setFromDate(from.toISOString().split('T')[0]!);
    setToDate(to.toISOString().split('T')[0]!);
  };

  if (isLoading) return <LoadingState />;
  if (!report) return null;

  const statusData = report.byStatus.map((s) => ({ name: STATUS_LABELS[s.status] ?? s.status, value: s.count }));
  const dailyData = report.byDay.map((d) => ({ date: formatReportDate(d.date), مستلمة: d.received, مسلمة: d.delivered }));
  const techData = report.byTechnician.map((t) => ({ name: t.technicianName, تذاكر: t.count, إيراد: t.revenue }));

  return (
    <div className="page-container">
      <PageHeader title="تقرير الصيانة" description="إنتاجية الفنيين والإيرادات ومعدل الإصلاح" actions={<ExportButton onPrint={() => window.print()} />} />

      <DateRangePicker fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} onPreset={handlePreset} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي التذاكر" value={formatNumber(report.summary.totalRepairs, 0)} icon={<Wrench className="size-5" />} />
        <StatCard label="مكتملة" value={formatNumber(report.summary.completed, 0)} icon={<CheckCircle2 className="size-5" />} variant="success" />
        <StatCard label="إيراد الصيانة" value={formatCurrency(report.summary.totalRevenue)} icon={<DollarSign className="size-5" />} variant="primary" />
        <StatCard label="متوسط وقت الإصلاح" value={`${formatNumber(report.summary.avgRepairTime, 1)} ساعة`} icon={<Clock className="size-5" />} variant="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="توزيع الحالات">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name}: ${e.value}`}>
                {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="التذاكر اليومية (مستلمة vs مسلمة)">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="مستلمة" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="مسلمة" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="أداء الفنيين">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={techData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip formatter={((v: number, name: string) => name === "إيراد" ? formatCurrency(v) : formatNumber(v, 0)) as never} />
            <Legend />
            <Bar dataKey="تذاكر" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="إيراد" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {void Badge}
      {void CardContent}
    </div>
  );
}
