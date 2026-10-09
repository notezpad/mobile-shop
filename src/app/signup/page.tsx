"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Store,
  User,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  Check,
  Smartphone,
  Shirt,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trackEvent, getAttributionForServer } from "@/lib/tracking/client";
import { TRACKING_EVENTS } from "@/lib/tracking/types";

type PlanMetaEntry = {
  name: string
  shortName: string
  icon: React.ElementType
  cardBg: string
  cardBorder: string
  cardSelected: string
  iconColor: string
  badgeClass: string
  desc: string
  price: string
}

// 🛡️ 2026-10-10 FIX: شكل الباقة القادمة من الداتابيز (عبر /api/plans/public)
interface ApiPlan {
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  businessType?: string
}

// ⚠️ PLAN_META هنا للشكل فقط (أيقونة/ألوان/وصف) — أي باقة تظهر فعلياً
// بيتحدد من الداتابيز عبر /api/plans/public (المفعّلة فقط)، مش من هنا.
const PLAN_META: Record<string, PlanMetaEntry> = {
  'electronics-basic': {
    name: 'أساسية - موبايل وكمبيوتر',
    shortName: 'موبايل أساسية',
    icon: Smartphone,
    cardBg: 'bg-sky-50 dark:bg-sky-950/30',
    cardBorder: 'border-sky-200 dark:border-sky-800',
    cardSelected: 'ring-2 ring-sky-500 border-sky-400 bg-sky-100 dark:bg-sky-900/50',
    iconColor: 'text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    desc: 'POS، مخزون، صيانة، مالية',
    price: '299 EGP',
  },
  'electronics-pro': {
    name: 'احترافية - موبايل وكمبيوتر',
    shortName: 'موبايل احترافية',
    icon: Crown,
    cardBg: 'bg-violet-50 dark:bg-violet-950/30',
    cardBorder: 'border-violet-200 dark:border-violet-800',
    cardSelected: 'ring-2 ring-violet-500 border-violet-400 bg-violet-100 dark:bg-violet-900/50',
    iconColor: 'text-violet-600 dark:text-violet-400',
    badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
    desc: 'كل المزايا + تقارير، فروع، جملة',
    price: '599 EGP',
  },
  'fashion-basic': {
    name: 'أساسية - ملابس وأحذية',
    shortName: 'ملابس أساسية',
    icon: Shirt,
    cardBg: 'bg-rose-50 dark:bg-rose-950/30',
    cardBorder: 'border-rose-200 dark:border-rose-800',
    cardSelected: 'ring-2 ring-rose-500 border-rose-400 bg-rose-100 dark:bg-rose-900/50',
    iconColor: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
    desc: 'POS، مخزون، مقاسات، خزنة',
    price: '349 EGP',
  },
  'fashion-pro': {
    name: 'احترافية - ملابس وأحذية',
    shortName: 'ملابس احترافية',
    icon: Crown,
    cardBg: 'bg-amber-50 dark:bg-amber-950/30',
    cardBorder: 'border-amber-200 dark:border-amber-800',
    cardSelected: 'ring-2 ring-amber-500 border-amber-400 bg-amber-100 dark:bg-amber-900/50',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    desc: 'جملة — كرتونة/دستة + كوليكشن',
    price: '699 EGP',
  },
}

const BENEFITS = [
  'تجربة مجانية 14 يوم بكل المزايا',
  'بدون بطاقة ائتمان مطلوبة',
  'إعداد في أقل من دقيقتين',
  'بياناتك محفوظة وآمنة بالكامل',
  'ألغِ في أي وقت بدون أي التزام',
]

function planPriceLabel(p: { priceMonthly: number; priceYearly: number }): string {
  return p.priceMonthly > 0
    ? `${p.priceMonthly.toLocaleString('en-US')} EGP`
    : `${p.priceYearly.toLocaleString('en-US')} EGP`
}

function getPasswordStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string; bg: string } {
  if (!pwd) return { score: 0, label: '', color: '', bg: '' }
  let score = 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 10) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  const finalScore = Math.min(3, Math.floor(score / 2)) as 0 | 1 | 2 | 3
  const labels = ['ضعيفة', 'متوسطة', 'جيدة', 'قوية']
  const colors = ['text-red-500', 'text-amber-500', 'text-blue-500', 'text-emerald-500']
  const bgs = ['bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500']
  return { score: finalScore, label: labels[finalScore], color: colors[finalScore], bg: bgs[finalScore] }
}

type SignupError = { field: string; message: string }

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedPlan, setSelectedPlan] = React.useState<string>(
    searchParams.get('plan') ?? ''
  )

  // 🛡️ 2026-10-10 FIX: صفحة التسجيل كانت بتعرض 4 باقات ثابتة في الكود
  // (PLAN_META) مش مربوطة بالداتابيز — فالباقة اللي الأدمن يعطّلها من
  // لوحة التحكم كانت بتظهر هنا عادي رغم إنها مخفية من /pricing والرئيسية.
  // الآن: الباقات المعروضة = اللي /api/plans/public بيرجعه فقط (المفعّلة)،
  // و PLAN_META بيفضل مسؤول عن الشكل بس.
  // null = لسه بنحمّل · فشل الشبكة = plansFailed → نرجع للقائمة الثابتة
  const [apiPlans, setApiPlans] = React.useState<ApiPlan[] | null>(null)
  const [plansFailed, setPlansFailed] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    api<{ items: ApiPlan[] }>('/api/plans/public')
      .then((d) => {
        if (!alive) return
        setApiPlans(Array.isArray(d?.items) ? d.items : [])
      })
      .catch(() => {
        // فشل الشبكة فقط → نرجع للقائمة الثابتة عشان التسجيل ميتوقفش،
        // والسيرفر بيتحقق من الباقة تاني عند إنشاء الحساب فعلياً.
        if (!alive) return
        setPlansFailed(true)
      })
    return () => { alive = false }
  }, [])

  // لو الباقة المختارة من الرابط (?plan=...) مش ضمن المفعّلة → نمسح الاختيار
  React.useEffect(() => {
    if (apiPlans === null) return
    if (selectedPlan && !apiPlans.some((p) => p.code === selectedPlan)) {
      setSelectedPlan('')
    }
  }, [apiPlans, selectedPlan])

  const plansLoading = apiPlans === null && !plansFailed

  // بانر الباقة المختارة — بيرجع null لو الباقة مش ضمن المفعّلة
  const planMeta = React.useMemo<PlanMetaEntry | null>(() => {
    const api = apiPlans?.find((p) => p.code === selectedPlan)
    const fb = PLAN_META[selectedPlan]
    // الرابط فيه باقة معطّلة/مش موجودة → مفيش بانر (الـ effect بيمسح الاختيار)
    if (apiPlans !== null && !api) return null
    // لسه بنحمّل أو فشل الشبكة → نعرض الشكل الثابت مؤقتاً
    if (!api) return fb ?? null
    return {
      name: api.name || fb?.name || api.code,
      shortName: fb?.shortName ?? (api.name || api.code),
      icon: fb?.icon ?? Sparkles,
      cardBg: fb?.cardBg ?? 'bg-muted/60 dark:bg-muted/30',
      cardBorder: fb?.cardBorder ?? 'border-border',
      cardSelected: fb?.cardSelected ?? 'ring-2 ring-primary border-primary',
      iconColor: fb?.iconColor ?? 'text-primary',
      badgeClass: fb?.badgeClass ?? 'bg-muted text-foreground',
      desc: fb?.desc ?? api.description ?? '',
      price: planPriceLabel(api),
    }
  }, [apiPlans, selectedPlan])

  // قائمة اختيار الباقات — من الداتابيز (المفعّلة فقط) أو الثابتة عند فشل الشبكة
  const pickerEntries = React.useMemo<{ code: string; meta: PlanMetaEntry }[]>(() => {
    if (apiPlans === null) {
      return Object.entries(PLAN_META).map(([code, m]) => ({ code, meta: m }))
    }
    return apiPlans.map((p) => {
      const fb = PLAN_META[p.code]
      return {
        code: p.code,
        meta: {
          name: p.name || fb?.name || p.code,
          shortName: fb?.shortName ?? (p.name || p.code),
          icon: fb?.icon ?? Sparkles,
          cardBg: fb?.cardBg ?? 'bg-muted/60 dark:bg-muted/30',
          cardBorder: fb?.cardBorder ?? 'border-border',
          cardSelected: fb?.cardSelected ?? 'ring-2 ring-primary border-primary',
          iconColor: fb?.iconColor ?? 'text-primary',
          badgeClass: fb?.badgeClass ?? 'bg-muted text-foreground',
          desc: fb?.desc ?? p.description ?? '',
          price: planPriceLabel(p),
        },
      }
    })
  }, [apiPlans])

  const [shopName, setShopName] = React.useState('')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [inviteCode, setInviteCode] = React.useState('')
  const [showPass, setShowPass] = React.useState(false)
  const [showInvite, setShowInvite] = React.useState(false)
  const [agree, setAgree] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState<SignupError[]>([])

  const passStrength = getPasswordStrength(password)

  const setFieldError = (field: string, message: string) =>
    setErrors((prev) => [...prev.filter((e) => e.field !== field), { field, message }])
  const clearFieldError = (field: string) =>
    setErrors((prev) => prev.filter((e) => e.field !== field))
  const getFieldError = (field: string) => errors.find((e) => e.field === field)?.message

  const validate = (): boolean => {
    const newErrors: SignupError[] = []
    if (!selectedPlan) newErrors.push({ field: 'plan', message: 'اختر باقة أولاً' })
    if (!shopName.trim()) newErrors.push({ field: 'shopName', message: 'اسم المحل مطلوب' })
    if (!name.trim()) newErrors.push({ field: 'name', message: 'اسم المسؤول مطلوب' })
    if (!email.trim()) newErrors.push({ field: 'email', message: 'البريد مطلوب' })
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) newErrors.push({ field: 'email', message: 'صيغة البريد غير صحيحة' })
    if (!password) newErrors.push({ field: 'password', message: 'كلمة المرور مطلوبة' })
    else if (password.length < 6) newErrors.push({ field: 'password', message: 'الحد الأدنى 6 أحرف' })
    if (!agree) newErrors.push({ field: 'agree', message: 'يجب الموافقة على الشروط' })
    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (!validate()) { toast.error('من فضلك صحّح الأخطاء'); return }
    setLoading(true)
    try {
      // 📊 التقاط مصدر الاكتساب (utm_* + click ids) من طبقة التتبع
      const attribution = getAttributionForServer()
      const data = await api<{ ok: boolean; user?: any; error?: string; tracking?: { registrationEventId: string; trialEventId: string; planName?: string } }>('/api/auth/signup', {
        method: 'POST',
        body: { shopName: shopName.trim(), name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password, inviteCode: inviteCode.trim() || undefined, agree, planCode: selectedPlan || undefined, attribution: attribution ?? undefined },
      })
      if (data?.ok && data.user) {
        // ═══ 📊 Tracking Browser-side ═══
        // يُطلق هنا فقط لأن الاستجابة تأتي من السيرفر بعد نجاح إنشاء
        // الحساب فعلياً — وليس عند فتح الصفحة أو الضغط أو وجود خطأ.
        // نفس event_id الذي أرسله السيرفر → Deduplication مثالي.
        try {
          trackEvent(TRACKING_EVENTS.CompleteRegistration, {
            eventId: data.tracking?.registrationEventId,
            contentName: data.tracking?.planName,
            contentType: 'subscription_plan',
          })
          if (data.tracking?.trialEventId) {
            trackEvent(TRACKING_EVENTS.StartTrial, {
              eventId: data.tracking.trialEventId,
              currency: 'EGP',
              planName: data.tracking.planName,
              period: 'trial',
            })
          }
        } catch { /* التتبع لا يوقف التسجيل أبداً */ }
        toast.success(`تم إنشاء محلك «${shopName.trim()}» — تجربة 14 يوم 🎉`)
        router.push('/dashboard')
        router.refresh()
      } else { toast.error(data?.error ?? 'فشل إنشاء الحساب') }
    } catch (err: any) {
      const msg = err?.message ?? 'تعذّر الاتصال'
      toast.error(msg)
      if (msg.includes('مسجّل') || msg.includes('موجود')) setFieldError('email', msg)
    } finally { setLoading(false) }
  }

  return (
    <main className="h-screen grid lg:grid-cols-2 bg-background overflow-hidden">

      {/* ─── Form side ─── */}
      <div className="h-screen overflow-y-auto flex items-start justify-center py-5 px-4 bg-muted/30">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          {/* Card wrapper */}
          <div className="bg-card rounded-2xl border border-border shadow-lg shadow-black/5 p-5 space-y-4">

            {/* Brand + header row */}
            <div className="flex items-center justify-between">
              <Link href="/" className="inline-flex items-center gap-2 group">
                <div className="size-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm shadow-brand-500/25 group-hover:scale-105 transition-transform">
                  <Sparkles className="size-3.5 text-white" />
                </div>
                <span className="text-sm font-bold text-foreground">نظام المحل</span>
              </Link>
              <div className="text-left">
                <h1 className="text-base font-bold tracking-tight text-foreground leading-tight">
                  {planMeta ? 'أنشئ حسابك 🚀' : 'اختر باقتك وابدأ 🚀'}
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  {planMeta ? `${planMeta.shortName} · 14 يوم مجاناً` : 'تجربة 14 يوم — بدون بطاقة ائتمان'}
                </p>
              </div>
            </div>

            {/* Plan banner (if selected) */}
            {planMeta && (
              <div className={cn('flex items-center gap-2.5 rounded-xl border-2 p-2.5', planMeta.cardSelected)}>
                {(() => { const Icon = planMeta.icon; return <Icon className={cn('size-5 shrink-0', planMeta.iconColor)} /> })()}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-foreground">{planMeta.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{planMeta.desc} · <span className="font-semibold">{planMeta.price}</span></p>
                </div>
                <button type="button" onClick={() => setSelectedPlan('')}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline shrink-0 transition-colors">
                  تغيير
                </button>
              </div>
            )}

            {/* Plan picker */}
            {!planMeta && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">اختر الباقة</p>
                  <Link href="/pricing" className="text-[11px] text-primary hover:underline">قارن الباقات ←</Link>
                </div>
                {getFieldError('plan') && (
                  <p className="text-xs text-destructive flex items-center gap-1 bg-destructive/5 border border-destructive/20 rounded-lg px-2.5 py-1.5">
                    <AlertCircle className="size-3 shrink-0" />{getFieldError('plan')}
                  </p>
                )}
                {plansLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 py-6">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">جاري تحميل الباقات...</span>
                  </div>
                ) : pickerEntries.length === 0 ? (
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-center">
                    <p className="text-xs font-bold text-foreground">لا توجد باقات متاحة حالياً</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">يرجى التواصل معنا لمعرفة تفاصيل الاشتراك المتاح.</p>
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-2">
                  {pickerEntries.map(({ code, meta }) => {
                    const Icon = meta.icon
                    const isSelected = selectedPlan === code
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => { setSelectedPlan(code); clearFieldError('plan') }}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-right transition-all duration-200',
                          isSelected
                            ? meta.cardSelected
                            : cn(meta.cardBg, meta.cardBorder, 'hover:shadow-sm')
                        )}
                      >
                        <Icon className={cn('size-4 shrink-0', meta.iconColor)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold leading-tight text-foreground truncate">{meta.shortName}</p>
                          <p className={cn('text-[11px] font-semibold', meta.iconColor)}>{meta.price}</p>
                        </div>
                        {isSelected && <Check className={cn('size-3.5 shrink-0', meta.iconColor)} />}
                      </button>
                    )
                  })}
                </div>
                )}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">

              {/* Row 1: اسم المحل + اسم المسؤول */}
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="اسم المحل" required error={getFieldError('shopName')}>
                  <Input type="text" placeholder="محل الاتصالات" icon={<Store className="size-4" />}
                    value={shopName} onChange={(e: any) => { setShopName(e.target.value); clearFieldError('shopName') }}
                    disabled={loading} autoFocus required />
                </Field>
                <Field label="اسم المسؤول" required error={getFieldError('name')}>
                  <Input type="text" placeholder="الاسم الكامل" icon={<User className="size-4" />}
                    value={name} onChange={(e: any) => { setName(e.target.value); clearFieldError('name') }}
                    disabled={loading} required />
                </Field>
              </div>

              {/* Row 2: البريد + الهاتف */}
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="البريد الإلكتروني" required error={getFieldError('email')}>
                  <Input type="email" placeholder="name@example.com" icon={<Mail className="size-4" />}
                    value={email} onChange={(e: any) => { setEmail(e.target.value); clearFieldError('email') }}
                    dir="ltr" className="text-left" disabled={loading} required />
                </Field>
                <Field label="رقم الهاتف">
                  <Input type="tel" placeholder="+20 1X XXXX" icon={<Phone className="size-4" />}
                    value={phone} onChange={(e: any) => setPhone(e.target.value)}
                    dir="ltr" className="text-left" disabled={loading} />
                </Field>
              </div>

              {/* كلمة المرور */}
              <Field label="كلمة المرور" required error={getFieldError('password')} hint="الحد الأدنى 6 أحرف">
                <div className="relative">
                  <Input type={showPass ? 'text' : 'password'} placeholder="••••••••"
                    icon={<Lock className="size-4" />} value={password}
                    onChange={(e: any) => { setPassword(e.target.value); clearFieldError('password') }}
                    dir="ltr" className="text-left pl-10" disabled={loading} required minLength={6} />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 left-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1} aria-label={showPass ? 'إخفاء' : 'إظهار'}>
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 grid grid-cols-3 gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i < passStrength.score ? passStrength.bg : 'bg-muted'}`} />
                      ))}
                    </div>
                    <span className={`text-[10px] font-medium ${passStrength.color} w-9`}>{passStrength.label}</span>
                  </div>
                )}
              </Field>

              {/* كود الدعوة — collapsible */}
              {!showInvite ? (
                <button type="button" onClick={() => setShowInvite(true)}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline">
                  + عندك كود دعوة؟
                </button>
              ) : (
                <Field label="كود الدعوة (اختياري)">
                  <Input type="text" placeholder="أدخل الكود" value={inviteCode}
                    onChange={(e: any) => setInviteCode(e.target.value)} disabled={loading} autoFocus />
                </Field>
              )}

              {/* Terms */}
              <div className={cn(
                'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                getFieldError('agree') ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/30'
              )}>
                <Checkbox id="agree" checked={agree}
                  onCheckedChange={(v: any) => { setAgree(v === true); clearFieldError('agree') }}
                  className="mt-0.5 shrink-0" disabled={loading} />
                <Label htmlFor="agree" className="cursor-pointer text-[11px] leading-relaxed text-muted-foreground">
                  أوافق على{' '}
                  <Link href="/terms-and-conditions" className="font-semibold text-primary hover:underline">الشروط</Link>
                  {' '}و{' '}
                  <Link href="/privacy-policy" className="font-semibold text-primary hover:underline">الخصوصية</Link>
                  {' '}— تجربة 14 يوم مجانية.
                </Label>
              </div>
              {getFieldError('agree') && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" />{getFieldError('agree')}
                </p>
              )}

              <Button type="submit" variant="gradient" size="lg"
                className="w-full gap-2 shadow-lg shadow-brand-500/20 h-10 text-sm font-semibold"
                disabled={loading}>
                {loading
                  ? <><Loader2 className="size-4 animate-spin" />جاري الإنشاء...</>
                  : <><ShieldCheck className="size-4" />إنشاء الحساب وبدء التجربة<ArrowRight className="size-4 rtl:rotate-180" /></>
                }
              </Button>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground">
                لديك حساب؟{' '}
                <Link href="/login" className="font-semibold text-primary hover:underline">سجل دخولك</Link>
              </p>
              <p className="text-[10px] text-muted-foreground/40">© 2026 نظام المحل</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── Visual side ─── */}
      <div
        className="relative hidden lg:flex flex-col justify-center overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0d0f1a 0%, #111827 50%, #0a0e1a 100%)' }}
      >
        {/* Ambient blobs */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 size-[480px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #4f46e5 0%, transparent 70%)', filter: 'blur(80px)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-20 size-[420px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)', filter: 'blur(90px)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute top-1/2 left-1/3 size-[300px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', filter: 'blur(70px)' }}
          aria-hidden
        />

        {/* Dot grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, black, transparent)',
          }}
          aria-hidden
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col gap-8 p-12 text-white max-w-lg mx-auto w-full">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-3"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300">
              <div className="size-1.5 rounded-full bg-indigo-400 animate-pulse" />
              منصة SaaS · ملابس وأحذية · موبايل وكمبيوتر
            </div>
            <h2 className="text-3xl font-bold leading-snug">
              أدِر محلك بالكامل
              <br />
              <span style={{
                background: 'linear-gradient(120deg, #818cf8, #60a5fa, #34d399)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                من مكان واحد
              </span>
            </h2>
            <p className="text-sm text-white/60 leading-relaxed">
              نظام متكامل للمبيعات، المخزون، العملاء، والتقارير — كل حاجة في لوحة واحدة.
            </p>
          </motion.div>

          {/* Mock dashboard card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8" style={{ borderBottomColor: 'rgba(255,255,255,0.08)' }}>
              <span className="text-xs font-semibold text-white/70">📊 لوحة المبيعات — اليوم</span>
              <span className="text-[10px] text-white/40">مباشر</span>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-3 divide-x divide-x-reverse" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {[
                { label: 'إجمالي المبيعات', value: '12,450', unit: 'ج', color: '#34d399' },
                { label: 'الفواتير', value: '38', unit: '', color: '#60a5fa' },
                { label: 'أصناف نفذت', value: '3', unit: '', color: '#f87171' },
              ].map((s, i) => (
                <div key={i} className="px-3 py-3 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)', borderRightWidth: i > 0 ? 1 : 0 }}>
                  <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}<span className="text-xs mr-0.5">{s.unit}</span></p>
                  <p className="text-[10px] text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {/* Mini chart bars */}
            <div className="px-4 py-3">
              <div className="flex items-end gap-1 h-10">
                {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm opacity-70"
                    style={{
                      height: `${h}%`,
                      background: i === 11
                        ? 'linear-gradient(to top, #34d399, #6ee7b7)'
                        : 'rgba(99,102,241,0.4)',
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-white/30 mt-1.5 text-center">آخر 12 ساعة</p>
            </div>
          </motion.div>

          {/* Benefits */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="grid grid-cols-2 gap-2"
          >
            {BENEFITS.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.35 + i * 0.06 }}
                className="flex items-center gap-2 text-xs text-white/75"
              >
                <div className="size-4 rounded-full shrink-0 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.2)' }}>
                  <Check className="size-2.5 text-indigo-300" />
                </div>
                {b}
              </motion.div>
            ))}
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex items-center gap-0 rounded-2xl border border-white/8 divide-x divide-x-reverse overflow-hidden"
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
          >
            {[
              { value: '14 يوم', label: 'تجربة مجانية', icon: '🎁' },
              { value: 'بدون بطاقة', label: 'ائتمان مطلوبة', icon: '💳' },
              { value: 'أوفلاين', label: 'يعمل بدون إنترنت', icon: '📶' },
            ].map((s, i) => (
              <div
                key={i}
                className="flex-1 text-center py-3.5 px-2"
                style={{ borderColor: 'rgba(255,255,255,0.08)', borderRightWidth: i > 0 ? 1 : 0 }}
              >
                <p className="text-base font-bold text-white">{s.icon} {s.value}</p>
                <p className="text-[10px] text-white/40 mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>

        </div>
      </div>
    </main>
  )
}

export default function SignupPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
          <Loader2 className="size-8 animate-spin text-white/50" />
        </div>
      }
    >
      <SignupContent />
    </React.Suspense>
  )
}
