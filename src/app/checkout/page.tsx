'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  User, Phone, Mail, CreditCard, ShieldCheck, Lock, ArrowLeft,
  CheckCircle2, CircleAlert, ArrowRight,
  Calendar, Sparkles, Star, Crown, Store,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { getMe } from '@/lib/auth-client'

/**
 * Checkout page 2026 — FIXED pricing.
 *
 * ⚡ FIX: Fetches REAL plan prices from /api/plans/public instead of
 * hardcoded PLAN_META with USD prices. The DB prices are already EGP.
 * No USD_TO_EGP conversion needed.
 */

export default function CheckoutPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const planCode = searchParams.get('plan') || 'electronics-pro'
  const cycle = (searchParams.get('cycle') as 'monthly' | 'yearly') || 'monthly'

  // ⚡ Fetch REAL plan data from API (not hardcoded)
  const [plan, setPlan] = React.useState<{
    id: number
    code: string
    name: string
    description: string | null
    priceMonthly: number
    priceYearly: number
  } | null>(null)
  const [planId, setPlanId] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Plan icon/gradient based on code
  const planMeta = React.useMemo(() => {
    if (!plan) return { icon: <Sparkles className="size-5" />, gradient: 'linear-gradient(135deg, #6b7089, #454a5e)', desc: '' }
    if (plan.code === 'trial') return { icon: <Sparkles className="size-5" />, gradient: 'linear-gradient(135deg, #6b7089, #454a5e)', desc: 'للتجربة والشركات الصغيرة' }
    if (plan.code.endsWith('-basic')) return { icon: <Star className="size-5" />, gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', desc: 'للشركات المتوسطة' }
    if (plan.code.endsWith('-pro')) return { icon: <Crown className="size-5" />, gradient: 'linear-gradient(135deg, #fbbf24, #d97706)', desc: 'للشركات الكبيرة' }
    return { icon: <Store className="size-5" />, gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', desc: '' }
  }, [plan])

  // Fetch plan from API
  React.useEffect(() => {
    let alive = true
    api<{ items: { id: number; code: string; name: string; description: string | null; priceMonthly: number; priceYearly: number }[] }>('/api/plans/public')
      .then((d) => {
        if (!alive) return
        const found = d?.items?.find((p) => p.code === planCode)
        if (found) {
          setPlan(found)
          setPlanId(found.id)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [planCode])

  // ⚡ FIX: Get price directly from API plan (already EGP)
  const price = plan ? (cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly) : 0
  const displayAmount = price.toLocaleString('en-US')
  const displayCurrency = ''
  const displayCycleLabel = cycle === 'monthly' ? 'شهرياً' : 'سنوياً'

  // Customer form state
  const [customer, setCustomer] = React.useState({
    name: '',
    phone: '',
    email: '',
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [authed, setAuthed] = React.useState(false)
  const [checkingAuth, setCheckingAuth] = React.useState(true)

  // Pre-fill from current user
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const me = await getMe()
        if (alive && me) {
          setAuthed(true)
          setCustomer((c) => ({
            name: c.name || me.name,
            email: c.email || me.email,
            phone: c.phone || '',
          }))
        }
      } catch {
        /* not logged in */
      } finally {
        if (alive) setCheckingAuth(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // Validation
  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!customer.name.trim() || customer.name.trim().length < 3) {
      e.name = 'الاسم مطلوب (3 أحرف على الأقل)'
    }
    const phone = customer.phone.replace(/[\s\-+]/g, '')
    if (!/^01[0125]\d{8}$/.test(phone)) {
      e.phone = 'رقم هاتف عربي غير صحيح (مثال: 01012345678)'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      e.email = 'بريد إلكتروني غير صالح'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) {
      toast.error('يرجى تصحيح البيانات قبل المتابعة')
      return
    }
    if (!authed) {
      toast.error('يجب تسجيل الدخول أولاً لإتمام عملية الاشتراك')
      router.push('/login')
      return
    }
    if (!planId) {
      toast.error('فشل تحميل الباقة — حاول مرة أخرى')
      return
    }
    setSubmitting(true)
    try {
      const result = await api<{
        ok: boolean
        checkoutUrl: string
        subscriptionId: number
      }>('/api/paymob/checkout', {
        method: 'POST',
        body: {
          planId,
          period: cycle,
          customer: {
            name: customer.name.trim(),
            phone: customer.phone.trim(),
            email: customer.email.trim(),
          },
          successUrl: '/checkout/callback?status=success',
          cancelUrl: '/checkout/callback?status=failed&reason=user_cancelled',
        },
      })
      if (!result?.checkoutUrl) {
        throw new Error('استجابة غير صالحة من بوابة الدفع')
      }
      window.location.href = result.checkoutUrl
    } catch (err: any) {
      console.error('[Checkout] Paymob session error:', err)
      const msg = err?.message || 'حدث خطأ أثناء إنشاء جلسة الدفع'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  const trustItems = [
    { icon: <ShieldCheck className="size-4" />, label: 'تشفير SSL 256-bit' },
    { icon: <Lock className="size-4" />, label: 'بياناتك محمية بالكامل' },
    { icon: <CreditCard className="size-4" />, label: 'Visa / Mastercard' },
    { icon: <Phone className="size-4" />, label: 'محافظ إلكترونية' },
  ]

  if (loading) {
    return (
      <div className="co-page landing-dark">
        <div className="flex min-h-screen items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="co-page landing-dark">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <p className="text-white">الباقة غير موجودة</p>
          <Link href="/pricing" className="co-back">العودة للأسعار</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="co-page landing-dark">
      <div className="co-bg-glow" aria-hidden="true" />
      <div className="co-bg-grid" aria-hidden="true" />

      <header className="co-topbar">
        <div className="co-topbar-inner">
          <Link href="/" className="co-logo">
            <div className="co-logo-icon"><Store className="size-4" /></div>
            <span>نظام المحل</span>
          </Link>
          <Link href="/pricing" className="co-back">
            <ArrowRight className="size-4" />
            <span>العودة للأسعار</span>
          </Link>
        </div>
      </header>

      <main className="co-container">
        {/* Stepper */}
        <div className="co-stepper">
          <div className="co-step active"><span className="co-step-num">1</span><span>مراجعة الطلب</span></div>
          <div className="co-step-line active" />
          <div className="co-step active"><span className="co-step-num">2</span><span>بيانات العميل</span></div>
          <div className="co-step-line" />
          <div className="co-step"><span className="co-step-num">3</span><span>الدفع الآمن</span></div>
        </div>

        <div className="co-layout">
          {/* ─── LEFT: Order Summary ─── */}
          <aside className="co-summary">
            <div className="co-summary-card">
              <div className="co-summary-header">
                <span className="co-summary-eyebrow">ملخص الطلب</span>
                <h2>مراجعة الباقة</h2>
              </div>

              {/* Plan header */}
              <div className="co-plan-box">
                <div className="co-plan-icon" style={{ background: planMeta.gradient }}>
                  {planMeta.icon}
                </div>
                <div className="co-plan-info">
                  <div className="co-plan-name">{plan.name}</div>
                  <div className="co-plan-desc">{planMeta.desc}</div>
                  <div className="co-plan-cycle">
                    <Calendar className="size-3" />
                    {cycle === 'monthly' ? 'اشتراك شهري' : 'اشتراك سنوي'}
                  </div>
                </div>
              </div>

              {/* Price box */}
              <div className="co-price-box">
                <div className="co-price-label">المبلغ المستحق</div>
                <div className="co-price-main">
                  <span className="co-price-currency">{displayCurrency}</span>
                  <span className="co-price-amount">{displayAmount}</span>
                  <span className="co-price-cycle">/ {displayCycleLabel}</span>
                </div>
              </div>

              {/* Features list */}
              <div className="co-features">
                <div className="co-features-title">
                  <CheckCircle2 className="size-4" />
                  يشمل الباقة:
                </div>
                <ul>
                  {plan.code === 'trial' && [
                    '14 يوم تجربة مجانية',
                    'كل الميزات الأساسية',
                    'بدون بطاقة ائتمان',
                  ].map((f) => <li key={f}><CheckCircle2 className="size-4" /><span>{f}</span></li>)}
                  {plan.code.endsWith('-basic') && [
                    'حتى 500 منتج',
                    'حتى 3 مستخدمين',
                    'كل ميزات نقطة البيع',
                    'إدارة المخزون والعملاء',
                    'المعاملات المالية والالمعاملات المالية',
                    'دعم عبر البريد',
                  ].map((f) => <li key={f}><CheckCircle2 className="size-4" /><span>{f}</span></li>)}
                  {plan.code.endsWith('-pro') && [
                    'حتى 5000 منتج',
                    'حتى 10 مستخدمين',
                    'حتى 5 فروع',
                    'كل ميزات الباقة الأساسية',
                    'تقارير متقدمة + Excel',
                    'بيع بالجملة (وحدات وقسم)',
                    'دعم أولوية على واتساب',
                  ].map((f) => <li key={f}><CheckCircle2 className="size-4" /><span>{f}</span></li>)}
                </ul>
              </div>

              {/* Guarantee */}
              <div className="co-guarantee">
                <ShieldCheck className="size-5" />
                <div>
                  <strong>ضمان استرداد 14 يوم</strong>
                  <span>جرّب الباقة بدون مخاطرة — ترجع للمجاني في أي وقت</span>
                </div>
              </div>
            </div>

            {/* Trust badges */}
            <div className="co-trust">
              {trustItems.map((t) => (
                <div key={t.label} className="co-trust-item">
                  {t.icon}
                  <span>{t.label}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* ─── RIGHT: Customer Form ─── */}
          <section className="co-form-section">
            <div className="co-form-card">
              <div className="co-form-header">
                <span className="co-form-eyebrow">بيانات العميل</span>
                <h1>أكمل بياناتك للمتابعة</h1>
                <p>سيتم تحويلك إلى بوابة Paymob الآمنة لإتمام عملية الدفع بعملتك المحلية العربي.</p>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                {/* Name */}
                <div className="co-field">
                  <label htmlFor="co-name">الاسم بالكامل</label>
                  <div className="co-input-wrap">
                    <Input
                      id="co-name"
                      type="text"
                      autoComplete="name"
                      placeholder="اكتب اسمك أو اسم المحل"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                      className={errors.name ? 'error' : ''}
                      disabled={submitting}
                    />
                    <User className="co-input-icon size-4" />
                  </div>
                  {errors.name && (
                    <span className="co-field-error">
                      <CircleAlert className="size-3.5" />
                      {errors.name}
                    </span>
                  )}
                </div>

                {/* Phone */}
                <div className="co-field">
                  <label htmlFor="co-phone">رقم الهاتف (عربي)</label>
                  <div className="co-input-wrap">
                    <Input
                      id="co-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="01X XXXX XXXX"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      className={errors.phone ? 'error' : ''}
                      disabled={submitting}
                    />
                    <Phone className="co-input-icon size-4" />
                  </div>
                  {errors.phone && (
                    <span className="co-field-error">
                      <CircleAlert className="size-3.5" />
                      {errors.phone}
                    </span>
                  )}
                </div>

                {/* Email */}
                <div className="co-field">
                  <label htmlFor="co-email">البريد الإلكتروني</label>
                  <div className="co-input-wrap">
                    <Input
                      id="co-email"
                      type="email"
                      autoComplete="email"
                      dir="ltr"
                      placeholder="you@example.com"
                      value={customer.email}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                      className={errors.email ? 'error' : ''}
                      disabled={submitting}
                    />
                    <Mail className="co-input-icon size-4" />
                  </div>
                  {errors.email && (
                    <span className="co-field-error">
                      <CircleAlert className="size-3.5" />
                      {errors.email}
                    </span>
                  )}
                </div>

                {/* Paymob badge */}
                <div className="co-paymob-badge">
                  <div className="co-paymob-icon">
                    <Lock className="size-4" />
                  </div>
                  <div className="co-paymob-text">
                    <strong>دفع آمن عبر Paymob</strong>
                    <span>معتمد من البنك المركزي العربي · PCI-DSS Level 1</span>
                  </div>
                </div>

                {/* Auth notice */}
                {!checkingAuth && !authed && (
                  <div className="co-auth-notice">
                    <CircleAlert className="size-4" />
                    <span>
                      يجب تسجيل الدخول أولاً لإتمام الاشتراك.{' '}
                      <Link href="/login">سجّل الدخول أو أنشئ حساب</Link>
                    </span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  className="co-submit"
                  style={{ background: planMeta.gradient }}
                  disabled={submitting || checkingAuth || !authed || !planId}
                >
                  {submitting ? (
                    <>
                      <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      جاري تجهيز جلسة الدفع...
                    </>
                  ) : (
                    <>
                      <CreditCard className="size-5" />
                      ادفع {displayCurrency} {displayAmount} الآن
                    </>
                  )}
                </button>

                <p className="co-disclaimer">
                  بالضغط على «ادفع الآن» فأنت توافق على
                  <Link href="/terms-of-service"> شروط الخدمة </Link>
                  و
                  <Link href="/privacy-policy"> سياسة الخصوصية</Link>.
                </p>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
