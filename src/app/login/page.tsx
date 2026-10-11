"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Eye, EyeOff, Lock, Mail, ShieldCheck,
  Loader2, AlertCircle, ArrowRight, TrendingUp,
  Store, Boxes, Wallet, Check, Zap, Users, BarChart3, WifiOff,
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

type LoginError = { message: string; hint?: string };

const FEATURES = [
  { icon: TrendingUp, label: "لوحة معلومات", desc: "مؤشرات لحظية",   color: "#818cf8" },
  { icon: Store,      label: "نقطة بيع",     desc: "باركود + فواتير", color: "#34d399" },
  { icon: Boxes,      label: "مخزون ذكي",    desc: "تنبيهات + جرد",  color: "#60a5fa" },
  { icon: Wallet,     label: "إدارة مالية",  desc: "خزنة + محافظ",   color: "#f59e0b" },
];

const RECENT_TXS = [
  { name: "فاتورة #1042",  amount: "+850",  time: "منذ 4 د",  color: "#34d399" },
  { name: "إرجاع #1041",   amount: "-120",  time: "منذ 11 د", color: "#f87171" },
  { name: "فاتورة #1040",  amount: "+1,200",time: "منذ 18 د", color: "#34d399" },
  { name: "فاتورة #1039",  amount: "+350",  time: "منذ 30 د", color: "#34d399" },
];

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
    // أما full load فبيخدمها الـ SW من كاش الصفحات مباشرة.
    window.location.href = "/dashboard";
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
        toast.success(`أهلاً بك ${data.user.name ?? ""} 👋`);
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
    <main className="min-h-dvh grid lg:h-screen lg:grid-cols-2 bg-background lg:overflow-hidden">

      {/* ─── Form side ─── */}
      <div className="min-h-dvh lg:h-screen lg:overflow-y-auto flex items-center justify-center py-6 px-4 bg-muted/30">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <div className="bg-card rounded-2xl border border-border shadow-lg shadow-black/5 p-6 space-y-5">

            {/* Brand + header */}
            <div className="space-y-4">
              <Link href="/" className="inline-flex items-center gap-2.5 group">
                <div className="size-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/25 group-hover:scale-105 transition-transform">
                  <Sparkles className="size-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight text-foreground">نظام المحل</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">منصة إدارة المحلات</p>
                </div>
              </Link>

              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 mb-2.5">
                  <ShieldCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">دخول آمن ومشفّر</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">أهلاً بعودتك 👋</h1>
                <p className="text-sm text-muted-foreground mt-0.5">سجّل الدخول للوصول إلى لوحة التحكم</p>
              </div>
            </div>

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
            <form onSubmit={handleSubmit} noValidate className="space-y-3">
              <Field label="البريد الإلكتروني" required>
                <Input
                  type="email" placeholder="name@example.com"
                  icon={<Mail className="size-4" />}
                  value={email} onChange={(e: any) => { setEmail(e.target.value); setError(null) }}
                  autoComplete="email" dir="ltr" className="text-left"
                  disabled={loading} required inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                />
              </Field>

              <Field label="كلمة المرور" required>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"} placeholder="••••••••"
                    icon={<Lock className="size-4" />}
                    value={password} onChange={(e: any) => { setPassword(e.target.value); setError(null) }}
                    autoComplete="current-password" dir="ltr" className="text-left pl-10"
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
                        ? "bg-primary border-primary"
                        : "border-border bg-background hover:border-primary/50"
                    )}
                  >
                    {remember && <Check className="size-2.5 text-primary-foreground" strokeWidth={3} />}
                  </div>
                  <Label className="text-xs font-normal cursor-pointer text-muted-foreground">تذكّرني</Label>
                </label>
                <Link href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <Button type="submit" variant="gradient" size="lg"
                className="w-full gap-2 shadow-lg shadow-brand-500/20 h-10 text-sm font-semibold mt-1"
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
            <Link href="/signup" className="block">
              <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/3 px-4 py-3 transition-all group">
                <div>
                  <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">أنشئ محلك مجاناً 🚀</p>
                  <p className="text-[11px] text-muted-foreground">تجربة 14 يوم بدون بطاقة ائتمان</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary rtl:rotate-180 transition-colors" />
              </div>
            </Link>

            <p className="text-center text-[10px] text-muted-foreground/40">© 2026 نظام المحل</p>
          </div>
        </motion.div>
      </div>

      {/* ─── Visual side ─── */}
      <div
        className="relative hidden lg:flex flex-col justify-center overflow-hidden"
        style={{ background: "linear-gradient(145deg, #0d0f1a 0%, #111827 50%, #0a0e1a 100%)" }}
      >
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 size-[420px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)", filter: "blur(80px)" }} aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -right-16 size-[380px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #059669 0%, transparent 70%)", filter: "blur(90px)" }} aria-hidden />
        <div className="pointer-events-none absolute top-1/2 right-1/3 size-[260px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)", filter: "blur(70px)" }} aria-hidden />

        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black, transparent)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black, transparent)",
        }} aria-hidden />

        <div className="relative z-10 flex flex-col gap-7 p-12 text-white max-w-lg mx-auto w-full">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300">
              <Zap className="size-3 fill-indigo-400 text-indigo-400" />
              نظام ERP متكامل للمحلات
            </div>
            <h2 className="text-3xl font-bold leading-snug">
              كل بياناتك في
              <br />
              <span style={{
                background: "linear-gradient(120deg, #818cf8, #60a5fa, #34d399)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>مكان واحد آمن</span>
            </h2>
            <p className="text-sm text-white/60 leading-relaxed">
              مبيعات، مخزون، عملاء، مالية، وتقارير — كل حاجة محفوظة وجاهزة لما تسجّل دخولك.
            </p>
          </motion.div>

          {/* Mini dashboard card */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}>
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2">
                <BarChart3 className="size-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-white/70">آخر المعاملات</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-white/40">مباشر</span>
              </div>
            </div>
            {/* Transactions list */}
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
              {RECENT_TXS.map((tx, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 + i * 0.07 }}
                  className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="size-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: tx.color + "15" }}>
                      <Store className="size-3.5" style={{ color: tx.color }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white/90">{tx.name}</p>
                      <p className="text-[10px] text-white/40">{tx.time}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color: tx.color }}>{tx.amount} ج</span>
                </motion.div>
              ))}
            </div>
            {/* Summary row */}
            <div className="grid grid-cols-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              {[
                { label: "إجمالي اليوم", value: "12,450 ج", color: "#34d399" },
                { label: "عدد الفواتير", value: "38",        color: "#60a5fa" },
                { label: "متوسط الفاتورة", value: "328 ج",   color: "#818cf8" },
              ].map((s, i) => (
                <div key={i} className="text-center py-2.5 px-2"
                  style={{ borderRightWidth: i > 0 ? 1 : 0, borderColor: "rgba(255,255,255,0.08)" }}>
                  <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Feature grid */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.35 }}
            className="grid grid-cols-2 gap-2">
            {FEATURES.map((f, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.07 }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="size-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: f.color + "18" }}>
                  <f.icon className="size-3.5" style={{ color: f.color }} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white/90">{f.label}</p>
                  <p className="text-[10px] text-white/45">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Stats row */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.6 }}
            className="flex items-center rounded-2xl overflow-hidden border"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            {[
              { value: "14 يوم", label: "تجربة مجانية",     icon: "🎁" },
              { value: "بدون بطاقة", label: "ائتمان مطلوبة", icon: "💳" },
              { value: "أوفلاين", label: "يعمل بدون إنترنت", icon: "📶" },
            ].map((s, i) => (
              <div key={i} className="flex-1 text-center py-3"
                style={{ borderRightWidth: i > 0 ? 1 : 0, borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-sm font-bold text-white">{s.icon} {s.value}</p>
                <p className="text-[10px] text-white/40 mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>

        </div>
      </div>
    </main>
  );
}
