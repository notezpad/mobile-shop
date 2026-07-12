import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Receipt,
  Printer,
  Ban,
  Phone,
  User,
  CreditCard,
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
  Label,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useSale } from '../hooks/useSales';
import { salesApi } from '../api/sales.api';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة',
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستاباي',
  fawry: 'فوري',
  credit: 'آجل',
  mixed: 'متعدد',
};

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: sale, isLoading } = useSale(id);
  const queryClient = useQueryClient();
  const [voidReason, setVoidReason] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);

  const voidMutation = useMutation({
    mutationFn: () => salesApi.void(id!, { reason: voidReason }),
    onSuccess: () => {
      toast.success('تم إلغاء البيع');
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !sale) return <LoadingState message="جارٍ تحميل الفاتورة…" />;

  const canVoid = sale.status === 'completed';

  return (
    <div className="page-container">
      <PageHeader
        title={`فاتورة ${sale.invoice_no}`}
        description={formatDateTime(sale.created_at)}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/sales">
                <ArrowRight className="size-4" />
                <span>العودة</span>
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setShowInvoice(true)}>
              <Printer className="size-4" />
              <span>معاينة الفاتورة</span>
            </Button>
            {canVoid ? (
              <RequirePermission permission="sales.void">
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive">
                      <Ban className="size-4" />
                      <span>إلغاء البيع</span>
                    </Button>
                  }
                  title="إلغاء البيع"
                  description="سيتم إرجاع المخزون وعكس رصيد العميل. لا يمكن التراجع."
                  confirmLabel="إلغاء البيع"
                  destructive
                  onConfirm={async () => {
                    if (!voidReason.trim()) {
                      toast.error('أدخل سبب الإلغاء');
                      return;
                    }
                    await voidMutation.mutateAsync();
                  }}
                />
              </RequirePermission>
            ) : null}
          </>
        }
      />

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <Badge
          variant={
            sale.status === 'completed'
              ? 'success'
              : sale.status === 'voided'
                ? 'destructive'
                : 'warning'
          }
          className="text-sm"
        >
          {sale.status === 'completed' ? 'مكتمل' : sale.status === 'voided' ? 'ملغى' : sale.status}
        </Badge>
        {sale.due_amount > 0 ? (
          <Badge variant="warning">دين: {formatCurrency(sale.due_amount)}</Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>أصناف الفاتورة ({sale.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-2 font-medium text-muted-foreground">المنتج</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">الكمية</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">السعر</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">الخصم</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sale.items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link to={`/catalog/products/${item.product_id}`} className="font-medium hover:underline">
                          {item.product_name ?? item.product_id}
                        </Link>
                        {item.imei1 ? (
                          <p className="text-xs text-muted-foreground font-mono" dir="ltr">IMEI: {item.imei1}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground font-mono">{item.product_sku ?? ''}</p>
                      </td>
                      <td className="px-4 py-2 tabular-nums">{item.quantity}</td>
                      <td className="px-4 py-2 tabular-nums">{formatCurrency(item.unit_price)}</td>
                      <td className="px-4 py-2 tabular-nums text-success">-{formatCurrency(item.discount)}</td>
                      <td className="px-4 py-2 font-bold tabular-nums">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Summary + payment */}
        <div className="space-y-4">
          {/* Parties */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">أطراف الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">الفرع</p>
                <p className="font-medium">{sale.branch_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الكاشير</p>
                <p className="font-medium flex items-center gap-1">
                  <User className="size-3" />
                  {sale.cashier_name ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">العميل</p>
                {sale.customer_name ? (
                  <div>
                    <Link to={`/customers/${sale.customer_id}`} className="font-medium hover:underline">
                      {sale.customer_name}
                    </Link>
                    {sale.customer_phone ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
                        <Phone className="size-3" />
                        {sale.customer_phone}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground">عميل نقدي</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">الملخص المالي</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المجموع الفرعي</span>
                <span className="tabular-nums">{formatCurrency(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 ? (
                <div className="flex justify-between text-success">
                  <span>الخصم</span>
                  <span className="tabular-nums">-{formatCurrency(sale.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">الضريبة</span>
                <span className="tabular-nums">{formatCurrency(sale.tax)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <span>الإجمالي</span>
                <span className="tabular-nums text-primary">{formatCurrency(sale.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المدفوع</span>
                <span className="tabular-nums">{formatCurrency(sale.paid)}</span>
              </div>
              {sale.change > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">صرف</span>
                  <span className="tabular-nums">{formatCurrency(sale.change)}</span>
                </div>
              ) : null}
              {sale.due_amount > 0 ? (
                <div className="flex justify-between text-destructive font-bold">
                  <span>متبقي (دين)</span>
                  <span className="tabular-nums">{formatCurrency(sale.due_amount)}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">المدفوعات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sale.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا مدفوعات مسجلة</p>
              ) : (
                sale.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <Badge variant="secondary" className="text-[10px]">
                        {PAYMENT_LABELS[p.method] ?? p.method}
                      </Badge>
                      {p.reference ? (
                        <span className="text-xs text-muted-foreground" dir="ltr">{p.reference}</span>
                      ) : null}
                    </div>
                    <span className="font-medium tabular-nums">{formatCurrency(p.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {sale.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ملاحظات</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{sale.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Void reason input (shown above the void dialog) */}
      {canVoid ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3">
            <Label htmlFor="voidReason" className="text-xs text-destructive">
              سبب إلغاء البيع (مطلوب للإلغاء)
            </Label>
            <input
              id="voidReason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="مثال: خطأ في الإدخال / عميل رفض"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
            />
          </CardContent>
        </Card>
      ) : null}

      {void Receipt}

      {/* Invoice preview modal */}
      {showInvoice && sale ? (
        <InvoicePreviewModal sale={sale} onClose={() => setShowInvoice(false)} />
      ) : null}
    </div>
  );
}
