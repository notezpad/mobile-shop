import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowRight, KeyRound, Save } from 'lucide-react';
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
import { PASSWORD_MIN_LENGTH } from '@mobile-shop/shared';
import { usersApi } from '../api/users.api';
import { toast } from 'sonner';

const resetSchema = z
  .object({
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `كلمة المرور ${PASSWORD_MIN_LENGTH} أحرف على الأقل`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof resetSchema>;

export default function UserPasswordPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersApi.get(id!),
    enabled: !!id,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetForm) => usersApi.resetPassword(id!, values.newPassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('تم تغيير كلمة المرور بنجاح');
      navigate('/users');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !user) return <LoadingState message="جارٍ تحميل المستخدم…" />;

  return (
    <div className="page-container">
      <PageHeader
        title="إعادة تعيين كلمة المرور"
        description={`المستخدم: ${user.full_name} (${user.username})`}
        actions={
          <Button asChild variant="outline">
            <Link to="/users">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              كلمة المرور الجديدة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">كلمة المرور الجديدة *</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...register('newPassword')}
              />
              {errors.newPassword ? (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">تأكيد كلمة المرور *</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>

            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
              ⚠️ سيُطلب من المستخدم تسجيل الدخول بكلمة المرور الجديدة في المرة القادمة.
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/users">إلغاء</Link>
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            <Save className="size-4" />
            <span>تغيير كلمة المرور</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
