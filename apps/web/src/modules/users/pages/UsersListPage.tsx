import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Users as UsersIcon, Pencil, Trash2, KeyRound } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { StatusBadge } from '@components/data/StatusBadge';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { usersApi } from '../api/users.api';
import { rolesApi } from '@modules/roles/api/roles.api';
import { formatDate } from '@core/utils/date';
import type { User, Role } from '@mobile-shop/shared';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  { value: 'active', label: 'نشط' },
  { value: 'suspended', label: 'موقوف' },
  { value: 'invited', label: 'مدعو' },
];

export default function UsersListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleIdFilter, setRoleIdFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();

  // Load roles for filter + display.
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  const roleMap = useMemo(() => {
    const m = new Map<string, Role>();
    roles.forEach((r) => m.set(r.id, r));
    return m;
  }, [roles]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['users', { page, pageSize, search, statusFilter, roleIdFilter }],
    queryFn: () =>
      usersApi.list({
        page,
        pageSize,
        search: search || undefined,
        status: (statusFilter || undefined) as 'active' | 'suspended' | 'invited' | undefined,
        roleId: roleIdFilter || undefined,
        sortBy: 'createdAt',
        sortDir: 'desc',
      }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف المستخدم');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="المستخدمون"
        description={`${total} مستخدم مسجل في النظام`}
        actions={
          <RequirePermission permission="users.create">
            <Button asChild>
              <Link to="/users/new">
                <Plus className="size-4" />
                <span>إضافة مستخدم</span>
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الهاتف…"
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

            <select
              value={roleIdFilter}
              onChange={(e) => {
                setRoleIdFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              <option value="">كل الأدوار</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setRoleIdFilter('');
                setPage(1);
              }}
            >
              إعادة تعيين الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState />
          ) : users.length === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title="لا يوجد مستخدمون"
              description="ابدأ بإضافة أول مستخدم للنظام"
              action={
                <RequirePermission permission="users.create">
                  <Button asChild>
                    <Link to="/users/new">
                      <Plus className="size-4" />
                      <span>إضافة مستخدم</span>
                    </Link>
                  </Button>
                </RequirePermission>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الاسم</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">اسم المستخدم</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الدور</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">آخر دخول</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u: User) => {
                    const role = roleMap.get(u.role_id);
                    return (
                      <tr key={u.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                              {u.full_name?.charAt(0) ?? 'U'}
                            </div>
                            <div>
                              <p className="font-medium">{u.full_name}</p>
                              {u.phone ? (
                                <p className="text-xs text-muted-foreground">{u.phone}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                        <td className="px-4 py-3">
                          {role ? (
                            <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                              {role.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={u.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.last_login_at ? formatDate(u.last_login_at) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <RequirePermission
                              permission="users.edit"
                              fallback={null}
                            >
                              <Button asChild size="icon-sm" variant="ghost">
                                <Link to={`/users/${u.id}/edit`} aria-label="تعديل">
                                  <Pencil className="size-4" />
                                </Link>
                              </Button>
                              <Button
                                asChild
                                size="icon-sm"
                                variant="ghost"
                              >
                                <Link to={`/users/${u.id}/password`} aria-label="إعادة تعيين كلمة المرور">
                                  <KeyRound className="size-4" />
                                </Link>
                              </Button>
                            </RequirePermission>
                            <RequirePermission
                              permission="users.delete"
                              fallback={null}
                            >
                              <ConfirmDialog
                                trigger={
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    aria-label="حذف"
                                    disabled={u.username === 'super_admin'}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                }
                                title="حذف المستخدم"
                                description={`هل أنت متأكد من حذف "${u.full_name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
                                confirmLabel="حذف"
                                destructive
                                onConfirm={async () => {
                                  await deleteMutation.mutateAsync(u.id);
                                }}
                              />
                            </RequirePermission>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
