'use client'

import * as React from 'react'
import {
  LogIn,
  UserPlus,
  Loader2,
  Store,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Star,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { apiLogin, apiSignup, type AuthUser } from '@/lib/auth-client'
import { toast } from 'sonner'

export type AuthMode = 'login' | 'signup'

interface AuthPageProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onAuthed: (u: AuthUser, shopName?: string) => void
  onBack: () => void
}

const SIGNUP_BENEFITS = [
  'تجربة مجانية 14 يوم بكل المزايا',
  'بدون بطاقة ائتمان مطلوبة',
  'إعداد في أقل من دقيقتين',
  'دعم فني مجاني طوال فترة التجربة',
  'بياناتك محفوظة وآمنة بالكامل',
  'ألغِ في أي وقت بدون أي التزام',
]

const TESTIMONIAL = {
  quote:
    'أخيراً نظام بسيط ومفهوم، ولادي اشتغلوا عليه في يوم واحد. المبيعات زادت 30% لأننا بقينا نعرف بالظبط بتبيع إيه.',
  name: 'أحمد محمد',
  shop: 'محل الاتصالات - القاهرة',
  rating: 5,
}

export function AuthPage({ mode, onModeChange, onAuthed, onBack }: AuthPageProps) {
  const [shopName, setShopName] = React.useState('')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPass, setShowPass] = React.useState(false)
  const [agree, setAgree] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') {
        const u = await apiLogin(email.trim(), password)
        toast.success(`أهلاً ${u.name} 👋`)
        onAuthed(u)
      } else {
        if (!shopName.trim()) {
          toast.error('اسم المحل مطلوب')
          setBusy(false)
          return
        }
        if (!name.trim()) {
          toast.error('اسم المسؤول مطلوب')
          setBusy(false)
          return
        }
        if (!agree) {
          toast.error('يجب الموافقة على الشروط والأحكام')
          setBusy(false)
          return
        }
        const u = await apiSignup({
          shopName: shopName.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
        })
        toast.success(`تم إنشاء المحل «${shopName.trim()}» بنجاح — تجربة 14 يوم مجانية`)
        onAuthed(u, shopName.trim())
      }
    } catch (err: any) {
      toast.error(err?.message || 'فشل العملية')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5 lg:flex-row">
      {/* Back button - top */}
      <button
        type="button"
        onClick={onBack}
        className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur hover:text-foreground lg:right-6 lg:top-6"
      >
        <ArrowRight className="size-3.5" />
        العودة للرئيسية
      </button>

      {/* ===== Right side: Form (RTL: appears on the right) ===== */}
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:w-1/2 lg:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="mb-6 flex items-center justify-center gap-2 lg:mb-8 lg:justify-start">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Store className="size-5" />
            </div>
            <span className="text-xl font-bold">نظام المحل</span>
          </div>

          {/* Mode toggle (segmented) */}
          <div className="mb-6 flex gap-1 rounded-xl border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => onModeChange('login')}
              className={
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ' +
                (mode === 'login'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <LogIn className="size-4" />
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => onModeChange('signup')}
              className={
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ' +
                (mode === 'signup'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <UserPlus className="size-4" />
              حساب جديد
            </button>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold sm:text-3xl">
              {mode === 'login' ? 'مرحباً بعودتك 👋' : 'أنشئ حسابك المجاني 🚀'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'login'
                ? 'سجل دخولك للوصول إلى لوحة تحكم محلك'
                : 'تجربة 14 يوم مجانية — بدون بطاقة ائتمان'}
            </p>
          </div>

          {/* Form */}
          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              onSubmit={submit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {mode === 'signup' && (
                <Field
                  id="shop-name"
                  label="اسم المحل"
                  icon={<Store className="size-4" />}
                  value={shopName}
                  onChange={setShopName}
                  placeholder="مثال: محل الاتصالات"
                  required
                  autoFocus
                />
              )}

              {mode === 'signup' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    id="auth-name"
                    label="اسم المسؤول"
                    icon={<User className="size-4" />}
                    value={name}
                    onChange={setName}
                    placeholder="اسمك الكامل"
                    required
                  />
                  <Field
                    id="auth-phone"
                    label="رقم الهاتف"
                    icon={<Phone className="size-4" />}
                    value={phone}
                    onChange={setPhone}
                    placeholder="01000000000"
                    ltr
                  />
                </div>
              )}

              <Field
                id="auth-email"
                label="البريد الإلكتروني"
                type="email"
                icon={<Mail className="size-4" />}
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                ltr
                required
                autoFocus={mode === 'login'}
              />

              <div className="space-y-1.5">
                <Label htmlFor="auth-pass" className="text-sm font-medium">
                  كلمة المرور
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock className="size-4" />
                  </span>
                  <Input
                    id="auth-pass"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    dir="ltr"
                    required
                    minLength={6}
                    className="pr-9 pl-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={showPass ? 'إخفاء' : 'إظهار'}
                  >
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="text-[11px] text-muted-foreground">الحد الأدنى 6 أحرف</p>
                )}
              </div>

              {mode === 'login' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => toast.info('تواصل مع الدعم لاستعادة كلمة المرور')}
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}

              {mode === 'signup' && (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
                  <Checkbox
                    id="agree"
                    checked={agree}
                    onCheckedChange={(v) => setAgree(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="agree" className="cursor-pointer text-xs leading-relaxed">
                    أوافق على{' '}
                    <span className="font-medium text-primary">الشروط والأحكام</span> و
                    <span className="font-medium text-primary">سياسة الخصوصية</span>. يتم تفعيل
                    تجربة 14 يوم مجانية تلقائياً.
                  </Label>
                </div>
              )}

              <Button type="submit" className="w-full gap-1.5" size="lg" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : mode === 'login' ? (
                  <LogIn className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب وبدء التجربة المجانية'}
              </Button>

              <div className="relative py-1 text-center">
                <div className="absolute inset-x-0 top-1/2 border-t" />
                <span className="relative bg-background px-3 text-[11px] text-muted-foreground">
                  أو
                </span>
              </div>

              <button
                type="button"
                onClick={() => onModeChange(mode === 'login' ? 'signup' : 'login')}
                className="w-full rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {mode === 'login' ? 'ليس لديك حساب؟ إنشاء حساب جديد' : 'لديك حساب؟ تسجيل الدخول'}
              </button>
            </motion.form>
          </AnimatePresence>

          {/* Demo accounts (login mode only) */}
          {mode === 'login' && (
            <div className="mt-6 rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 text-center text-[11px] font-semibold text-muted-foreground">
                🔑 حسابات تجريبية للاختبار:
              </p>
              <div className="space-y-1 text-[11px] text-muted-foreground" dir="ltr">
                <p className="flex items-center justify-between gap-2">
                  <code className="rounded bg-background px-2 py-0.5">
                    super@admin.com / super123
                  </code>
                  <span className="text-[10px]">أدمن أعلى</span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <code className="rounded bg-background px-2 py-0.5">
                    admin@demo.com / admin123
                  </code>
                  <span className="text-[10px]">مدير محل</span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <code className="rounded bg-background px-2 py-0.5">
                    emp@demo.com / emp123
                  </code>
                  <span className="text-[10px]">موظف</span>
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ===== Left side: Marketing panel (RTL: appears on the left) ===== */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary to-primary/80 lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-12">
        {/* Decorative shapes */}
        <div className="absolute -right-20 -top-20 size-80 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-20 -bottom-20 size-80 rounded-full bg-white/5 blur-2xl" />
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Top content */}
        <div className="relative z-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-primary-foreground backdrop-blur">
            <Star className="size-3.5 fill-current" />
            منصة إدارة المحلات #1 في مصر
          </div>
          <h2 className="text-3xl font-bold leading-tight text-primary-foreground xl:text-4xl">
            أدر محلك باحترافية
            <br />
            في مكان واحد
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/80">
            نظام متكامل لإدارة المبيعات والمخزون والصيانة والعملاء — مصمم خصيصاً لمحلات الموبايل
            والإكسسوارات في السوق المصري.
          </p>
        </div>

        {/* Benefits list (signup mode) or testimonial (login mode) */}
        <div className="relative z-10">
          {mode === 'signup' ? (
            <div>
              <p className="mb-4 text-sm font-semibold text-primary-foreground">
                لماذا تنضم إلينا؟
              </p>
              <ul className="space-y-2.5">
                {SIGNUP_BENEFITS.map((b, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                    className="flex items-center gap-2.5 text-sm text-primary-foreground/90"
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-primary-foreground" />
                    {b}
                  </motion.li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl bg-white/10 p-6 backdrop-blur-md ring-1 ring-white/20">
              <div className="mb-3 flex gap-1">
                {Array.from({ length: TESTIMONIAL.rating }).map((_, i) => (
                  <Star key={i} className="size-4 fill-amber-300 text-amber-300" />
                ))}
              </div>
              <p className="mb-4 text-sm leading-relaxed text-primary-foreground">
                "{TESTIMONIAL.quote}"
              </p>
              <div>
                <p className="text-sm font-semibold text-primary-foreground">
                  {TESTIMONIAL.name}
                </p>
                <p className="text-xs text-primary-foreground/70">{TESTIMONIAL.shop}</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom stats */}
        <div className="relative z-10 grid grid-cols-3 gap-4 border-t border-white/20 pt-6">
          <div>
            <p className="text-2xl font-bold text-primary-foreground">+50</p>
            <p className="text-[11px] text-primary-foreground/70">محل نشط</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary-foreground">+1,000</p>
            <p className="text-[11px] text-primary-foreground/70">مستخدم</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary-foreground">4.9★</p>
            <p className="text-[11px] text-primary-foreground/70">تقييم العملاء</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* Reusable field with icon */
function Field({
  id,
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  ltr = false,
  required = false,
  autoFocus = false,
}: {
  id: string
  label: string
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  ltr?: boolean
  required?: boolean
  autoFocus?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={ltr ? 'ltr' : undefined}
          required={required}
          autoFocus={autoFocus}
          className="pr-9"
        />
      </div>
    </div>
  )
}
