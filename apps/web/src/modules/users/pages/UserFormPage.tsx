import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { BranchSelect } from '@components/data/BranchSelect';
import { createUserSchema, updateUserSchema } from '@mobile-shop/shared';
import type { CreateUserInput, UpdateUserInput } from '@mobile-shop/shared';
import { usersApi } from '../api/users.api';
import { rolesApi } from '@modules/roles/api/roles.api';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const isEditMode = (pathname: string) => pathname.endsWith('/edit');

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editMode = isEditMode(location.pathname) && !!id;

  const [showPin, setShowPin] = useState(false);

  // Load roles for the select dropdown.
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  // For edit mode, load existing user.
  const { data: existingUser, isLoading: userLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersApi.get(id!),
    enabled: editMode,
  });

  const schema = editMode ? updateUserSchema : createUserSchema;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<CreateUserInput>({
    resolver: zodResolver(schema),
    defaultValues: editMode
      ? {
          username: existingUser?.username ?? '',
          fullName: existingUser?.full_name ?? '',
          email: existingUser?.email ?? null,
          phone: existingUser?.phone ?? null,
          roleId: existingUser?.role_id ?? '',
          branchId: existingUser?.branch_id ?? null,
          status: existingUser?.status ?? 'active',
        }
      : {
          username: '',
          password: '',
          fullName: '',
          email: null,
          phone: null,
          roleId: '',
          status: 'active',
        },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CreateUserInput) => {
      if (editMode && id) {
        const update: UpdateUserInput = {
          fullName: values.fullName,
          email: values.email ?? null,
          phone: values.phone ?? null,
          roleId: values.roleId,
          branchId: values.branchId ?? null,
          status: values.status,
        };
        return usersApi.update(id, update);
      }
      return usersApi.create(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(editMode ? 'تم تحديث المستخدم' : 'تم إنشاء المستخدم');
      navigate('/users');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (editMode && userLoading) return <LoadingState message="جارٍ تحميل بيانات المستخدم…" />;
  if (rolesLoading) return <LoadingState message="جارٍ تحميل الأدوار…" />;

  const onSubmit = (values: CreateUserInput) => saveMutation.mutate(values);
  const selectedRoleId = watch('roleId');
  const requiresBranch = !['super_admin', 'accountant'].includes(
    roles.find((r) => r.id === selectedRoleId)?.key ?? '',
  );

  return (
    <div className="page-container">
      <PageHeader
        title={editMode ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
        description={editMode ? existingUser?.full_name : 'أنشئ حساباً جديداً لموظف في النظام'}
        actions={
          <Button asChild variant="outline">
            <Link to="/users">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>البيانات الأساسية</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Full name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">الاسم الكامل *</Label>
              <Input
                id="fullName"
                placeholder="مثال: أحمد محمد"
                aria-invalid={!!errors.fullName}
                {...register('fullName')}
              />
              {errors.fullName ? (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              ) : null}
            </div>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم *</Label>
              <Input
                id="username"
                placeholder="ahmed.mohamed"
                autoCapitalize="off"
                autoCorrect="off"
                disabled={editMode}
                aria-invalid={!!errors.username}
                {...register('username')}
              />
              {errors.username ? (
                <p className="text-xs text-destructive">{errors.username.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  أحرف إنجليزية وأرقام فقط. لا يمكن تغييره بعد الإنشاء.
                </p>
              )}
            </div>

            {/* Password (create only) */}
            {!editMode ? (
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور *</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">8 أحرف على الأقل.</p>
                )}
              </div>
            ) : null}

            {/* PIN (create only) */}
            {!editMode ? (
              <div className="space-y-2">
                <Label htmlFor="pin">PIN سريع (اختياري)</Label>
                <div className="relative">
                  <Input
                    id="pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="4 أرقام للدخول السريع"
                    className="pl-9"
                    aria-invalid={!!errors.pin}
                    {...register('pin')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                    tabIndex={-1}
                  >
                    {showPin ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
                {errors.pin ? (
                  <p className="text-xs text-destructive">{errors.pin.message}</p>
                ) : null}
              </div>
            ) : null}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="01XXXXXXXXX"
                aria-invalid={!!errors.phone}
                {...register('phone')}
              />
              {errors.phone ? (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              ) : null}
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="roleId">الدور *</Label>
              <select
                id="roleId"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
                aria-invalid={!!errors.roleId}
                {...register('roleId')}
              >
                <option value="">اختر الدور…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.is_system ? '(نظام)' : ''}
                  </option>
                ))}
              </select>
              {errors.roleId ? (
                <p className="text-xs text-destructive">{errors.roleId.message}</p>
              ) : null}
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">الحالة</Label>
              <select
                id="status"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
                {...register('status')}
              >
                <option value="active">نشط</option>
                <option value="suspended">موقوف</option>
                <option value="invited">مدعو</option>
              </select>
            </div>

            {/* Branch (only for non-system roles that need a branch scope) */}
            {requiresBranch ? (
              <div className="space-y-2">
                <Label htmlFor="branchId">الفرع</Label>
                <BranchSelect
                  value={watch('branchId') ?? null}
                  onChange={(val) => setValue('branchId', val ?? null)}
                  placeholder="— بدون فرع محدد —"
                />
                <input type="hidden" {...register('branchId')} />
                <p className="text-xs text-muted-foreground">
                  يحدد نطاق البيانات الافتراضي للمستخدم في النظام.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/users">إلغاء</Link>
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            <Save className="size-4" />
            <span>{editMode ? 'حفظ التعديلات' : 'إنشاء المستخدم'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
