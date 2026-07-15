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
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Landmark,
  Store,
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
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useCustomer, useCustomerTransactions } from '../hooks/useCustomers';
import { customersApi } from '../api/customers.api';
import type { CustomerTransaction, PaymentMethodKey } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';
import { cn } from '@core/utils/cn';

const TYPE_META: Record<string, { label: string; icon: typeof ShoppingBag; variant: 'info' | 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  sale: { label: 'بيع', icon: ShoppingBag, variant: 'info' },
  return: { label: 'مرتجع', icon: Receipt, variant: 'warning' },
  repair: { label: 'صيانة', icon: Wrench, variant: 'secondary' },
  payment: { label: 'دفعة', icon: Wallet, variant: 'success' },
  adjustment: { label: 'تسوية', icon: Plus, variant: 'destructive' },
};

const DEFAULT_TYPE_META = { label: 'أخرى', icon: Receipt, variant: 'secondary' as const };

const PAYMENT_METHODS: Array<{ key: PaymentMethodKey; label: string; icon: typeof Banknote }> = [
  { key: 'cash', label: 'كاش', icon: Banknote },
  { key: 'vodafone_cash', label: 'فودافون كاش', icon: Smartphone },
  { key: 'instapay', label: 'إنستاباي', icon: Landmark },
  { key: 'fawry', label: 'فوري', icon: Store },
  { key: 'card', label: 'بطاقة', icon: CreditCard },
];

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useCustomer(id);
  const { data: txResult } = useCustomerTransactions(id, 1, 50);
  const queryClient = useQueryClient();

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // Payment modal state — used for the new "تسجيل دفعة" feature.
  const [showPayment, setShowPayment] = useState(false);

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

        {/* Balance + payment actions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              الحساب
            </CardTitle>
            <div className="flex gap-2">
              <RequirePermission permission="customers.edit">
                <Button variant="outline" size="sm" onClick={() => setShowPayment(true)}>
                  <Wallet className="size-4" />
                  <span>تسجيل دفعة</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAdjust((v) => !v)}>
                  {showAdjust ? 'إلغاء' : 'تسوية يدوية'}
                </Button>
              </RequirePermission>
            </div>
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
                      placeholder="مثال: تسوية / خطأ في الإدخال"
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
                  <p className={cn(
                    'text-3xl font-bold tabular-nums',
                    customer.balance > 0 && 'text-destructive',
                    customer.balance < 0 && 'text-success',
                  )}>
                    {formatCurrency(customer.balance)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {customer.balance > 0
                      ? 'مدين — العميل لازم يدفع'
                      : customer.balance < 0
                        ? 'دائن — دفع زيادة / دفعة مقدمة'
                        : 'الحساب مسوّى'}
                  </p>
                </div>
                <div className="text-right text-xs">
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
              لا توجد معاملات بعد. ستظهر المبيعات والصيانات والمرتجعات والدفعات هنا.
            </div>
          ) : (
            <div className="divide-y">
              {transactions.map((tx: CustomerTransaction) => {
                const meta = TYPE_META[tx.type] ?? DEFAULT_TYPE_META;
                const Icon = meta.icon;
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                    <div className={cn(
                      'flex size-9 items-center justify-center rounded-full',
                      meta.variant === 'info' && 'bg-info/10 text-info',
                      meta.variant === 'success' && 'bg-success/10 text-success',
                      meta.variant === 'warning' && 'bg-warning/10 text-warning',
                      meta.variant === 'destructive' && 'bg-destructive/10 text-destructive',
                      meta.variant === 'secondary' && 'bg-secondary text-secondary-foreground',
                    )}>
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
                      <p className={cn(
                        'font-bold tabular-nums',
                        tx.amount > 0 ? 'text-destructive' : 'text-success',
                      )}>
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

      {/* ─── Payment Modal ──────────────────────────────────────────── */}
      {showPayment && customer ? (
        <PaymentModal
          customerName={customer.name}
          currentBalance={customer.balance}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['customer', id] });
            queryClient.invalidateQueries({ queryKey: ['customer-transactions', id] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['cashbox'] });
            queryClient.invalidateQueries({ queryKey: ['cashbox-transactions'] });
            setShowPayment(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────

interface PaymentModalProps {
  customerName: string;
  currentBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({ customerName, currentBalance, onClose, onSuccess }: PaymentModalProps) {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethodKey>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      customersApi.recordPayment(id!, {
        amount,
        paymentMethod: method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (data) => {
      toast.success(
        `تم تسجيل دفعة بـ ${formatCurrency(data.payment.amount)} (${PAYMENT_METHODS.find((m) => m.key === data.payment.payment_method)?.label ?? data.payment.payment_method})`,
      );
      // Invalidate everything that depends on customer balance + cashbox.
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customer-transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['cashbox'] });
      queryClient.invalidateQueries({ queryKey: ['cashbox-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      onSuccess();
    },
    onError: (err: Error) => {
      const msg = err.message || '';
      if (/aborted|AbortError|تم إلغاء/i.test(msg)) {
        toast.error('انقطع الاتصال أثناء تسجيل الدفعة. تحقق من رصيد العميل — لو لم يتغير، حاول مرة أخرى.');
      } else {
        toast.error(msg);
      }
    },
  });

  const handleSubmit = () => {
    if (amount <= 0) {
      toast.error('أدخل مبلغ أكبر من صفر');
      return;
    }
    mutation.mutate();
  };

  const newBalance = currentBalance - amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border bg-card shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">تسجيل دفعة</h2>
            <p className="text-xs text-muted-foreground">{customerName}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {/* Current balance display */}
          <div className={cn(
            'rounded-md p-3 text-center',
            currentBalance > 0 ? 'bg-destructive/10' : currentBalance < 0 ? 'bg-success/10' : 'bg-muted',
          )}>
            <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
            <p className={cn(
              'text-2xl font-bold tabular-nums',
              currentBalance > 0 && 'text-destructive',
              currentBalance < 0 && 'text-success',
            )}>
              {formatCurrency(currentBalance)}
            </p>
            {currentBalance > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">مدين — العميل لازم يدفع</p>
            ) : currentBalance < 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">دائن — دفعة مقدمة</p>
            ) : null}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">المبلغ المدفوع *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="0.00"
              dir="ltr"
              className="text-lg font-bold"
              autoFocus
            />
            {/* Quick-fill buttons */}
            <div className="flex gap-2">
              {currentBalance > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(currentBalance)}
                >
                  سداد كامل ({formatCurrency(currentBalance)})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount((v) => (v > 0 ? v / 2 : 0))}
                disabled={amount <= 0}
              >
                نص المبلغ
              </Button>
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors',
                    method === m.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-muted/50',
                  )}
                >
                  <m.icon className="size-4" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reference (for digital payments) */}
          {method !== 'cash' ? (
            <div className="space-y-2">
              <Label htmlFor="reference">مرجع المعاملة (اختياري)</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="مثال: رقم عملية فودافون كاش"
                dir="ltr"
              />
            </div>
          ) : null}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: دفعة على الحساب"
              rows={2}
            />
          </div>

          {/* New balance preview */}
          {amount > 0 ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الرصيد بعد الدفعة</span>
                <span className={cn(
                  'font-bold tabular-nums',
                  newBalance > 0 && 'text-destructive',
                  newBalance < 0 && 'text-success',
                )}>
                  {formatCurrency(newBalance)}
                </span>
              </div>
              {newBalance === 0 ? (
                <p className="mt-1 text-center text-xs text-success">✓ سيتم تصفير الحساب</p>
              ) : newBalance < 0 ? (
                <p className="mt-1 text-center text-xs text-success">
                  سيتحول العميل إلى دائن بـ {formatCurrency(Math.abs(newBalance))}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Cashbox notice */}
          {method !== 'card' ? (
            <p className="rounded-md bg-info/5 p-2 text-center text-xs text-muted-foreground">
              💰 سيتم إضافة المبلغ تلقائياً للخزنة المفتوحة
            </p>
          ) : null}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              إلغاء
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={amount <= 0}
            >
              <Wallet className="size-4" />
              <span>تأكيد الدفعة</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────

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
            className={cn(
              'flex size-9 items-center justify-center rounded-md',
              variant === 'destructive'
                ? 'bg-destructive/10 text-destructive'
                : variant === 'success'
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary',
            )}
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
