import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Shield, Lock } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { rolesApi, permissionsApi } from '../api/roles.api';
import type { Permission } from '@mobile-shop/shared';
import { toast } from 'sonner';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  customers: 'العملاء',
  employees: 'الموظفون',
  catalog: 'الكتالوج',
  inventory: 'المخزون',
  sales: 'المبيعات',
  invoices: 'الفواتير',
  returns: 'المرتجعات',
  repairs: 'الصيانة',
  cashbox: 'الخزنة',
  expenses: 'المصروفات',
  revenues: 'الإيرادات',
  payments: 'وسائل الدفع',
  reports: 'التقارير',
  users: 'المستخدمون',
  roles: 'الأدوار',
  branches: 'الفروع',
  settings: 'الإعدادات',
  backup: 'النسخ الاحتياطي',
  audit_logs: 'سجل التدقيق',
};

const ACTION_LABELS: Record<string, string> = {
  view: 'عرض',
  create: 'إنشاء',
  edit: 'تعديل',
  delete: 'حذف',
  export: 'تصدير',
  print: 'طباعة',
  approve: 'اعتماد',
  manage: 'إدارة',
  adjust: 'تعديل',
  transfer: 'تحويل',
  stocktake: 'جرد',
  void: 'إلغاء',
  discount: 'خصم',
  discount_approve: 'اعتماد خصم',
  assign: 'إسناد',
  deliver: 'تسليم',
  cancel: 'إلغاء',
  open: 'فتح',
  close: 'إغلاق',
  restore: 'استعادة',
  sales: 'المبيعات',
  inventory: 'المخزون',
  repairs: 'الصيانة',
  finance: 'المالية',
  employees: 'الموظفون',
};

export default function RoleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: roleData, isLoading } = useQuery({
    queryKey: ['role', id],
    queryFn: () => rolesApi.get(id!),
    enabled: !!id,
  });

  const { data: allPermissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: permissionsApi.list,
  });

  const role = roleData?.role;
  const currentPermissionIds = new Set(roleData?.permissions.map((p) => p.id) ?? []);

  const [selected, setSelected] = useState<Set<string>>(new Set(currentPermissionIds));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Sync state when role loads.
  useEffect(() => {
    if (role) {
      setName(role.name);
      setDescription(role.description ?? '');
      setSelected(new Set(Array.from(currentPermissionIds)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role?.id]);

  const isSystemRole = role?.is_system ?? false;
  const isSuperAdmin = role?.key === 'super_admin';

  // Group permissions by module for display.
  const permissionsByModule = useMemo(() => {
    const m = new Map<string, Permission[]>();
    allPermissions.forEach((p) => {
      const arr = m.get(p.module) ?? [];
      arr.push(p);
      m.set(p.module, arr);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allPermissions]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!role) return;
      // Update metadata (if not system role).
      if (!isSystemRole) {
        await rolesApi.update(role.id, { name, description });
      }
      // Replace permissions (skip for super_admin — gets all at runtime).
      if (!isSuperAdmin) {
        await rolesApi.assignPermissions(role.id, Array.from(selected));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['role', id] });
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      toast.success('تم حفظ التعديلات');
      navigate('/roles');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const togglePermission = (permId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const toggleModule = (modulePerms: Permission[]) => {
    const allSelected = modulePerms.every((p) => selected.has(p.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        modulePerms.forEach((p) => next.delete(p.id));
      } else {
        modulePerms.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  if (isLoading || !role) return <LoadingState message="جارٍ تحميل الدور…" />;

  return (
    <div className="page-container">
      <PageHeader
        title={`تعديل صلاحيات: ${role.name}`}
        description={role.description ?? undefined}
        actions={
          <Button asChild variant="outline">
            <Link to="/roles">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      {isSuperAdmin ? (
        <Card className="border-info/30 bg-info/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Shield className="mt-0.5 size-5 text-info" />
            <div>
              <p className="font-medium text-info-foreground">دور super_admin</p>
              <p className="mt-1 text-muted-foreground">
                يمتلك هذا الدور جميع الصلاحيات تلقائياً ولا يمكن تعديلها. تُستخدم الصلاحيات
                أدناه للدور المرجعي فقط.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : isSystemRole ? (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Lock className="mt-0.5 size-5 text-warning" />
            <div>
              <p className="font-medium text-warning-foreground">دور نظامي</p>
              <p className="mt-1 text-muted-foreground">
                لا يمكن تعديل اسم أو وصف أدوار النظام، لكن يمكن تعديل الصلاحيات المخصصة لها.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Metadata */}
      {!isSystemRole ? (
        <Card>
          <CardHeader>
            <CardTitle>بيانات الدور</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">اسم الدور *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: مدير فرع"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف موجز لمسؤوليات الدور"
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Permissions matrix */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>الصلاحيات ({selected.size} مفعّلة)</CardTitle>
          {!isSuperAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(allPermissions.map((p) => p.id)))}
            >
              تحديد الكل
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className={isSuperAdmin ? 'pointer-events-none opacity-50' : ''}>
          <div className="space-y-4">
            {permissionsByModule.map(([moduleName, perms]) => {
              const allSelected = perms.every((p) => selected.has(p.id));
              const someSelected = perms.some((p) => selected.has(p.id));
              return (
                <div key={moduleName} className="rounded-md border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allSelected && someSelected;
                        }}
                        onChange={() => toggleModule(perms)}
                        className="size-4 rounded border-input accent-primary"
                      />
                      <span>{MODULE_LABELS[moduleName] ?? moduleName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {perms.filter((p) => selected.has(p.id)).length}/{perms.length}
                      </Badge>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {perms.map((p) => (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          selected.has(p.id)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => togglePermission(p.id)}
                          className="size-3 accent-primary"
                        />
                        <span>{ACTION_LABELS[p.action] ?? p.action}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link to="/roles">إلغاء</Link>
        </Button>
        {!isSuperAdmin ? (
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            <Save className="size-4" />
            <span>حفظ التعديلات</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
