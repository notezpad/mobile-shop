import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Wrench, Eye, Smartphone } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useRepairs } from '../api/repairs.api';
import type { RepairWithDetails } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';
import { formatDate, formatDateTime } from '@core/utils/date';

type StatusMeta = {
  label: string;
  variant: 'secondary' | 'info' | 'warning' | 'success' | 'destructive';
  icon: typeof Wrench;
};

const STATUS_META: Record<string, StatusMeta> = {
  received: { label: 'مستلم', variant: 'secondary', icon: Wrench },
  diagnosing: { label: 'تحت الفحص', variant: 'info', icon: Wrench },
  waiting_parts: { label: 'بانتظار قطع', variant: 'warning', icon: Wrench },
  repairing: { label: 'قيد الإصلاح', variant: 'info', icon: Wrench },
  ready: { label: 'جاهز', variant: 'success', icon: Wrench },
  delivered: { label: 'تم التسليم', variant: 'success', icon: Wrench },
  canceled: { label: 'ملغي', variant: 'destructive', icon: Wrench },
  warranty_return: { label: 'ضمان', variant: 'warning', icon: Wrench },
};

const DEFAULT_STATUS_META: StatusMeta = { label: '—', variant: 'secondary', icon: Wrench };

export default function RepairsListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isFetching } = useRepairs({
    page,
    pageSize,
    search: search || undefined,
    status: (statusFilter || undefined) as 'received' | 'diagnosing' | 'waiting_parts' | 'repairing' | 'ready' | 'delivered' | 'canceled' | 'warranty_return' | undefined,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const repairs = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="الصيانة"
        description={`${total} تذكرة صيانة`}
        actions={
          <RequirePermission permission="repairs.create">
            <Button asChild>
              <Link to="/repairs/new">
                <Plus className="size-4" />
                <span>استلام جهاز</span>
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
                placeholder="بحث برقم التذكرة، الجهاز، IMEI، العميل…"
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
              {Object.entries(STATUS_META).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : repairs.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title="لا توجد تذاكر صيانة"
          description="ابدأ باستلام أول جهاز للصيانة"
          action={
            <RequirePermission permission="repairs.create">
              <Button asChild>
                <Link to="/repairs/new">
                  <Plus className="size-4" />
                  <span>استلام جهاز</span>
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
                    <th className="px-4 py-3 font-medium text-muted-foreground">التذكرة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الجهاز</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">العميل</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الفني</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المشكلة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الإجمالي</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">استلام</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {repairs.map((r: RepairWithDetails) => {
                    const statusMeta = STATUS_META[r.status] ?? DEFAULT_STATUS_META;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{r.ticket_no}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Smartphone className="size-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{r.device_brand} {r.device_model}</p>
                              {r.device_imei ? (
                                <p className="text-xs text-muted-foreground font-mono" dir="ltr">{r.device_imei}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/customers/${r.customer_id}`} className="hover:underline">
                            {r.customer_name ?? '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs">{r.technician_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                          {r.problem_description}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-medium">
                          {formatCurrency(r.total)}
                          {r.due_amount > 0 ? (
                            <Badge variant="warning" className="ml-1 text-[10px]">
                              دين {formatCurrency(r.due_amount)}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusMeta.variant} className="text-[10px]">
                            {statusMeta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(r.received_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Button asChild size="icon-sm" variant="ghost">
                            <Link to={`/repairs/${r.id}`} aria-label="عرض">
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

      {void formatDateTime}
    </div>
  );
}
