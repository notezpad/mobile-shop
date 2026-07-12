/**
 * Return detail page — shows return info + items + approve/reject actions.
 */
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Receipt,
  CheckCircle2,
  XCircle,
  User,
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
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useReturn } from '../api/returns.api';
import { returnsApi } from '../api/returns.api';
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

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: ret, isLoading } = useReturn(id);
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => returnsApi.approve(id!),
    onSuccess: () => {
      toast.success('تم اعتماد المرتجع وإرجاع المخزون');
      queryClient.invalidateQueries({ queryKey: ['return', id] });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => returnsApi.reject(id!),
    onSuccess: () => {
      toast.success('تم رفض المرتجع');
      queryClient.invalidateQueries({ queryKey: ['return', id] });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !ret) return <LoadingState message="جارٍ تحميل المرتجع…" />;

  const statusMeta = STATUS_META[ret.status] ?? DEFAULT_STATUS_META;
  const isPending = ret.status === 'pending';

  return (
    <div className="page-container">
      <PageHeader
        title={`مرتجع ${ret.return_no}`}
        description={formatDateTime(ret.created_at)}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/returns">
                <ArrowRight className="size-4" />
                <span>العودة</span>
              </Link>
            </Button>
            {isPending ? (
              <RequirePermission permission="returns.approve">
                <ConfirmDialog
                  trigger={
                    <Button variant="success">
                      <CheckCircle2 className="size-4" />
                      <span>اعتماد وإكمال</span>
                    </Button>
                  }
                  title="اعتماد المرتجع"
                  description={`سيتم إرجاع المخزون واسترجاع ${formatCurrency(ret.total)} للعميل. هل أنت متأكد؟`}
                  confirmLabel="اعتماد"
                  onConfirm={async () => {
                    await approveMutation.mutateAsync();
                  }}
                />
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive">
                      <XCircle className="size-4" />
                      <span>رفض</span>
                    </Button>
                  }
                  title="رفض المرتجع"
                  description="سيتم رفض المرتجع نهائياً. لا يمكن التراجع."
                  confirmLabel="رفض"
                  destructive
                  onConfirm={async () => {
                    await rejectMutation.mutateAsync();
                  }}
                />
              </RequirePermission>
            ) : null}
          </>
        }
      />

      {/* Status */}
      <div className="flex items-center gap-2">
        <Badge variant={statusMeta.variant} className="text-sm">{statusMeta.label}</Badge>
        <Badge variant="outline" className="text-[10px]">
          استرجاع: {REFUND_LABELS[ret.refund_method] ?? ret.refund_method}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>الأصناف المرتجعة ({ret.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-2 font-medium text-muted-foreground">الصنف</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">الكمية</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">الاسترجاع</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ret.items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <span className="font-medium">
                          {item.product_name ?? 'منتج'}
                        </span>
                        {item.imei1 ? (
                          <p className="text-xs text-muted-foreground font-mono" dir="ltr">IMEI: {item.imei1}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{item.quantity}</td>
                      <td className="px-4 py-2 font-bold tabular-nums">{formatCurrency(item.refund_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-left font-medium">الإجمالي:</td>
                    <td className="px-4 py-2 font-bold tabular-nums text-primary">{formatCurrency(ret.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">معلومات المرتجع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">الفاتورة الأصلية</p>
                <Link to={`/sales/${ret.sale_id}`} className="font-mono text-xs hover:underline">
                  {ret.sale_invoice_no ?? '—'}
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الفرع</p>
                <p className="font-medium">{ret.branch_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">العميل</p>
                {ret.customer_name ? (
                  <Link to={`/customers/${ret.customer_id}`} className="font-medium hover:underline flex items-center gap-1">
                    <User className="size-3" />
                    {ret.customer_name}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">عميل نقدي</p>
                )}
              </div>
              {ret.approved_by_name ? (
                <div>
                  <p className="text-xs text-muted-foreground">المعتمد بواسطة</p>
                  <p className="font-medium">{ret.approved_by_name}</p>
                  {ret.approved_at ? (
                    <p className="text-xs text-muted-foreground">{formatDateTime(ret.approved_at)}</p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {ret.reason ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">السبب</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{ret.reason}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {void Receipt}
    </div>
  );
}
