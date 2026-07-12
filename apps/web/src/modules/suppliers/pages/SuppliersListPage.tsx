import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Truck, Phone, Mail, Wallet, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { useSuppliers, suppliersApi } from '../api/suppliers.api';
import type { Supplier } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';

export default function SuppliersListPage() {
  const [search, setSearch] = useState('');
  const [showWithBalance, setShowWithBalance] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useSuppliers({
    page,
    pageSize,
    search: search || undefined,
    hasBalance: showWithBalance ? 'true' : undefined,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => suppliersApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف المورد');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const suppliers = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="الموردون"
        description={`${total} مورد مسجل`}
        actions={
          <Button asChild>
            <Link to="/suppliers/new">
              <Plus className="size-4" />
              <span>إضافة مورد</span>
            </Link>
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم، الكود، الهاتف…"
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

      {isLoading ? (
        <LoadingState />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={<Truck />}
          title="لا يوجد موردون"
          description="ابدأ بإضافة أول مورد"
          action={
            <Button asChild>
              <Link to="/suppliers/new">
                <Plus className="size-4" />
                <span>إضافة مورد</span>
              </Link>
            </Button>
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
                    <th className="px-4 py-3 font-medium text-muted-foreground">الكود</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الهاتف</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الرصيد</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suppliers.map((s: Supplier) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link to={`/suppliers/${s.id}`} className="flex items-center gap-2 hover:underline">
                          <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                            {s.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium">{s.name}</p>
                            {s.email ? (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="size-2.5" />
                                {s.email}
                              </p>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                      <td className="px-4 py-3" dir="ltr">
                        {s.phone ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Phone className="size-3 text-muted-foreground" />
                            {s.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.balance !== 0 ? (
                          <Badge variant={s.balance > 0 ? 'destructive' : 'success'} className="text-[10px]">
                            {formatCurrency(s.balance)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">مسوّى</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button asChild size="icon-sm" variant="ghost">
                            <Link to={`/suppliers/${s.id}/edit`} aria-label="تعديل">
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-destructive"
                                aria-label="حذف"
                                disabled={s.balance !== 0}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            }
                            title="حذف المورد"
                            description={
                              s.balance !== 0
                                ? `لا يمكن حذف مورد برصيد معلّق (${formatCurrency(s.balance)}).`
                                : `هل أنت متأكد من حذف "${s.name}"؟`
                            }
                            confirmLabel="حذف"
                            destructive
                            onConfirm={async () => {
                              await deleteMutation.mutateAsync(s.id);
                            }}
                          />
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
    </div>
  );
}
