import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRightLeft, ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Button, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { useStockTransfers } from '../hooks/useInventory';
import { useBranch } from '@modules/branches/hooks/useBranches';
import { stockTransfersApi } from '../api/inventory.api';
import type { StockTransfer } from '@mobile-shop/shared';
import { formatDateTime } from '@core/utils/date';

type StatusMeta = {
  label: string;
  variant: 'secondary' | 'info' | 'success' | 'destructive';
};

const STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'مسودة', variant: 'secondary' },
  in_transit: { label: 'قيد التحويل', variant: 'info' },
  received: { label: 'مستلم', variant: 'success' },
  canceled: { label: 'ملغي', variant: 'destructive' },
};

const DEFAULT_STATUS_META: StatusMeta = { label: 'غير معروف', variant: 'secondary' };

export default function StockTransfersListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useStockTransfers({
    page,
    pageSize,
    status: (statusFilter || undefined) as 'draft' | 'in_transit' | 'received' | 'canceled' | undefined,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => stockTransfersApi.cancel(id),
    onSuccess: () => {
      toast.success('تم إلغاء التحويل');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const transfers = data?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        title="تحويلات المخزون"
        description={`${data?.total ?? 0} تحويل بين الفروع`}
        actions={
          <RequirePermission permission="inventory.transfer">
            <Button asChild>
              <Link to="/inventory/transfers/new">
                <Plus className="size-4" />
                <span>تحويل جديد</span>
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      {/* Status filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            {['', 'draft', 'in_transit', 'received', 'canceled'].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {s === '' ? 'الكل' : STATUS_META[s]?.label ?? s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : transfers.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft />}
          title="لا توجد تحويلات"
          description="ابدأ بإنشاء تحويل مخزون بين الفروع"
          action={
            <RequirePermission permission="inventory.transfer">
              <Button asChild>
                <Link to="/inventory/transfers/new">
                  <Plus className="size-4" />
                  <span>تحويل جديد</span>
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
                    <th className="px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">من فرع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إلى فرع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">عدد الأصناف</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transfers.map((t: StockTransfer) => (
                    <TransferRow
                      key={t.id}
                      transfer={t}
                      onCancel={(id) => cancelMutation.mutateAsync(id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {data && data.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  صفحة {page} من {data.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isFetching}
                  >
                    السابق
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages || isFetching}
                  >
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

function TransferRow({
  transfer,
  onCancel,
}: {
  transfer: StockTransfer;
  onCancel: (id: string) => Promise<unknown>;
}) {
  const fromBranch = useBranch(transfer.from_branch_id);
  const toBranch = useBranch(transfer.to_branch_id);
  const statusMeta = STATUS_META[transfer.status] ?? DEFAULT_STATUS_META;

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatDateTime(transfer.created_at)}
      </td>
      <td className="px-4 py-3">{fromBranch?.name ?? 'فرع محذوف'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <ArrowRight className="size-3 text-muted-foreground" />
          <span>{toBranch?.name ?? 'فرع محذوف'}</span>
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums">{transfer.total_items}</td>
      <td className="px-4 py-3">
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <Link to={`/inventory/transfers/${transfer.id}`}>
              <ArrowRight className="size-4" />
              <span>تفاصيل</span>
            </Link>
          </Button>
          {transfer.status === 'draft' || transfer.status === 'in_transit' ? (
            <ConfirmDialog
              trigger={
                <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label="إلغاء">
                  <X className="size-4" />
                </Button>
              }
              title="إلغاء التحويل"
              description={
                transfer.status === 'in_transit'
                  ? 'سيتم إرجاع المخزون إلى الفرع المصدري. هل أنت متأكد؟'
                  : 'هل أنت متأكد من إلغاء هذا التحويل؟'
              }
              confirmLabel="إلغاء التحويل"
              destructive
              onConfirm={async () => {
                await onCancel(transfer.id);
              }}
            />
          ) : null}
        </div>
      </td>
    </tr>
  );
}
