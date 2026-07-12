import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users as UsersIcon, Phone, Mail, Wallet, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useCustomers } from '../hooks/useCustomers';
import { customersApi } from '../api/customers.api';
import type { Customer } from '@mobile-shop/shared';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDate } from '@core/utils/date';

export default function CustomersListPage() {
  const [search, setSearch] = useState('');
  const [showWithBalance, setShowWithBalance] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useCustomers({
    page,
    pageSize,
    search: search || undefined,
    hasBalance: showWithBalance ? 'true' : undefined,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف العميل');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const customers = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="العملاء"
        description={`${total} عميل مسجل`}
        actions={
          <RequirePermission permission="customers.create">
            <Button asChild>
              <Link to="/customers/new">
                <Plus className="size-4" />
                <span>إضافة عميل</span>
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم، الهاتف، الكود…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pr-9"
              />
            </div>
            <Button
              variant={showWithBalance ? 'warning' : 'outline'}
              onClick={() => {
                setShowWithBalance((v) => !v);
                setPage(1);
              }}
            >
              <Wallet className="size-4" />
              <span>{showWithBalance ? 'الكل' : 'ذوي الأرصدة'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <LoadingState />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="لا يوجد عملاء"
          description="ابدأ بإضافة أول عميل"
          action={
            <RequirePermission permission="customers.create">
              <Button asChild>
                <Link to="/customers/new">
                  <Plus className="size-4" />
                  <span>إضافة عميل</span>
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
                    <th className="px-4 py-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الهاتف</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الكود</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الرصيد</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجمالي المشتريات</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الصيانات</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customers.map((c: Customer) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link to={`/customers/${c.id}`} className="flex items-center gap-2 hover:underline">
                          <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium">{c.name}</p>
                            {c.email ? (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="size-2.5" />
                                {c.email}
                              </p>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3" dir="ltr">
                        {c.phone ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Phone className="size-3 text-muted-foreground" />
                            {c.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{c.code ?? '—'}</td>
                      <td className="px-4 py-3">
                        {c.balance !== 0 ? (
                          <Badge variant={c.balance > 0 ? 'destructive' : 'success'} className="text-[10px]">
                            {formatCurrency(c.balance)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">مسوّى</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(c.total_purchases)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatNumber(c.total_repairs, 0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <RequirePermission permission="customers.edit" fallback={null}>
                            <Button asChild size="icon-sm" variant="ghost">
                              <Link to={`/customers/${c.id}/edit`} aria-label="تعديل">
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          </RequirePermission>
                          <RequirePermission permission="customers.delete" fallback={null}>
                            <ConfirmDialog
                              trigger={
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  aria-label="حذف"
                                  disabled={c.balance !== 0}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              }
                              title="حذف العميل"
                              description={
                                c.balance !== 0
                                  ? `لا يمكن حذف عميل برصيد معلّق (${formatCurrency(c.balance)}).`
                                  : `هل أنت متأكد من حذف "${c.name}"؟`
                              }
                              confirmLabel="حذف"
                              destructive
                              onConfirm={async () => {
                                await deleteMutation.mutateAsync(c.id);
                              }}
                            />
                          </RequirePermission>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  صفحة {page} من {totalPages}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isFetching}
                  >
                    التالي
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {void formatDate}
    </div>
  );
}
