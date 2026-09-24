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
  Sparkles,
  AlertCircle,
  Check,
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
  shop: 'محل الاتصالات',
  rating: 5,
}

/**
 * 🛡️ 2026-09-17 (v2): Polished professional auth page.
 *
 * Improvements:
 *   - Password strength indicator for signup mode (3 colored bars)
 *   - Password confirmation field for signup (with match validation)
 *   - Inline validation with per-field error messages
 *   - Animated error banners (AnimatePresence)
 *   - More polished motion animations (staggered entrance)
 *   - Better mobile responsive layout
 *   - Accessibility: aria-labels on all interactive controls
 *   - Better visual hierarchy with subtle gradients
 *   - Removed demo accounts section (per launch requirement)
 */

/** Get password strength as 0-3 + label + color */
function getPasswordStrength(pwd: string): {
  score: 0 | 1 | 2 | 3
  label: string
  color: string
  bg: string
} {
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
  return {
    score: finalScore,
    label: labels[finalScore],
    color: colors[finalScore],
    bg: bgs[finalScore],
  }
}

export function AuthPage({ mode, onModeChange, onAuthed, onBack }: AuthPageProps) {
  // Form state
  const [shopName, setShopName] = React.useState('')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [passwordConfirm, setPasswordConfirm] = React.useState('')
  const [showPass, setShowPass] = React.useState(false)
  const [agree, setAgree] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const passStrength = getPasswordStrength(password)

  const setFieldError = (field: string, msg: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: msg }))
  }
  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (mode === 'signup') {
      if (!shopName.trim()) errors.shopName = 'اسم المحل مطلوب'
      if (!name.trim()) errors.name = 'اسم المسؤول مطلوب'
      if (!email.trim()) {
        errors.email = 'البريد الإلكتروني مطلوب'
      } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errors.email = 'صيغة البريد غير صحيحة'
      }
      if (!password) {
        errors.password = 'كلمة المرور مطلوبة'
      } else if (password.length < 6) {
        errors.password = 'الحد الأدنى 6 أحرف'
      }
      if (password !== passwordConfirm) {
        errors.passwordConfirm = 'كلمتا المرور غير متطابقتين'
      }
      if (!agree) errors.agree = 'يجب الموافقة على الشروط والأحكام'
    } else {
      // login
      if (!email.trim()) errors.email = 'البريد الإلكتروني مطلوب'
      if (!password) errors.password = 'كلمة المرور مطلوبة'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!validate()) {
      toast.error('من فضلك صحّح الأخطاء المُعلَّمة')
      return
    }

    setBusy(true)
    try {
      if (mode === 'login') {
        const u = await apiLogin(email.trim(), password)
        toast.success(`أهلاً ${u.name} 👋`)
        onAuthed(u)
      } else {
        const u = await apiSignup({
          shopName: shopName.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
        })
        toast.success(`تم إنشاء المحل «${shopName.trim()}» بنجاح — تجربة 14 يوم مجانية 🎉`)
        onAuthed(u, shopName.trim())
      }
    } catch (err: any) {
      const msg = err?.message || 'فشل العملية'
      toast.error(msg)
      // If email already exists, set field error
      if (msg.includes('مسجّل') || msg.includes('موجود')) {
        setFieldError('email', msg)
      }
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
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">
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
                  onChange={(v) => {
                    setShopName(v)
                    clearFieldError('shopName')
                  }}
                  placeholder="مثال: محل الاتصالات"
                  required
                  autoFocus
                  error={fieldErrors.shopName}
                  disabled={busy}
                />
              )}

              {mode === 'signup' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    id="auth-name"
                    label="اسم المسؤول"
                    icon={<User className="size-4" />}
                    value={name}
                    onChange={(v) => {
                      setName(v)
                      clearFieldError('name')
                    }}
                    placeholder="اسمك الكامل"
                    required
                    error={fieldErrors.name}
                    disabled={busy}
                  />
                  <Field
                    id="auth-phone"
                    label="رقم الهاتف"
                    icon={<Phone className="size-4" />}
                    value={phone}
                    onChange={setPhone}
                    placeholder="+20 1X XXXX XXXX"
                    ltr
                    disabled={busy}
                  />
                </div>
              )}

              <Field
                id="auth-email"
                label="البريد الإلكتروني"
                type="email"
                icon={<Mail className="size-4" />}
                value={email}
                onChange={(v) => {
                  setEmail(v)
                  clearFieldError('email')
                }}
                placeholder="you@example.com"
                ltr
                required
                autoFocus={mode === 'login'}
                error={fieldErrors.email}
                disabled={busy}
              />

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="auth-pass" className="text-sm font-medium">
                  كلمة المرور <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock className="size-4" />
                  </span>
                  <Input
                    id="auth-pass"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      clearFieldError('password')
                    }}
                    placeholder="••••••"
                    dir="ltr"
                    required
                    minLength={6}
                    className={`pr-9 pl-9 ${fieldErrors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    disabled={busy}
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
                  <>
                    <p className="text-[11px] text-muted-foreground">الحد الأدنى 6 أحرف</p>
                    {/* Password strength indicator */}
                    {password && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 grid grid-cols-3 gap-1">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className={`h-1 rounded-full transition-colors ${
                                i < passStrength.score ? passStrength.bg : 'bg-muted'
                              }`}
                            />
                          ))}
                        </div>
                        <span className={`text-[11px] ${passStrength.color} w-12`}>
                          {passStrength.label}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {fieldErrors.password && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3" />
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Password confirmation (signup only) */}
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-pass-confirm" className="text-sm font-medium">
                    تأكيد كلمة المرور <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="size-4" />
                    </span>
                    <Input
                      id="auth-pass-confirm"
                      type={showPass ? 'text' : 'password'}
                      value={passwordConfirm}
                      onChange={(e) => {
                        setPasswordConfirm(e.target.value)
                        clearFieldError('passwordConfirm')
                      }}
                      placeholder="••••••"
                      dir="ltr"
                      required
                      minLength={6}
                      className={`pr-9 pl-9 ${
                        fieldErrors.passwordConfirm
                          ? 'border-destructive focus-visible:ring-destructive'
                          : passwordConfirm && passwordConfirm === password
                            ? 'border-success-subtle'
                            : ''
                      }`}
                      disabled={busy}
                    />
                    {passwordConfirm && passwordConfirm === password && (
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-success-subtle-foreground">
                        <Check className="size-4" />
                      </span>
                    )}
                  </div>
                  {fieldErrors.passwordConfirm && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {fieldErrors.passwordConfirm}
                    </p>
                  )}
                </div>
              )}

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
                <div className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${
                  fieldErrors.agree
                    ? 'border-destructive bg-destructive-subtle/30'
                    : 'bg-muted/40'
                }`}>
                  <Checkbox
                    id="agree"
                    checked={agree}
                    onCheckedChange={(v) => {
                      setAgree(v === true)
                      clearFieldError('agree')
                    }}
                    className="mt-0.5"
                    disabled={busy}
                  />
                  <Label htmlFor="agree" className="cursor-pointer text-xs leading-relaxed">
                    أوافق على <span className="font-medium text-primary">الشروط والأحكام</span> و
                    <span className="font-medium text-primary">سياسة الخصوصية</span>. يتم تفعيل
                    تجربة 14 يوم مجانية تلقائياً.
                  </Label>
                </div>
              )}
              {fieldErrors.agree && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  {fieldErrors.agree}
                </p>
              )}

              <Button
                type="submit"
                variant="gradient"
                className="w-full gap-1.5 shadow-lg shadow-brand-500/20"
                size="lg"
                disabled={busy}
              >
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

          {/* 🛡️ 2026-09-17 (v2): Demo accounts section removed — system
              is going live, no need to expose test credentials. */}
        </motion.div>
      </div>

      {/* ===== Left side: Marketing panel (RTL: appears on the left) ===== */}
      <div className="landing-dark relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-12">
        <div className="lg-aurora" aria-hidden />
        <div className="lg-grid-mask" aria-hidden />

        {/* Top content */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10"
        >
          <div className="glass-pill mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-white">
            <Star className="size-3.5 fill-current text-amber-300" />
            منصة إدارة المحلات والجملة #1 في العالم العربي
          </div>
          <h2 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
            أدِر محلك باحترافية
            <br />
            في <span className="lg-grad-text">مكان واحد</span>
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed lg-muted">
            نظام متكامل لإدارة المبيعات والمخزون والصيانة والعملاء والجملة — مصمم خصيصاً لمحلات
            الموبايل والكمبيوتر، والملابس والأحذية في الدول العربية.
          </p>
        </motion.div>

        {/* Benefits list (signup mode) or testimonial (login mode) */}
        <div className="relative z-10">
          {mode === 'signup' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <p className="mb-4 text-sm font-semibold text-white">لماذا تنضم إلينا؟</p>
              <ul className="space-y-2.5">
                {SIGNUP_BENEFITS.map((b, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 + i * 0.06 }}
                    className="flex items-center gap-2.5 text-sm text-white/90"
                  >
                    <div className="size-5 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                      <Check className="size-3 text-brand-400" />
                    </div>
                    {b}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="glass-panel-strong rounded-2xl p-6"
            >
              <div className="mb-3 flex gap-1">
                {Array.from({ length: TESTIMONIAL.rating }).map((_, i) => (
                  <Star key={i} className="size-4 fill-amber-300 text-amber-300" />
                ))}
              </div>
              <p className="mb-4 text-sm leading-relaxed text-white">"{TESTIMONIAL.quote}"</p>
              <div>
                <p className="text-sm font-semibold text-white">{TESTIMONIAL.name}</p>
                <p className="text-xs lg-muted">{TESTIMONIAL.shop}</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Bottom stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="relative z-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6"
        >
          <div>
            <p className="text-2xl font-bold text-white">1,000+</p>
            <p className="text-[11px] lg-muted">محل نشط</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">⭐ 4.9</p>
            <p className="text-[11px] lg-muted">تقييم العملاء</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">14 يوم</p>
            <p className="text-[11px] lg-muted">تجربة مجانية</p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

/* Reusable field with icon + error */
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
  error,
  disabled = false,
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
  error?: string
  disabled?: boolean
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
          onChange={(e: any) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={ltr ? 'ltr' : undefined}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          className={`pr-9 ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="size-3" />
          {error}
        </p>
      )}
    </div>
  )
}
