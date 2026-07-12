/**
 * Inventory report page — valuation + low-stock + movements.
 */
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Package, AlertTriangle, DollarSign, Boxes } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { useInventoryReport } from '../api/reports.api';
import { StatCard, ChartCard, ExportButton } from '../components/report-shared';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';

const PIE_COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'شراء', sale: 'بيع', return_in: 'مرتجع عميل', return_out: 'مرتجع مورد',
  transfer_in: 'تحويل وارد', transfer_out: 'تحويل صادر', adjustment: 'تسوية', repair_in: 'إرجاع صيانة', repair_out: 'صرف صيانة',
};

export default function InventoryReportPage() {
  const { data: report, isLoading } = useInventoryReport();

  if (isLoading) return <LoadingState />;
  if (!report) return null;

  const categoryData = report.byCategory.map((c) => ({ name: c.categoryName, value: c.stockValue }));

  return (
    <div className="page-container">
      <PageHeader title="تقرير المخزون" description="تقييم المخزون والأصناف منخفضة المخزون" actions={<ExportButton onPrint={() => window.print()} />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي المنتجات" value={formatNumber(report.summary.totalProducts, 0)} icon={<Package className="size-5" />} />
        <StatCard label="إجمالي الوحدات" value={formatNumber(report.summary.totalUnits, 0)} icon={<Boxes className="size-5" />} />
        <StatCard label="قيمة المخزون (تكلفة)" value={formatCurrency(report.summary.totalValueCost)} icon={<DollarSign className="size-5" />} variant="primary" />
        <StatCard label="مخزون منخفض" value={formatNumber(report.summary.lowStockCount, 0)} subtitle={`نافد: ${report.summary.outOfStockCount}`} icon={<AlertTriangle className="size-5" />} variant="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="قيمة المخزون حسب الفئة">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => e.name}>
                {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={((v: number) => formatCurrency(v)) as never} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardContent className="p-0">
            <div className="border-b p-4"><h3 className="text-sm font-semibold">الأصناف منخفضة المخزون</h3></div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium text-muted-foreground">المنتج</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">المتوفر</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">الحد</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.lowStock.map((item, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2"><span className="font-medium">{item.productName}</span><p className="text-xs text-muted-foreground font-mono">{item.sku}</p></td>
                      <td className="px-3 py-2"><Badge variant="destructive" className="text-[10px]">{item.available}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{item.minQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4"><h3 className="text-sm font-semibold">آخر حركات المخزون</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-right">
                <tr>
                  <th className="px-4 py-2 font-medium text-muted-foreground">النوع</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">المنتج</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">الكمية</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">الفرع</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.recentMovements.map((m, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-2"><Badge variant="secondary" className="text-[10px]">{MOVEMENT_LABELS[m.type] ?? m.type}</Badge></td>
                    <td className="px-4 py-2">{m.productName}</td>
                    <td className={`px-4 py-2 font-bold tabular-nums ${m.quantity > 0 ? 'text-success' : 'text-destructive'}`}>{m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity, 0)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{m.branchName}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
