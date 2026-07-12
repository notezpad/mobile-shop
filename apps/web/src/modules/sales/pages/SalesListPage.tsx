import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Receipt, Eye } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useSales } from '../hooks/useSales';
import type { SaleWithDetails } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';

const STATUS_META: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' }> = {
  completed: { label: 'مكتمل', variant: 'success' },
  voided: { label: 'ملغى', variant: 'destructive' },
  refunded: { label: 'مسترجع', variant: 'warning' },
  draft: { label: 'مسودة', variant: 'secondary' },
};

const DEFAULT_STATUS_META = { label: '—', variant: 'secondary' as const };

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة',
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستاباي',
  fawry: 'فوري',
  credit: 'آجل',
  mixed: 'متعدد',
};

export default function SalesListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isFetching } = useSales({
    page,
    pageSize,
    search: search || undefined,
    status: (statusFilter || undefined) as 'completed' | 'voided' | 'refunded' | 'draft' | undefined,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const sales = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="المبيعات"
        description={`${total} عملية بيع`}
        actions={
          <RequirePermission permission="sales.create">
            <Button asChild>
              <Link to="/pos">
                <Plus className="size-4" />
                <span>بيع جديد (POS)</span>
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الفاتورة أو اسم العميل…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pr-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              <option value="">كل الحالات</option>
              <option value="completed">مكتمل</option>
              <option value="voided">ملغى</option>
              <option value="refunded">مسترجع</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : sales.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="لا توجد مبيعات"
          description="ابدأ بإنشاء بيع جديد من نقطة البيع"
          action={
            <RequirePermission permission="sales.create">
              <Button asChild>
                <Link to="/pos">
                  <Plus className="size-4" />
                  <span>بيع جديد</span>
                </Link>
              </Button>
            </RequirePermission>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الفاتورة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">العميل</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الكاشير</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الإجمالي</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الدفع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sales.map((s: SaleWithDetails) => {
                    const statusMeta = STATUS_META[s.status] ?? DEFAULT_STATUS_META;
                    return (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{s.invoice_no}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(s.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {s.customer_name ?? <span className="text-muted-foreground text-xs">عميل نقدي</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{s.cashier_name ?? '—'}</td>
                        <td className="px-4 py-3 font-bold tabular-nums">{formatCurrency(s.total)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-[10px]">
                            {PAYMENT_LABELS[s.payment_method] ?? s.payment_method}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusMeta.variant} className="text-[10px]">
                            {statusMeta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button asChild size="icon-sm" variant="ghost">
                            <Link to={`/sales/${s.id}`} aria-label="عرض">
                              <Eye className="size-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  صفحة {page} من {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || isFetching}>
                    السابق
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || isFetching}>
                    التالي
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
