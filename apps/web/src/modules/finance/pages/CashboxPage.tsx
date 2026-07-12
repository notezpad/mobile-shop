/**
 * Cashbox page — open/close + current balance + transactions.
 */
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Lock, Unlock, ArrowDownCircle, ArrowUpCircle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { useCurrentCashbox, cashboxApi } from '../api/finance.api';
import { useAuthStore } from '@stores/auth.store';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';
import type { Cashbox, CashboxTransaction } from '@mobile-shop/shared';

export default function CashboxPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: cashbox, isLoading } = useCurrentCashbox();
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [openNotes, setOpenNotes] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const { data: transactions = [] } = useQuery({
    queryKey: ['cashbox-transactions', cashbox?.id],
    queryFn: () => cashboxApi.getTransactions(cashbox!.id),
    enabled: !!cashbox?.id && cashbox.status === 'open',
  });

  const openMutation = useMutation({
    mutationFn: () => cashboxApi.open({ branchId: user!.branchId!, openingBalance, notes: openNotes || null }),
    onSuccess: () => {
      toast.success('تم فتح الخزنة');
      queryClient.invalidateQueries({ queryKey: ['cashbox'] });
      setShowOpen(false);
      setOpeningBalance(0);
      setOpenNotes('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeMutation = useMutation({
    mutationFn: () => cashboxApi.close(cashbox!.id, { closingBalance, notes: closeNotes || null }),
    onSuccess: () => {
      toast.success('تم إقفال الخزنة');
      queryClient.invalidateQueries({ queryKey: ['cashbox'] });
      setShowClose(false);
      setClosingBalance(0);
      setCloseNotes('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <LoadingState />;

  const totalIn = transactions.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  const expectedBalance = (cashbox?.opening_balance ?? 0) + totalIn - totalOut;

  return (
    <div className="page-container">
      <PageHeader
        title="الخزنة"
        description={cashbox ? `خزنة مفتوحة منذ ${formatDateTime(cashbox.opened_at)}` : 'لا توجد خزنة مفتوحة'}
        actions={
          cashbox?.status === 'open' ? (
            <Button variant="destructive" onClick={() => { setClosingBalance(expectedBalance); setShowClose(true); }}>
              <Lock className="size-4" />
              <span>إقفال الخزنة</span>
            </Button>
          ) : (
            <Button onClick={() => setShowOpen(true)}>
              <Unlock className="size-4" />
              <span>فتح خزنة جديدة</span>
            </Button>
          )
        }
      />

      {cashbox ? (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="رصيد افتتاحي" value={formatCurrency(cashbox.opening_balance)} icon={<Wallet className="size-5" />} />
            <KpiCard label="إجمالي داخل" value={formatCurrency(totalIn)} icon={<ArrowDownCircle className="size-5" />} variant="success" />
            <KpiCard label="إجمالي خارج" value={formatCurrency(totalOut)} icon={<ArrowUpCircle className="size-5" />} variant="destructive" />
            <KpiCard label="الرصيد المتوقع" value={formatCurrency(expectedBalance)} icon={<TrendingUp className="size-5" />} variant="primary" />
          </div>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>حركات الخزنة ({transactions.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <EmptyState icon={<Wallet />} title="لا حركات" description="ستظهر الحركات هنا عند تسجيل مبيعات أو مصاريع أو إيرادات" />
              ) : (
                <div className="divide-y">
                  {transactions.map((t: CashboxTransaction) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30">
                      <div className={`flex size-8 items-center justify-center rounded-full ${t.type === 'in' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                        {t.type === 'in' ? <ArrowDownCircle className="size-4" /> : <ArrowUpCircle className="size-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{t.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(t.created_at)} • {t.payment_method}
                        </p>
                      </div>
                      <span className={`font-bold tabular-nums ${t.type === 'in' ? 'text-success' : 'text-destructive'}`}>
                        {t.type === 'in' ? '+' : '-'}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={<Wallet />}
          title="لا توجد خزنة مفتوحة"
          description="افتح خزنة جديدة لبدء تسجيل المعاملات المالية"
          action={<Button onClick={() => setShowOpen(true)}><Unlock className="size-4" /><span>فتح خزنة</span></Button>}
        />
      )}

      {/* Open dialog */}
      {showOpen ? (
        <Dialog title="فتح خزنة جديدة" onClose={() => setShowOpen(false)}>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>الرصيد الافتتاحي</Label>
              <Input type="number" step="0.01" min="0" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} placeholder="ملاحظات (اختياري)" />
            </div>
            <Button className="w-full" onClick={() => openMutation.mutate()} loading={openMutation.isPending}>فتح</Button>
          </div>
        </Dialog>
      ) : null}

      {/* Close dialog */}
      {showClose ? (
        <Dialog title="إقفال الخزنة" onClose={() => setShowClose(false)}>
          <div className="space-y-3">
            <div className="rounded-md bg-muted/30 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">الرصيد المتوقع:</span><span className="font-bold">{formatCurrency(expectedBalance)}</span></div>
            </div>
            <div className="space-y-2">
              <Label>الرصيد الفعلي (العدّ)</Label>
              <Input type="number" step="0.01" min="0" value={closingBalance} onChange={(e) => setClosingBalance(Number(e.target.value))} />
            </div>
            {closingBalance !== expectedBalance ? (
              <p className="text-xs text-warning">⚠️ الفرق: {formatCurrency(closingBalance - expectedBalance)}</p>
            ) : null}
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="ملاحظات الإقفال" />
            </div>
            <Button variant="destructive" className="w-full" onClick={() => closeMutation.mutate()} loading={closeMutation.isPending}>تأكيد الإقفال</Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function KpiCard({ label, value, icon, variant = 'default' }: { label: string; value: string; icon: React.ReactNode; variant?: 'default' | 'success' | 'destructive' | 'primary' }) {
  const colorClass = variant === 'success' ? 'bg-success/10 text-success' : variant === 'destructive' ? 'bg-destructive/10 text-destructive' : variant === 'primary' ? 'bg-primary/10 text-primary' : 'bg-primary/10 text-primary';
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className={`flex size-9 items-center justify-center rounded-md ${colorClass}`}>{icon}</div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          {children}
          <Button variant="outline" className="w-full" onClick={onClose}>إلغاء</Button>
        </CardContent>
      </Card>
    </div>
  );
}

void (undefined as unknown as Cashbox);
