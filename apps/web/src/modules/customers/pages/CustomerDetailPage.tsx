import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Pencil,
  User,
  Phone,
  Mail,
  MapPin,
  Wallet,
  ShoppingBag,
  Wrench,
  Receipt,
  Plus,
  Minus,
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
  Input,
  Label,
  Textarea,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useCustomer, useCustomerTransactions } from '../hooks/useCustomers';
import { customersApi } from '../api/customers.api';
import type { CustomerTransaction } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';

const TYPE_META: Record<string, { label: string; icon: typeof ShoppingBag; variant: 'info' | 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  sale: { label: 'بيع', icon: ShoppingBag, variant: 'info' },
  return: { label: 'مرتجع', icon: Receipt, variant: 'warning' },
  repair: { label: 'صيانة', icon: Wrench, variant: 'secondary' },
  payment: { label: 'دفعة', icon: Wallet, variant: 'success' },
  adjustment: { label: 'تسوية', icon: Plus, variant: 'destructive' },
};

const DEFAULT_TYPE_META = { label: 'أخرى', icon: Receipt, variant: 'secondary' as const };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useCustomer(id);
  const { data: txResult } = useCustomerTransactions(id, 1, 20);
  const queryClient = useQueryClient();

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  const adjustMutation = useMutation({
    mutationFn: () =>
      customersApi.adjustBalance(id!, {
        amount: adjustAmount,
        reason: adjustReason,
      }),
    onSuccess: () => {
      toast.success('تم تسوية الرصيد');
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customer-transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowAdjust(false);
      setAdjustAmount(0);
      setAdjustReason('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !customer) return <LoadingState message="جارٍ تحميل العميل…" />;

  const transactions = txResult?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        title={customer.name}
        description={customer.code ?? undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/customers">
                <ArrowRight className="size-4" />
                <span>العودة</span>
              </Link>
            </Button>
            <RequirePermission permission="customers.edit">
              <Button asChild>
                <Link to={`/customers/${customer.id}/edit`}>
                  <Pencil className="size-4" />
                  <span>تعديل</span>
                </Link>
              </Button>
            </RequirePermission>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="الرصيد الحالي"
          value={formatCurrency(customer.balance)}
          icon={<Wallet className="size-5" />}
          variant={customer.balance > 0 ? 'destructive' : customer.balance < 0 ? 'success' : 'default'}
        />
        <KpiCard
          label="حد الائتمان"
          value={formatCurrency(customer.credit_limit)}
          icon={<Wallet className="size-5" />}
        />
        <KpiCard
          label="إجمالي المشتريات"
          value={formatCurrency(customer.total_purchases)}
          icon={<ShoppingBag className="size-5" />}
        />
        <KpiCard
          label="عدد الصيانات"
          value={String(customer.total_repairs)}
          icon={<Wrench className="size-5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Contact info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-5" />
              بيانات التواصل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow icon={<Phone className="size-4" />} label="الهاتف" value={customer.phone ?? '—'} dir="ltr" />
            <DetailRow icon={<Mail className="size-4" />} label="البريد" value={customer.email ?? '—'} dir="ltr" />
            <DetailRow icon={<MapPin className="size-4" />} label="العنوان" value={customer.address ?? '—'} />
            {customer.tax_number ? (
              <DetailRow label="الرقم الضريبي" value={customer.tax_number} dir="ltr" />
            ) : null}
            {customer.notes ? (
              <div className="border-t pt-2">
                <p className="text-xs text-muted-foreground">ملاحظات</p>
                <p className="mt-1">{customer.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Balance adjustment */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              تسوية الرصيد
            </CardTitle>
            <RequirePermission permission="customers.edit">
              <Button variant="outline" size="sm" onClick={() => setShowAdjust((v) => !v)}>
                {showAdjust ? 'إلغاء' : 'تسوية'}
              </Button>
            </RequirePermission>
          </CardHeader>
          <CardContent>
            {showAdjust ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="adjustAmount">المبلغ (موجب = مدين، سالب = دائن)</Label>
                    <Input
                      id="adjustAmount"
                      type="number"
                      step="0.01"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(Number(e.target.value))}
                      placeholder="مثال: 100 أو -50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustReason">السبب *</Label>
                    <Input
                      id="adjustReason"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      placeholder="مثال: دفعة نقدية / دين سابق"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdjustAmount((v) => Math.abs(v))}
                  >
                    <Plus className="size-4" />
                    <span>مدين (+)</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdjustAmount((v) => -Math.abs(v))}
                  >
                    <Minus className="size-4" />
                    <span>دائن (-)</span>
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    onClick={() => adjustMutation.mutate()}
                    loading={adjustMutation.isPending}
                    disabled={adjustAmount === 0 || !adjustReason.trim()}
                  >
                    تأكيد التسوية
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
                  <p className={`text-2xl font-bold ${customer.balance > 0 ? 'text-destructive' : customer.balance < 0 ? 'text-success' : ''}`}>
                    {formatCurrency(customer.balance)}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {customer.balance > 0 ? (
                    <Badge variant="destructive">عميل مدين</Badge>
                  ) : customer.balance < 0 ? (
                    <Badge variant="success">رصيد دائن</Badge>
                  ) : (
                    <Badge variant="secondary">مسوّى</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transaction timeline */}
      <Card>
        <CardHeader>
          <CardTitle>سجل المعاملات ({txResult?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد معاملات بعد. ستظهر المبيعات والصيانات والمرتجعات هنا.
            </div>
          ) : (
            <div className="divide-y">
              {transactions.map((tx: CustomerTransaction) => {
                const meta = TYPE_META[tx.type] ?? DEFAULT_TYPE_META;
                const Icon = meta.icon;
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                    <div className={`flex size-9 items-center justify-center rounded-full bg-${meta.variant}/10 text-${meta.variant}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(tx.created_at)}
                        {tx.ref_number ? ` • ${tx.ref_number}` : ''}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className={`font-bold tabular-nums ${tx.amount > 0 ? 'text-destructive' : 'text-success'}`}>
                        {tx.amount > 0 ? '+' : ''}
                        {formatCurrency(tx.amount)}
                      </p>
                      <Badge variant={meta.variant} className="text-[10px]">
                        {meta.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {void ConfirmDialog}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  variant = 'default',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant?: 'default' | 'destructive' | 'success';
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div
            className={`flex size-9 items-center justify-center rounded-md ${
              variant === 'destructive'
                ? 'bg-destructive/10 text-destructive'
                : variant === 'success'
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary'
            }`}
          >
            {icon}
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon,
  label,
  value,
  dir,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  dir?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium" dir={dir}>
        {value}
      </span>
    </div>
  );
}
