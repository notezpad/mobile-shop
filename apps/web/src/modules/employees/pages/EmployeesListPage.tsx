import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Users, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useEmployees, employeesApi } from '../api/employees.api';
import type { EmployeeWithDetails } from '@mobile-shop/shared';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDate } from '@core/utils/date';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  active: { label: 'نشط', variant: 'success' },
  on_leave: { label: 'في إجازة', variant: 'warning' },
  terminated: { label: 'منتهي', variant: 'destructive' },
};
const DEFAULT_STATUS = { label: '—', variant: 'secondary' as const };

export default function EmployeesListPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useEmployees({
    page, pageSize: 20, search: search || undefined,
    sortBy: 'createdAt', sortDir: 'desc',
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => employeesApi.delete(id),
    onSuccess: () => { toast.success('تم حذف الموظف'); queryClient.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const employees = data?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        title="الموظفون"
        description={`${data?.total ?? 0} موظف`}
        actions={
          <RequirePermission permission="employees.create">
            <Button asChild><Link to="/employees/new"><Plus className="size-4" /><span>إضافة موظف</span></Link></Button>
          </RequirePermission>
        }
      />
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="بحث بالاسم، الكود، الهاتف…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState /> : employees.length === 0 ? (
        <EmptyState icon={<Users />} title="لا موظفون" description="أضف أول موظف" action={
          <RequirePermission permission="employees.create"><Button asChild><Link to="/employees/new"><Plus className="size-4" /><span>إضافة موظف</span></Link></Button></RequirePermission>
        } />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الكود</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المنصب</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الفرع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الراتب</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المبيعات</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الصيانات</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map((e: EmployeeWithDetails) => {
                    const st = STATUS_LABELS[e.status] ?? DEFAULT_STATUS;
                    return (
                      <tr key={e.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link to={`/employees/${e.id}`} className="flex items-center gap-2 hover:underline">
                            <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">{e.full_name.charAt(0)}</div>
                            <div>
                              <p className="font-medium">{e.full_name}</p>
                              {e.phone ? <p className="text-xs text-muted-foreground" dir="ltr">{e.phone}</p> : null}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{e.code}</td>
                        <td className="px-4 py-3 text-xs">{e.position ?? '—'}</td>
                        <td className="px-4 py-3 text-xs">{e.branch_name ?? '—'}</td>
                        <td className="px-4 py-3 tabular-nums text-xs">{formatCurrency(e.base_salary + e.allowances)}</td>
                        <td className="px-4 py-3 tabular-nums text-xs">{e.sales_count ? `${formatNumber(e.sales_count, 0)} (${formatCurrency(e.sales_total ?? 0)})` : '—'}</td>
                        <td className="px-4 py-3 tabular-nums text-xs">{e.repairs_count ? `${formatNumber(e.repairs_count, 0)}` : '—'}</td>
                        <td className="px-4 py-3"><Badge variant={st.variant} className="text-[10px]">{st.label}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <RequirePermission permission="employees.edit" fallback={null}>
                              <Button asChild size="icon-sm" variant="ghost"><Link to={`/employees/${e.id}/edit`}><Pencil className="size-4" /></Link></Button>
                            </RequirePermission>
                            <RequirePermission permission="employees.delete" fallback={null}>
                              <ConfirmDialog
                                trigger={<Button size="icon-sm" variant="ghost" className="text-destructive"><Trash2 className="size-4" /></Button>}
                                title="حذف الموظف"
                                description={`هل أنت متأكد من حذف "${e.full_name}"؟`}
                                confirmLabel="حذف" destructive
                                onConfirm={async () => { await deleteMutation.mutateAsync(e.id); }}
                              />
                            </RequirePermission>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {void formatDate}
    </div>
  );
}
