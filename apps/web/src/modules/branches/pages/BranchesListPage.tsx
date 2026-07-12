import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Building2, Pencil, Trash2, MapPin, Phone, Star } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { branchesApi } from '../api/branches.api';
import type { Branch, BranchSettings } from '@mobile-shop/shared';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  { value: 'true', label: 'نشط' },
  { value: 'false', label: 'موقوف' },
];

export default function BranchesListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['branches', { page, pageSize, search, statusFilter }],
    queryFn: () =>
      branchesApi.list({
        page,
        pageSize,
        search: search || undefined,
        isActive: (statusFilter || undefined) as 'true' | 'false' | undefined,
        sortBy: 'name',
        sortDir: 'asc',
      }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => branchesApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف الفرع');
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const branches = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="الفروع"
        description={`${total} فرع مسجل في النظام`}
        actions={
          <RequirePermission permission="branches.manage">
            <Button asChild>
              <Link to="/branches/new">
                <Plus className="size-4" />
                <span>إضافة فرع</span>
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pr-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setPage(1);
              }}
            >
              إعادة تعيين الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <LoadingState />
      ) : branches.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="لا توجد فروع"
          description="ابدأ بإضافة أول فرع للنظام"
          action={
            <RequirePermission permission="branches.manage">
              <Button asChild>
                <Link to="/branches/new">
                  <Plus className="size-4" />
                  <span>إضافة فرع</span>
                </Link>
              </Button>
            </RequirePermission>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch: Branch) => {
            const settings = (branch.settings as BranchSettings) ?? null;
            return (
              <Card key={branch.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="size-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold">{branch.name}</p>
                          {branch.is_main ? (
                            <Badge variant="warning" className="text-[10px]">
                              <Star className="size-2.5" />
                              رئيسي
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{branch.code}</p>
                      </div>
                    </div>
                    <Badge variant={branch.is_active ? 'success' : 'destructive'}>
                      {branch.is_active ? 'نشط' : 'موقوف'}
                    </Badge>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {branch.address ? (
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3.5" />
                        <span className="truncate">{branch.address}</span>
                      </div>
                    ) : null}
                    {branch.phone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="size-3.5" />
                        <span dir="ltr">{branch.phone}</span>
                      </div>
                    ) : null}
                    {settings ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Badge variant="outline" className="text-[10px]">
                          ضريبة {settings.taxRate}%
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {settings.currency}
                        </Badge>
                        {settings.enableVatInvoice && settings.vatNumber ? (
                          <Badge variant="outline" className="text-[10px]">
                            VAT: {settings.vatNumber}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 border-t pt-3">
                    <RequirePermission permission="branches.manage" fallback={null}>
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to={`/branches/${branch.id}/edit`}>
                          <Pencil className="size-3.5" />
                          <span>تعديل</span>
                        </Link>
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={branch.is_main}
                            aria-label="حذف"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        }
                        title="حذف الفرع"
                        description={`هل أنت متأكد من حذف "${branch.name}"؟ لا يمكن حذف الفرع الرئيسي.`}
                        confirmLabel="حذف"
                        destructive
                        onConfirm={async () => {
                          await deleteMutation.mutateAsync(branch.id);
                        }}
                      />
                    </RequirePermission>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
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
    </div>
  );
}
