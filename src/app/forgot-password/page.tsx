"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, KeyRound, Loader2, Mail, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import AuthShell from "@/components/auth/AuthShell";

const RESEND_COOLDOWN_S = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    setError(null);
    const value = email.trim().toLowerCase();
    if (!value) { setError("اكتب البريد الإلكتروني"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) { setError("صيغة البريد غير صحيحة — مثال: name@example.com"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error ?? "حصلت مشكلة — حاول مرة أخرى"); return; }
      setSentTo(value);
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setError("تعذّر الاتصال — تأكد من الإنترنت وحاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell
        title="شيّك على إيميلك"
        subtitle="لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها رابط تعيين كلمة مرور جديدة."
        icon={<MailCheck className="size-5" />}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#00c98b]/35 bg-[#effcf7] p-3 text-[13px] leading-relaxed text-foreground">
            <p dir="ltr" className="mb-1 truncate text-left text-sm font-bold text-[#00694c]">{sentTo}</p>
            <ul className="list-disc space-y-1 ps-4 text-muted-foreground">
              <li>الرابط صالح لمدة 30 دقيقة ولمرة واحدة بس.</li>
              <li>مجاش؟ بصّ في فولدر الرسائل غير المرغوبة (Spam).</li>
            </ul>
          </div>

          <Button
            type="button" variant="outline" className="h-10 w-full gap-2 text-sm font-bold"
            disabled={cooldown > 0 || loading} onClick={() => submit()}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ث` : "إعادة إرسال الرابط"}
          </Button>
          {error && <p className="text-center text-xs font-semibold text-destructive">{error}</p>}

          <button
            type="button" onClick={() => { setSentTo(null); setError(null); }}
            className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-[#00946a] hover:underline"
          >
            استخدم بريد إلكتروني تاني
          </button>
          <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#00946a] hover:underline">
            <ArrowRight className="size-4" />
            رجوع لتسجيل الدخول
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="نسيت كلمة المرور؟"
      subtitle="اكتب بريدك الإلكتروني وهنبعتلك رابط تعيّن بيه كلمة مرور جديدة."
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

      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="البريد الإلكتروني" className="space-y-1.5 sm:space-y-2.5">
          <Input
            type="email" placeholder="name@example.com"
            icon={<Mail className="size-4" />}
            value={email} onChange={(e: any) => { setEmail(e.target.value); setError(null); }}
            autoComplete="email" dir="ltr" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className="h-10 text-left focus-visible:!border-[#00c98b] focus-visible:!ring-[#00c98b]/25 sm:h-11"
            disabled={loading} required
          />
        </Field>

        <Button
          type="submit" variant="gradient" size="lg" disabled={loading}
          className="h-10 w-full gap-2 !bg-none !bg-[#00c98b] text-sm font-bold !text-[#04261b] shadow-lg shadow-[#00c98b]/30 hover:!bg-[#00b87e]"
        >
          {loading
            ? <><Loader2 className="size-4 animate-spin" />جاري الإرسال...</>
            : <><Send className="size-4" />إرسال رابط الاستعادة</>}
        </Button>
      </form>

      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#00946a] hover:underline">
        <ArrowRight className="size-4" />
        رجوع لتسجيل الدخول
      </Link>
    </AuthShell>
  );
}
