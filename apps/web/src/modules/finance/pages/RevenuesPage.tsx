/**
 * Revenues page — list + create form (inline modal).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Button, Input, Label, Badge, Textarea } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { revenueApi, useRevenueCategories, useCurrentCashbox } from '../api/finance.api';
import { useAuthStore } from '@stores/auth.store';
import type { Revenue, RevenueQuery } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';
import { formatDate } from '@core/utils/date';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'كاش' },
  { value: 'card', label: 'بطاقة' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'إنستاباي' },
  { value: 'fawry', label: 'فوري' },
];

export default function RevenuesPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const query: RevenueQuery = {
    page,
    pageSize: 20,
    branchId: user?.branchId ?? undefined,
    sortBy: 'date',
    sortDir: 'desc',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['revenues', query],
    queryFn: () => revenueApi.list(query),
    placeholderData: (prev) => prev,
  });

  const { data: categories = [] } = useRevenueCategories();
  const { data: cashbox } = useCurrentCashbox();

  const revenues = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="page-container">
      <PageHeader
        title="الإيرادات"
        description={`${total} إيراد • إجمالي: ${formatCurrency(revenues.reduce((s, r) => s + r.amount, 0))}`}
        actions={
          <RequirePermission permission="revenues.create">
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" />
              <span>إيراد جديد</span>
            </Button>
          </RequirePermission>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : revenues.length === 0 ? (
        <EmptyState icon={<TrendingUp />} title="لا إيرادات" description="سجّل أول إيراد" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الفئة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المبلغ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الدفع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">ملاحظات</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {revenues.map((r: Revenue & { category_name?: string }) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(r.date)}</td>
                      <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{r.category_name ?? '—'}</Badge></td>
                      <td className="px-4 py-3 font-bold tabular-nums text-success">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-3 text-xs">{PAYMENT_METHODS.find((m) => m.value === r.payment_method)?.label ?? r.payment_method}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{r.note ?? '—'}</td>
                      <td className="px-4 py-3">
                        <RequirePermission permission="revenues.delete" fallback={null}>
                          <ConfirmDialog
                            trigger={<Button size="icon-sm" variant="ghost" className="text-destructive"><Trash2 className="size-4" /></Button>}
                            title="حذف الإيراد"
                            description="هل أنت متأكد؟"
                            confirmLabel="حذف"
                            destructive
                            onConfirm={async () => {
                              await revenueApi.delete(r.id);
                              toast.success('تم حذف الإيراد');
                              queryClient.invalidateQueries({ queryKey: ['revenues'] });
                              queryClient.invalidateQueries({ queryKey: ['cashbox'] });
                            }}
                          />
                        </RequirePermission>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm ? (
        <RevenueForm
          categories={categories}
          cashboxId={cashbox?.status === 'open' ? cashbox.id : null}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['revenues'] });
            queryClient.invalidateQueries({ queryKey: ['cashbox'] });
            setShowForm(false);
          }}
        />
      ) : null}
    </div>
  );
}

function RevenueForm({ categories, cashboxId, onClose, onSaved }: {
  categories: Array<{ id: string; name: string }>;
  cashboxId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]!);
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      revenueApi.create({
        branchId: user!.branchId!,
        categoryId,
        amount,
        paymentMethod: paymentMethod as 'cash' | 'card' | 'vodafone_cash' | 'instapay' | 'fawry',
        date,
        note: note || null,
        cashboxId,
      }),
    onSuccess: () => { toast.success('تم تسجيل الإيراد'); onSaved(); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="size-5" /> إيراد جديد</h2>
          <div className="space-y-2">
            <Label>الفئة *</Label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring">
              <option value="">اختر الفئة…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>المبلغ *</Label><Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div className="space-y-2"><Label>طريقة الدفع</Label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring">
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          {cashboxId ? <p className="text-xs text-success flex items-center gap-1"><Wallet className="size-3" /> سيُسجّل على الخزنة المفتوحة</p> : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>إلغاء</Button>
            <Button variant="success" className="flex-1" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!categoryId || amount <= 0}>تسجيل</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
