/**
 * Expenses page — list + create form (inline modal).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, TrendingDown, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Button, Input, Label, Badge, Textarea } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { expenseApi, useExpenseCategories, useCurrentCashbox } from '../api/finance.api';
import { useAuthStore } from '@stores/auth.store';
import { useQuery } from '@tanstack/react-query';
import type { Expense, ExpenseQuery } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';
import { formatDate } from '@core/utils/date';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'كاش' },
  { value: 'card', label: 'بطاقة' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'إنستاباي' },
  { value: 'fawry', label: 'فوري' },
];

export default function ExpensesPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const query: ExpenseQuery = {
    page,
    pageSize: 20,
    branchId: user?.branchId ?? undefined,
    sortBy: 'date',
    sortDir: 'desc',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', query],
    queryFn: () => expenseApi.list(query),
    placeholderData: (prev) => prev,
  });

  const { data: categories = [] } = useExpenseCategories();
  const { data: cashbox } = useCurrentCashbox();

  const expenses = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="page-container">
      <PageHeader
        title="المصروفات"
        description={`${total} مصروف • إجمالي: ${formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}`}
        actions={
          <RequirePermission permission="expenses.create">
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" />
              <span>مصروف جديد</span>
            </Button>
          </RequirePermission>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : expenses.length === 0 ? (
        <EmptyState icon={<TrendingDown />} title="لا مصروفات" description="سجّل أول مصروف" />
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
                  {expenses.map((e: Expense & { category_name?: string }) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(e.date)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">{e.category_name ?? '—'}</Badge>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums text-destructive">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3 text-xs">{PAYMENT_METHODS.find((m) => m.value === e.payment_method)?.label ?? e.payment_method}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{e.note ?? '—'}</td>
                      <td className="px-4 py-3">
                        <RequirePermission permission="expenses.delete" fallback={null}>
                          <ConfirmDialog
                            trigger={<Button size="icon-sm" variant="ghost" className="text-destructive"><Trash2 className="size-4" /></Button>}
                            title="حذف المصروف"
                            description="هل أنت متأكد من حذف هذا المصروف؟"
                            confirmLabel="حذف"
                            destructive
                            onConfirm={async () => {
                              await expenseApi.delete(e.id);
                              toast.success('تم حذف المصروف');
                              queryClient.invalidateQueries({ queryKey: ['expenses'] });
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
        <ExpenseForm
          categories={categories}
          cashboxId={cashbox?.status === 'open' ? cashbox.id : null}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['cashbox'] });
            setShowForm(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ExpenseForm({ categories, cashboxId, onClose, onSaved }: {
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
      expenseApi.create({
        branchId: user!.branchId!,
        categoryId,
        amount,
        paymentMethod: paymentMethod as 'cash' | 'card' | 'vodafone_cash' | 'instapay' | 'fawry',
        date,
        note: note || null,
        cashboxId,
      }),
    onSuccess: () => { toast.success('تم تسجيل المصروف'); onSaved(); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingDown className="size-5" /> مصروف جديد</h2>
          <div className="space-y-2">
            <Label>الفئة *</Label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring">
              <option value="">اختر الفئة…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>المبلغ *</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring">
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="وصف المصروف" />
          </div>
          {cashboxId ? (
            <p className="text-xs text-success flex items-center gap-1"><Wallet className="size-3" /> سيُسجّل على الخزنة المفتوحة</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>إلغاء</Button>
            <Button className="flex-1" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!categoryId || amount <= 0}>تسجيل</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
