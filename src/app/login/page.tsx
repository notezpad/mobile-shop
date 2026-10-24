"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays, Eye, EyeOff, Lock, Mail, ShieldCheck,
  Loader2, AlertCircle, ArrowRight, Check, WifiOff, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";
import { getOfflineUser, saveAuthSnapshot, type AuthUser } from "@/lib/auth-client";
import { useShopStore } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import LoginShowcase from "@/components/login/LoginShowcase";

type LoginError = { message: string; hint?: string };

export default function LoginPage() {
  const router = useRouter();
  const setUser = useShopStore((s) => s.setUser);
  const [email,    setEmail]    = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPass, setShowPass] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState<LoginError | null>(null);

  // 🛡️ PWA (2026-10-07): حالة الاتصال + الحساب المحفوظ على الجهاز.
  // لو المستخدم أوفلاين وكان سجّل دخول من الجهاز ده قبل كده، بنعرض له
  // زر «متابعة بالحساب المحفوظ» بيدخّله النظام من كاش الجهاز — من غير
  // إنترنت — بدل رسالة فشل ميتة.
  const [online,   setOnline]   = React.useState(true);
  const [savedUser, setSavedUser] = React.useState<AuthUser | null>(null);
  // تاريخ اليوم — بيتحط بعد التحميل عشان نتجنب اختلاف السيرفر والمتصفح
  const [today, setToday] = React.useState("");
  React.useEffect(() => {
    try {
      setToday(new Date().toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long" }));
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    let alive = true;
    ;(async () => {
      const u = await getOfflineUser();
      if (alive && u) setSavedUser(u);
    })();
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      alive = false;
    };
  }, []);

  const enterWithSavedSession = () => {
    if (!savedUser) return;
    setUser(savedUser);
    // Full navigation (مش router.push): أوفلاين الـ RSC transition بيفشل،
    // أما full load فبيخدمها الـ SW من كاش الصفحات مباشرة. مقصودة — نتخطى
    // تحذير القاعدة هنا عشان router.push هيغير السلوك المجرّب.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!email.trim() || !password) {
      setError({ message: "البريد وكلمة المرور مطلوبان" }); return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError({ message: "صيغة البريد غير صحيحة", hint: "مثال: name@example.com" }); return;
    }
    setLoading(true);
    try {
      const data = await api<{ ok: boolean; user?: any; error?: string }>("/api/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password, remember },
        // آمن نعيد المحاولة هنا: تسجيل الدخول عملية "قراءة/تحقق" وليس
        // إنشاء بيانات، فمفيش خطر تكرار — على عكس مثلاً حفظ فاتورة.
        idempotent: true,
      });
      if (data?.ok && data.user) {
        // 🛡️ PWA: احفظ نسخة السيشن فوراً عند نجاح الدخول — أول تذكرة
        // لدخول أوفلاين ناجح بعدها في أي وقت.
        void saveAuthSnapshot(data.user as AuthUser);
        toast.success(`أهلاً بك ${data.user.name ?? ""}`);
        router.push(data.user.role === "SUPER_ADMIN" ? "/" : "/dashboard");
        router.refresh();
      } else {
        setError({ message: data?.error ?? "فشل تسجيل الدخول" });
      }
    } catch (err: any) {
      setError({ message: err?.message ?? "تعذّر الاتصال", hint: "تأكد من اتصالك وحاول مرة أخرى" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lgn-main min-h-dvh grid lg:h-screen lg:grid-cols-2 bg-background lg:overflow-hidden">
      {/* ScaleWrapper بيصغّر الصفحة على الشاشات ≤1536px وبيظبط --app-h، بس lg:h-screen
          ما بتتأثرش بيه → الهيرو كان بيتقص من تحت. نخلي الارتفاع يتبع --app-h على الديسكتوب. */}
      <style dangerouslySetInnerHTML={{ __html: `@media (min-width:1024px){.lgn-main,.lgn-side{height:var(--app-h,100vh)}}
.lgn-side input:-webkit-autofill,
.lgn-side input:-webkit-autofill:hover,
.lgn-side input:-webkit-autofill:focus{
  -webkit-box-shadow:0 0 0 1000px #effcf7 inset !important;
  box-shadow:0 0 0 1000px #effcf7 inset !important;
  -webkit-text-fill-color:#0b2a20 !important;
  caret-color:#0b2a20;
  border-color:rgba(0,201,139,.45);
  transition:background-color 9999s ease-out 0s;
}` }} />

      {/* ─── Form side ─── */}
      <div className="lgn-side min-h-dvh lg:h-screen lg:overflow-y-auto flex items-center justify-center py-3 px-4 sm:py-6 bg-[#f7fbf9]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <div className="bg-card rounded-2xl border border-border shadow-lg shadow-black/5 p-4 space-y-3 sm:p-6 sm:space-y-5 overflow-hidden">

            {/* Brand + header — شريط التذكرة */}
            <header className="relative -mx-4 -mt-4 px-4 pt-4 pb-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 sm:pb-7 bg-gradient-to-b from-[#e3f9f0] via-[#f1fcf8] to-card border-b-2 border-dashed border-[#00c98b]/35">
              {/* نقط ناعمة في الركن */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: "radial-gradient(rgba(0,148,106,.26) 1px, transparent 1.4px)",
                  backgroundSize: "14px 14px",
                  WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 0% 0%, #000, transparent 75%)",
                  maskImage: "radial-gradient(ellipse 60% 70% at 0% 0%, #000, transparent 75%)",
                }}
              />
              {/* خروم التذكرة */}
              <span aria-hidden className="absolute -bottom-2.5 -left-2.5 size-5 rounded-full border border-border bg-[#f7fbf9]" />
              <span aria-hidden className="absolute -bottom-2.5 -right-2.5 size-5 rounded-full border border-border bg-[#f7fbf9]" />

              <div className="relative space-y-3 sm:space-y-5">
                {/* اللوجو الحقيقي للموقع */}
                <Link href="/" className="inline-flex items-center gap-3 group" aria-label="Nezam POS">
                  <img
                    src="/logo.svg" alt="" width={46} height={46}
                    className="size-[38px] sm:size-[46px] rounded-[15px] shadow-lg shadow-[#00c98b]/35 ring-2 ring-white transition-transform group-hover:scale-105 group-hover:-rotate-3"
                  />
                  <div className="leading-none">
                    <p dir="ltr" className="text-[19px] font-black tracking-tight text-foreground text-right">
                      Nezam <span className="text-[#00946a]">POS</span>
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">نظام المحل — مبيعات ومخزون وحسابات</p>
                  </div>
                </Link>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h1 className="text-[1.4rem] sm:text-[1.75rem] font-extrabold leading-tight tracking-tight text-foreground">أهلاً بعودتك</h1>
                    {today && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#00c98b]/30 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[#00694c]">
                        <CalendarDays className="size-3.5" />
                        {today}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 hidden text-[13px] leading-relaxed text-muted-foreground sm:block">مبيعاتك ومخزونك وخزنتك مستنيينك.</p>
                </div>
              </div>
            </header>

            {/* 🛡️ PWA: بطاقة الدخول بالحساب المحفوظ أوفلاين */}
            {!online && savedUser && (
              <button
                type="button"
                onClick={enterWithSavedSession}
                className="flex w-full items-center gap-3 rounded-xl border border-orange-300/60 bg-orange-50 dark:border-orange-700/60 dark:bg-orange-950/30 p-3 text-right transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white">
                  {(savedUser.name || "؟").trim().charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">
                    متابعة بالحساب المحفوظ — {savedUser.name}
                  </span>
                  <span dir="ltr" className="block truncate text-[11px] text-muted-foreground">
                    {savedUser.email}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-orange-500 rtl:rotate-180" />
              </button>
            )}

            {/* 🛡️ PWA: تنبيه واضح عند الانقطاع (بدل فشل صامت بعد إدخال البيانات) */}
            {!online && (
              <div className="flex items-start gap-2 rounded-xl border border-orange-300/50 bg-orange-50 dark:border-orange-700/50 dark:bg-orange-950/30 px-3 py-2.5 text-sm">
                <WifiOff className="size-4 shrink-0 mt-0.5 text-orange-500" />
                <div>
                  <p className="font-semibold text-orange-700 dark:text-orange-300 text-xs">
                    لا يوجد اتصال بالإنترنت الآن
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {savedUser
                      ? "تقدر تكمل بالنظام من الحساب المحفوظ فوق."
                      : "تسجيل الدخول يحتاج اتصالاً — النظام يشتغل أوفلاين بعد أول دخول ناجح على الجهاز."}
                  </p>
                </div>
              </div>
            )}

            {/* Error banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm">
                    <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-destructive text-xs">{error.message}</p>
                      {error.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{error.hint}</p>}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-3 sm:space-y-4">
              <Field label="البريد الإلكتروني" className="space-y-1.5 sm:space-y-2.5">
                <Input
                  type="email" placeholder="name@example.com"
                  icon={<Mail className="size-4" />}
                  value={email} onChange={(e: any) => { setEmail(e.target.value); setError(null) }}
                  autoComplete="email" dir="ltr" className="text-left focus-visible:!border-[#00c98b] focus-visible:!ring-[#00c98b]/25 h-10 sm:h-11"
                  disabled={loading} required inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                />
              </Field>

              <Field label="كلمة المرور" className="space-y-1.5 sm:space-y-2.5">
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"} placeholder="••••••••"
                    icon={<Lock className="size-4" />}
                    value={password} onChange={(e: any) => { setPassword(e.target.value); setError(null) }}
                    autoComplete="current-password" dir="ltr" className="text-left pl-10 focus-visible:!border-[#00c98b] focus-visible:!ring-[#00c98b]/25 h-10 sm:h-11"
                    disabled={loading} required
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 left-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1} aria-label={showPass ? "إخفاء" : "إظهار"}>
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <div
                    onClick={() => setRemember(!remember)}
                    className={cn(
                      "size-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer",
                      remember
                        ? "bg-[#00c98b] border-[#00c98b]"
                        : "border-border bg-background hover:border-[#00c98b]/60"
                    )}
                  >
                    {remember && <Check className="size-2.5 text-white" strokeWidth={3.5} />}
                  </div>
                  <Label className="text-xs font-normal cursor-pointer text-muted-foreground">تذكّرني</Label>
                </label>
                <Link href="/forgot-password"
                  className="text-xs font-bold text-[#00946a] transition-colors hover:text-[#00694c] hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <Button type="submit" variant="gradient" size="lg"
                className="w-full gap-2 !bg-none !bg-[#00c98b] hover:!bg-[#00b87e] !text-[#04261b] shadow-lg shadow-[#00c98b]/30 h-10 text-sm font-bold mt-1"
                disabled={loading}>
                {loading
                  ? <><Loader2 className="size-4 animate-spin" />جاري الدخول...</>
                  : <><ShieldCheck className="size-4" />تسجيل الدخول<ArrowRight className="size-4 rtl:rotate-180" /></>
                }
              </Button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-[11px] text-muted-foreground">ليس لديك حساب؟</span>
              </div>
            </div>

            {/* Signup CTA */}
            <Link href="/signup" className="block group">
              <div className="flex items-center gap-3 rounded-xl border border-[#00c98b]/35 bg-[#effcf7] px-3.5 py-2 sm:py-3 transition-all group-hover:border-[#00c98b] group-hover:bg-white group-hover:shadow-md group-hover:shadow-[#00c98b]/15">
                <span className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#19e0a2] to-[#00c98b] text-white shadow-md shadow-[#00c98b]/30 transition-transform group-hover:scale-105">
                  <UserPlus className="size-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">إنشاء حساب جديد</p>
                  <p className="text-[11px] leading-snug text-muted-foreground text-balance">جرّب 14 يوم مجاناً بدون بطاقة ائتمان</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[#00946a] rtl:rotate-180 transition-transform rtl:group-hover:-translate-x-1" />
              </div>
            </Link>

            <p className="hidden text-center text-[10px] text-muted-foreground/40 sm:block">© 2026 نظام المحل</p>
          </div>
        </motion.div>
      </div>

      {/* ─── Visual side ─── */}
      <LoginShowcase />
    </main>
  );
}
