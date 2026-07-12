import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Receipt, Eye } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useReturns } from '../api/returns.api';
import type { ReturnWithDetails } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';

const STATUS_META: Record<string, { label: string; variant: 'warning' | 'success' | 'destructive' | 'secondary' }> = {
  pending: { label: 'قيد الانتظار', variant: 'warning' },
  approved: { label: 'معتمد', variant: 'success' },
  completed: { label: 'مكتمل', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'destructive' },
};

const DEFAULT_STATUS_META = { label: '—', variant: 'secondary' as const };

const REFUND_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة',
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستاباي',
  fawry: 'فوري',
  credit: 'آجل',
  store_credit: 'رصيد متجر',
};

export default function ReturnsListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isFetching } = useReturns({
    page,
    pageSize,
    search: search || undefined,
    status: (statusFilter || undefined) as 'pending' | 'approved' | 'rejected' | 'completed' | undefined,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const returns = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="المرتجعات"
        description={`${total} مرتجع`}
        actions={
          <RequirePermission permission="returns.create">
            <Button asChild>
              <Link to="/returns/new">
                <Plus className="size-4" />
                <span>مرتجع جديد</span>
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
                placeholder="بحث برقم المرتجع أو الفاتورة…"
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
              <option value="pending">قيد الانتظار</option>
              <option value="completed">مكتمل</option>
              <option value="rejected">مرفوض</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : returns.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="لا توجد مرتجعات"
          description="ابدأ بإنشاء مرتجع جديد لبيع موجود"
          action={
            <RequirePermission permission="returns.create">
              <Button asChild>
                <Link to="/returns/new">
                  <Plus className="size-4" />
                  <span>مرتجع جديد</span>
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
                    <th className="px-4 py-3 font-medium text-muted-foreground">رقم المرتجع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الفاتورة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">العميل</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المبلغ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الاسترجاع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {returns.map((r: ReturnWithDetails) => {
                    const statusMeta = STATUS_META[r.status] ?? DEFAULT_STATUS_META;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{r.return_no}</td>
                        <td className="px-4 py-3 font-mono text-xs">{r.sale_invoice_no ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="px-4 py-3">{r.customer_name ?? <span className="text-muted-foreground text-xs">عميل نقدي</span>}</td>
                        <td className="px-4 py-3 font-bold tabular-nums">{formatCurrency(r.total)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-[10px]">
                            {REFUND_LABELS[r.refund_method] ?? r.refund_method}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusMeta.variant} className="text-[10px]">{statusMeta.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button asChild size="icon-sm" variant="ghost">
                            <Link to={`/returns/${r.id}`} aria-label="عرض">
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
                <p className="text-muted-foreground">صفحة {page} من {totalPages}</p>
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
