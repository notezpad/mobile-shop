"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, Eye, EyeOff, ArrowLeft, Lock, Mail, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const [showPass, setShowPass] = React.useState(false);

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Form side */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Brand */}
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="size-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
              <Sparkles className="size-5 text-white" />
            </div>
            <span className="text-lg font-bold">نظام المحل</span>
          </Link>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">أهلاً بعودتك</h1>
            <p className="text-sm text-muted-foreground">سجّل الدخول للوصول إلى لوحة تحكم محلك</p>
          </div>

          <div className="space-y-4">
            <Field label="البريد الإلكتروني" required>
              <Input
                type="email"
                placeholder="admin@demo.com"
                icon={<Mail />}
                defaultValue="admin@demo.com"
              />
            </Field>

            <Field label="كلمة المرور" required hint="نسيت كلمة المرور؟">
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  icon={<Lock />}
                  defaultValue="admin123"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute inset-y-0 left-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="remember" className="size-4 rounded border-border accent-primary" defaultChecked />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">تذكّرني على هذا الجهاز</Label>
            </div>

            <Link href="/dashboard">
              <Button variant="gradient" size="lg" className="w-full gap-2">
                <ShieldCheck className="size-4" />
                تسجيل الدخول
              </Button>
            </Link>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-xs text-center text-muted-foreground">حسابات تجريبية:</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-card p-3 text-xs">
                <p className="font-semibold text-foreground mb-1">مدير المحل</p>
                <p className="text-muted-foreground">admin@demo.com</p>
                <p className="text-muted-foreground">admin123</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-xs">
                <p className="font-semibold text-foreground mb-1">موظف</p>
                <p className="text-muted-foreground">emp@demo.com</p>
                <p className="text-muted-foreground">emp123</p>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            ليس لديك حساب؟{" "}
            <Link href="#" className="font-medium text-primary hover:underline">
              ابدأ تجربة مجانية 14 يوم
            </Link>
          </p>
        </div>
      </div>

      {/* Visual side */}
      <div className="hidden lg:flex relative items-center justify-center bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 overflow-hidden">
        {/* Decorative shapes */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-12 right-12 size-72 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-12 left-12 size-96 rounded-full bg-accent-500/20 blur-3xl" />
          <div className="absolute inset-0 bg-grid opacity-[0.03]" />
        </div>

        <div className="relative z-10 max-w-lg p-12 text-white space-y-8">
          <Badge variant="gradient" className="bg-white/10 backdrop-blur text-white border-white/20">
            <CheckCircle2 className="size-3" />
            منصة SaaS متكاملة
          </Badge>

          <h2 className="text-4xl font-bold leading-tight">
            أدِر محلك بالكامل
            <br />
            من مكان واحد
          </h2>

          <p className="text-lg text-white/80 leading-relaxed">
            نظام شامل لإدارة المبيعات والمخزون والعملاء والصيانة والمالية —
            مع لوحة معلومات متطورة وتقارير لحظية.
          </p>

          <div className="space-y-3 pt-4">
            {[
              { icon: "📊", title: "لوحة معلومات Bento 2026", desc: "مؤشرات لحظية مع رسوم بيانية تفاعلية" },
              { icon: "🛒", title: "نقطة بيع سريعة", desc: "بيع بالباركود + فواتير + طباعة" },
              { icon: "📦", title: "إدارة مخزون ذكية", desc: "تنبيهات تلقائية + جرد + تحويلات" },
              { icon: "💰", title: "إدارة مالية متكاملة", desc: "خزنة + فودافون كاش + انستاباي + فوري" },
            ].map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl bg-white/5 backdrop-blur border border-white/10 p-4 animate-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="size-10 rounded-lg bg-white/10 flex items-center justify-center text-xl shrink-0">
                  {f.icon}
                </div>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-white/70">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 text-xs text-white/60">
            © 2026 Mobile Shop System · جميع الحقوق محفوظة
          </div>
        </div>
      </div>
    </main>
  );
}
