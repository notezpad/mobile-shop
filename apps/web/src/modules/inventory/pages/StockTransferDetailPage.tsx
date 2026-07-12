import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Truck,
  PackageCheck,
  XCircle,
  Package as PackageIcon,
  MapPin,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Textarea,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { useStockTransfer } from '../hooks/useInventory';
import { useBranch } from '@modules/branches/hooks/useBranches';
import { useProducts } from '@modules/catalog/hooks/useCatalog';
import { stockTransfersApi } from '../api/inventory.api';
import { formatDateTime } from '@core/utils/date';
import { formatNumber } from '@core/utils/format';
import { useState } from 'react';

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

export default function StockTransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: transfer, isLoading } = useStockTransfer(id);
  const queryClient = useQueryClient();
  const [receiveNotes, setReceiveNotes] = useState('');

  const fromBranch = useBranch(transfer?.from_branch_id ?? null);
  const toBranch = useBranch(transfer?.to_branch_id ?? null);

  // Load products referenced in items.
  const productIds = transfer?.items?.map((i) => i.product_id) ?? [];
  const { data: productsData } = useProducts({
    page: 1,
    pageSize: 100,
    sortBy: 'name',
    sortDir: 'asc',
  });
  const productMap = new Map(
    (productsData?.items ?? [])
      .filter((p) => productIds.includes(p.id))
      .map((p) => [p.id, p]),
  );

  const shipMutation = useMutation({
    mutationFn: () => stockTransfersApi.ship(transfer!.id),
    onSuccess: () => {
      toast.success('تم شحن التحويل — تم خصم المخزون من الفرع المصدري');
      queryClient.invalidateQueries({ queryKey: ['stock-transfer', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const receiveMutation = useMutation({
    mutationFn: () => stockTransfersApi.receive(transfer!.id, { notes: receiveNotes || undefined }),
    onSuccess: () => {
      toast.success('تم استلام التحويل — تم إضافة المخزون للفرع الوجهة');
      queryClient.invalidateQueries({ queryKey: ['stock-transfer', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => stockTransfersApi.cancel(transfer!.id),
    onSuccess: () => {
      toast.success('تم إلغاء التحويل');
      queryClient.invalidateQueries({ queryKey: ['stock-transfer', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !transfer) return <LoadingState message="جارٍ تحميل التحويل…" />;

  const statusMeta = STATUS_META[transfer.status] ?? DEFAULT_STATUS_META;

  return (
    <div className="page-container">
      <PageHeader
        title={`تحويل ${transfer.id.slice(0, 8)}…`}
        description={`${fromBranch?.name ?? 'فرع'} → ${toBranch?.name ?? 'فرع'}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/inventory/transfers">
              <ArrowRight className="size-4" />
              <span>العودة</span>
            </Link>
          </Button>
        }
      />

      {/* Status banner */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Badge variant={statusMeta.variant} className="text-sm">
              {statusMeta.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {transfer.total_items} صنف
            </span>
          </div>
          <div className="flex gap-2">
            {transfer.status === 'draft' ? (
              <Button onClick={() => shipMutation.mutate()} loading={shipMutation.isPending}>
                <Truck className="size-4" />
                <span>شحن التحويل</span>
              </Button>
            ) : null}
            {transfer.status === 'in_transit' ? (
              <>
                <Textarea
                  placeholder="ملاحظات الاستلام…"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  rows={1}
                  className="h-10 w-48"
                />
                <Button
                  variant="success"
                  onClick={() => receiveMutation.mutate()}
                  loading={receiveMutation.isPending}
                >
                  <PackageCheck className="size-4" />
                  <span>استلام</span>
                </Button>
              </>
            ) : null}
            {transfer.status === 'draft' || transfer.status === 'in_transit' ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-destructive">
                    <XCircle className="size-4" />
                    <span>إلغاء</span>
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
                  await cancelMutation.mutateAsync();
                }}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Branches + timestamps */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="size-4" />
              من فرع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{fromBranch?.name ?? 'فرع محذوف'}</p>
            <p className="text-xs text-muted-foreground font-mono">{fromBranch?.code}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="size-4" />
              إلى فرع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{toBranch?.name ?? 'فرع محذوف'}</p>
            <p className="text-xs text-muted-foreground font-mono">{toBranch?.code}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="size-4" />
              التواريخ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>إنشاء: {formatDateTime(transfer.created_at)}</p>
            {transfer.shipped_at ? (
              <p>شحن: {formatDateTime(transfer.shipped_at)}</p>
            ) : null}
            {transfer.received_at ? (
              <p>استلام: {formatDateTime(transfer.received_at)}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Items table */}
      <Card>
        <CardHeader>
          <CardTitle>الأصناف</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-right">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">المنتج</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">الكمية المطلوبة</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">المستلم</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">المتبقي</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transfer.items.map((item) => {
                  const product = productMap.get(item.product_id);
                  const remaining = item.quantity - item.received_quantity;
                  return (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <PackageIcon className="size-4 text-muted-foreground" />
                          <Link
                            to={`/catalog/products/${item.product_id}`}
                            className="hover:underline"
                          >
                            {product?.name ?? 'منتج محذوف'}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{product?.sku ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {formatNumber(item.quantity, 0)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-success">
                        {formatNumber(item.received_quantity, 0)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {remaining > 0 ? (
                          <Badge variant="warning" className="text-[10px]">
                            {formatNumber(remaining, 0)} متبقي
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">
                            <PackageCheck className="size-2.5" />
                            مكتمل
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {transfer.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>ملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{transfer.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
