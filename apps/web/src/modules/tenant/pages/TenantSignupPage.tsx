/**
 * Tenant Signup page — SaaS onboarding.
 * Creates a new tenant (shop) + first admin user.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Smartphone, Store, User, Lock, Globe, ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@components/ui';
import { tenantApi } from '../api/tenant.api';
import { useAuthStore } from '@stores/auth.store';
import type { TenantSignupInput } from '@mobile-shop/shared';

export default function TenantSignupPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    username: '',
    password: '',
    fullName: '',
    email: '' as string | null,
    phone: '' as string | null,
    planSlug: 'free',
  });

  const update = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const mutation = useMutation({
    mutationFn: () => {
      const input: TenantSignupInput = {
        ...form,
        email: form.email || undefined,
        phone: form.phone || null,
      };
      return tenantApi.signup(input);
    },
    onSuccess: (data) => {
      localStorage.setItem('mse-access-token', data.accessToken);
      setSession({
        user: {
          id: '',
          username: form.username,
          fullName: form.fullName,
          roleId: '',
          roleKey: 'admin',
          branchId: null,
          permissions: [],
          preferences: { theme: 'system', language: 'ar', sidebarCollapsed: false },
        },
        accessToken: data.accessToken,
      });
      toast.success(`تم إنشاء متجرك "${data.tenant.name}" بنجاح!`);
      navigate('/dashboard', { replace: true });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleNext = () => {
    if (step === 1) {
      if (!form.tenantName.trim() || !form.tenantSlug.trim()) {
        toast.error('أدخل اسم المتجر والرابط');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!form.username.trim() || !form.password.trim() || !form.fullName.trim()) {
        toast.error('أدخل جميع البيانات المطلوبة');
        return;
      }
      mutation.mutate();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Smartphone className="size-7" />
          </div>
          <h1 className="text-2xl font-bold">أنشئ متجرك</h1>
          <p className="text-sm text-muted-foreground">ابدأ بإدارة محلك في دقائق</p>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
              <span className="text-sm font-medium">بيانات المتجر</span>
              <div className="flex-1 border-t border-dashed" />
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
              <span className="text-sm font-medium">حساب المدير</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="tenantName"><Store className="inline size-4 ml-1" /> اسم المتجر *</Label>
                  <Input
                    id="tenantName"
                    value={form.tenantName}
                    onChange={(e) => update('tenantName', e.target.value)}
                    placeholder="مثال: موبايل ستور"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenantSlug"><Globe className="inline size-4 ml-1" /> رابط المتجر *</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="tenantSlug"
                      value={form.tenantSlug}
                      onChange={(e) => update('tenantSlug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="my-shop"
                      dir="ltr"
                      className="font-mono"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">.mobileshop.app</span>
                  </div>
                  <p className="text-xs text-muted-foreground">أحرف إنجليزية صغيرة وأرقام وشرطات فقط.</p>
                </div>
                <Button className="w-full" onClick={handleNext}>
                  التالي
                  <ArrowRight className="size-4 rtl-flip" />
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName"><User className="inline size-4 ml-1" /> الاسم الكامل *</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => update('fullName', e.target.value)}
                    placeholder="مثال: أحمد محمد"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">اسم المستخدم *</Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => update('username', e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                    placeholder="admin"
                    dir="ltr"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password"><Lock className="inline size-4 ml-1" /> كلمة المرور *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني (اختياري)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => update('email', e.target.value || null)}
                    placeholder="admin@example.com"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">الهاتف (اختياري)</Label>
                  <Input
                    id="phone"
                    value={form.phone ?? ''}
                    onChange={(e) => update('phone', e.target.value || null)}
                    placeholder="01XXXXXXXXX"
                    dir="ltr"
                  />
                </div>

                {/* Plan info */}
                <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm">
                  <p className="flex items-center gap-1 font-medium text-info-foreground">
                    <CheckCircle2 className="size-4" />
                    الباقة المجانية
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    فرع واحد • 3 مستخدمين • 100 منتج • تقارير أساسية
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    يمكنك الترقية لاحقاً بدون تغيير أي بيانات.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    السابق
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => mutation.mutate()}
                    loading={mutation.isPending}
                  >
                    <Store className="size-4" />
                    <span>إنشاء المتجر</span>
                  </Button>
                </div>
              </>
            )}

            <div className="text-center text-xs text-muted-foreground">
              لديك متجر بالفعل؟{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                تسجيل الدخول
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
