"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import AuthShell from "@/components/auth/AuthShell";

const MIN_LEN = 6;

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const tokenLooksValid = /^[a-f0-9]{64}$/.test(token);

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPass, setShowPass] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [linkBroken, setLinkBroken] = React.useState(false);
  const [done, setDone] = React.useState(false);

  // بعد النجاح: تحويل تلقائي لصفحة الدخول
  React.useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.push("/login"), 3000);
    return () => clearTimeout(t);
  }, [done, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (password.length < MIN_LEN) { setError(`كلمة المرور لازم تكون ${MIN_LEN} أحرف على الأقل`); return; }
    if (password !== confirm) { setError("كلمتا المرور مش متطابقتين"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setDone(true); return; }
      // 400 + رسالة الرابط = الرابط منتهي/مستخدم → نعرض شاشة الرابط المنتهي
      if (res.status === 400 && typeof data?.error === "string" && data.error.includes("الرابط")) {
        setLinkBroken(true);
        return;
      }
      setError(data?.error ?? "حصلت مشكلة — حاول مرة أخرى");
    } catch {
      setError("تعذّر الاتصال — تأكد من الإنترنت وحاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  if (!tokenLooksValid || linkBroken) {
    return (
      <AuthShell
        title="الرابط مش صالح"
        subtitle="الرابط ده منتهي أو اتستخدم قبل كده. اطلب رابط جديد وهيوصلك في ثواني."
        icon={<TriangleAlert className="size-5" />}
      >
        <div className="space-y-3">
          <Button asChild variant="gradient" size="lg"
            className="h-10 w-full gap-2 !bg-none !bg-[#00c98b] text-sm font-bold !text-[#04261b] shadow-lg shadow-[#00c98b]/30 hover:!bg-[#00b87e]">
            <Link href="/forgot-password"><KeyRound className="size-4" />اطلب رابط جديد</Link>
          </Button>
          <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#00946a] hover:underline">
            <ArrowRight className="size-4" />
            رجوع لتسجيل الدخول
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="تم تغيير كلمة المرور"
        subtitle="تقدر دلوقتي تسجّل الدخول بكلمة المرور الجديدة."
        icon={<CheckCircle2 className="size-5" />}
      >
        <div className="space-y-3">
          <Button asChild variant="gradient" size="lg"
            className="h-10 w-full gap-2 !bg-none !bg-[#00c98b] text-sm font-bold !text-[#04261b] shadow-lg shadow-[#00c98b]/30 hover:!bg-[#00b87e]">
            <Link href="/login"><ShieldCheck className="size-4" />تسجيل الدخول</Link>
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">هتتحوّل لصفحة الدخول تلقائياً خلال ثواني…</p>
        </div>
      </AuthShell>
    );
  }

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <AuthShell
      title="كلمة مرور جديدة"
      subtitle="اختار كلمة مرور قوية ومتستخدمهاش في مكان تاني."
      icon={<KeyRound className="size-5" />}
    >
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden"
          >
            <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-xs font-semibold text-destructive">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={submit} noValidate className="space-y-3 sm:space-y-4">
        <Field label="كلمة المرور الجديدة" hint={`الحد الأدنى ${MIN_LEN} أحرف`} className="space-y-1.5 sm:space-y-2.5">
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"} placeholder="••••••••"
              icon={<Lock className="size-4" />}
              value={password} onChange={(e: any) => { setPassword(e.target.value); setError(null); }}
              autoComplete="new-password" dir="ltr" autoCapitalize="none"
              className="h-10 pl-10 text-left focus-visible:!border-[#00c98b] focus-visible:!ring-[#00c98b]/25 sm:h-11"
              disabled={loading} required minLength={MIN_LEN}
            />
            <button type="button" onClick={() => setShowPass(!showPass)} tabIndex={-1}
              aria-label={showPass ? "إخفاء" : "إظهار"}
              className="absolute inset-y-0 left-3 flex items-center text-muted-foreground transition-colors hover:text-foreground">
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Field label="تأكيد كلمة المرور" error={mismatch ? "كلمتا المرور مش متطابقتين" : undefined} className="space-y-1.5 sm:space-y-2.5">
          <Input
            type={showPass ? "text" : "password"} placeholder="••••••••"
            icon={<Lock className="size-4" />}
            value={confirm} onChange={(e: any) => { setConfirm(e.target.value); setError(null); }}
            autoComplete="new-password" dir="ltr" autoCapitalize="none"
            className="h-10 text-left focus-visible:!border-[#00c98b] focus-visible:!ring-[#00c98b]/25 sm:h-11"
            disabled={loading} required
          />
        </Field>

        <Button
          type="submit" variant="gradient" size="lg" disabled={loading || password.length < MIN_LEN || mismatch}
          className="mt-1 h-10 w-full gap-2 !bg-none !bg-[#00c98b] text-sm font-bold !text-[#04261b] shadow-lg shadow-[#00c98b]/30 hover:!bg-[#00b87e]"
        >
          {loading
            ? <><Loader2 className="size-4 animate-spin" />جاري الحفظ...</>
            : <><ShieldCheck className="size-4" />حفظ كلمة المرور</>}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}
