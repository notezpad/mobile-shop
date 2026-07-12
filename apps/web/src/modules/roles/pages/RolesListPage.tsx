import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Shield, Pencil } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { rolesApi, permissionsApi } from '../api/roles.api';
import type { Role, Permission } from '@mobile-shop/shared';
import { useMemo } from 'react';

export default function RolesListPage() {
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: permissionsApi.list,
  });

  // Group permissions by module for display.
  const permissionsByModule = useMemo(() => {
    const m = new Map<string, Permission[]>();
    permissions.forEach((p) => {
      const arr = m.get(p.module) ?? [];
      arr.push(p);
      m.set(p.module, arr);
    });
    return m;
  }, [permissions]);

  return (
    <div className="page-container">
      <PageHeader
        title="الأدوار والصلاحيات"
        description={`${roles.length} أدوار • ${permissions.length} صلاحية`}
        actions={
          <RequirePermission permission="roles.manage">
            <Button asChild>
              <Link to="/roles/new">
                <Plus className="size-4" />
                <span>إضافة دور</span>
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      {rolesLoading ? (
        <LoadingState />
      ) : roles.length === 0 ? (
        <EmptyState
          icon={<Shield />}
          title="لا توجد أدوار"
          description="سيتم تحميل الأدوار الافتراضية تلقائياً عند تهيئة قاعدة البيانات."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((role: Role) => (
            <Card key={role.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Shield className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{role.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {role.is_system ? 'دور نظامي' : 'دور مخصص'}
                      </p>
                    </div>
                  </div>
                  {role.is_system ? (
                    <Badge variant="secondary">نظام</Badge>
                  ) : (
                    <Badge variant="outline">مخصص</Badge>
                  )}
                </div>

                {role.description ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">{role.description}</p>
                ) : null}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="size-3.5" />
                  <span>
                    {role.key === 'super_admin'
                      ? 'كل الصلاحيات'
                      : `${permissionsByModule.size} وحدات متاحة`}
                  </span>
                </div>

                <div className="flex gap-2 pt-2">
                  <RequirePermission permission="roles.manage" fallback={null}>
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to={`/roles/${role.id}/edit`}>
                        <Pencil className="size-3.5" />
                        <span>تعديل الصلاحيات</span>
                      </Link>
                    </Button>
                  </RequirePermission>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Permissions reference */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-4 text-sm font-semibold">مرجع الصلاحيات</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(permissionsByModule.entries()).map(([module, perms]) => (
              <div key={module} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{module}</p>
                <div className="flex flex-wrap gap-1">
                  {perms.map((p) => (
                    <Badge key={p.id} variant="outline" className="text-[10px]">
                      {p.action}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
