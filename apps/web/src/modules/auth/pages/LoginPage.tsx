import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Smartphone, LogIn, Lock, User, Eye, EyeOff } from 'lucide-react';
import { loginSchema, type LoginInput } from '@mobile-shop/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@components/ui';
import { useAuth } from '../hooks/useAuth';

/**
 * Login page — full integration with /auth/login API.
 *
 * Features:
 *  - React Hook Form + Zod validation.
 *  - Show/hide password toggle.
 *  - Redirect to the originally requested URL after successful login.
 *  - Toasts for success/error feedback.
 *  - RTL-aware icon placement (icons on the right).
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  // Where to redirect after login — defaults to /dashboard.
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (values: LoginInput) => {
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch {
      // toast handled inside useAuth.login
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Smartphone className="size-7" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl">Mobile Shop ERP</CardTitle>
          <p className="text-sm text-muted-foreground">سجّل الدخول للوصول إلى لوحة التحكم</p>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <div className="relative">
              <User className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                className="pr-9"
                placeholder="اكتب اسم المستخدم"
                aria-invalid={!!errors.username}
                {...register('username')}
              />
            </div>
            {errors.username ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.username.message}
              </p>
            ) : null}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="px-9"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            <LogIn className="size-4" />
            <span>تسجيل الدخول</span>
          </Button>

          <div className="rounded-md border border-info/30 bg-info/5 p-3 text-center text-xs text-muted-foreground">
            <p className="font-medium text-info-foreground">بيانات الدخول الافتراضية</p>
            <p className="mt-1">
              المستخدم: <code className="font-mono">super_admin</code>
            </p>
            <p>
              كلمة المرور: <code className="font-mono">Admin@123</code>
            </p>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            ليس لديك متجر؟{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              أنشئ متجرك الآن
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
