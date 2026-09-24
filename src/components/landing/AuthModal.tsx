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
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { apiLogin, apiSignup, type AuthUser } from '@/lib/auth-client'
import { toast } from 'sonner'

export type AuthMode = 'login' | 'signup'

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onAuthed: (u: AuthUser, shopName?: string) => void
}

export function AuthModal({
  open,
  onOpenChange,
  mode,
  onModeChange,
  onAuthed,
}: AuthModalProps) {
  const [shopName, setShopName] = React.useState('')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPass, setShowPass] = React.useState(false)
  const [agree, setAgree] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Reset fields when modal closes (for next open)
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setShopName('')
        setName('')
        setEmail('')
        setPhone('')
        setPassword('')
        setShowPass(false)
        setAgree(false)
        setBusy(false)
      }, 250)
      return () => clearTimeout(t)
    }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') {
        const u = await apiLogin(email.trim(), password)
        toast.success(`أهلاً ${u.name} 👋`)
        onOpenChange(false)
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
        onOpenChange(false)
        onAuthed(u, shopName.trim())
      }
    } catch (err: any) {
      toast.error(err?.message || 'فشل العملية')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogTitle className="sr-only">
          {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {mode === 'login'
            ? 'أهلاً بعودتك، سجّل دخولك للوصول إلى لوحة التحكم'
            : 'ابدأ تجربتك المجانية لمدة 14 يوم بدون بطاقة ائتمان'}
        </DialogDescription>

        {/* 🛡️ 2026-09-13: small text "إغلاق" button at the top-right corner
            (replaces the old X icon — see DialogContent default change).
            Positioned to match where the X used to be. */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-2.5 right-3 z-20 rounded-md bg-white/15 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-white/25"
        >
          إغلاق
        </button>

        {/* Header */}
        <div className="relative flex flex-col items-center gap-2 overflow-hidden bg-gradient-to-br from-primary to-primary/85 px-6 py-7 text-primary-foreground">
          <div className="absolute -right-8 -top-8 size-28 rounded-full bg-white/10" />
          <div className="absolute -left-10 -bottom-10 size-24 rounded-full bg-white/5" />
          <div className="relative flex size-12 items-center justify-center rounded-2xl bg-primary-foreground/15 ring-1 ring-white/20">
            <Store className="size-6" />
          </div>
          <h2 className="relative text-lg font-bold">
            {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          </h2>
          <p className="relative text-xs opacity-90">
            {mode === 'login' ? 'أهلاً بعودتك 👋' : 'ابدأ تجربتك المجانية 14 يوم 🚀'}
          </p>
        </div>

        {/* Mode toggle pills */}
        <div className="flex gap-1 border-b bg-muted/40 p-1.5">
          <button
            type="button"
            onClick={() => onModeChange('login')}
            className={
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
              (mode === 'login'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50')
            }
          >
            <LogIn className="size-4" />
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => onModeChange('signup')}
            className={
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
              (mode === 'signup'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50')
            }
          >
            <UserPlus className="size-4" />
            حساب جديد
          </button>
        </div>

        {/* Form */}
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              onSubmit={submit}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
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
                    placeholder="+966 5X XXX XXXX"
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
                    onClick={() =>
                      toast.info('تواصل مع الدعم لاستعادة كلمة المرور')
                    }
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}

              {mode === 'signup' && (
                <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5">
                  <Checkbox
                    id="agree"
                    checked={agree}
                    onCheckedChange={(v) => setAgree(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="agree" className="cursor-pointer text-xs leading-relaxed">
                    أوافق على{' '}
                    <span className="font-medium text-primary">الشروط والأحكام</span> و
                    <span className="font-medium text-primary">سياسة الخصوصية</span>. يتم
                    تفعيل تجربة 14 يوم مجانية تلقائياً.
                  </Label>
                </div>
              )}

              <Button type="submit" className="w-full gap-1.5" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : mode === 'login' ? (
                  <LogIn className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {mode === 'login'
                  ? 'تسجيل الدخول'
                  : 'إنشاء الحساب وبدء التجربة المجانية'}
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
                className="w-full rounded-md border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {mode === 'login'
                  ? 'ليس لديك حساب؟ إنشاء حساب جديد'
                  : 'لديك حساب؟ تسجيل الدخول'}
              </button>

              {/* 🛡️ 2026-09-17 (v2): Demo accounts section removed —
                  system is going live, no need to expose test credentials. */}
            </motion.form>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
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
          className="pr-9"
        />
      </div>
    </div>
  )
}
