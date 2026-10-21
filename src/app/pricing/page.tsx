'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Sparkles, Calendar, CalendarDays, ShieldCheck, Star, Crown, Store,
  Check, X, ArrowLeft, ArrowRight, MessageCircle, Mail, Headset,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { getMe } from '@/lib/auth-client'
import { trackEvent } from '@/lib/tracking/client'
import { TRACKING_EVENTS } from '@/lib/tracking/types'

interface Plan {
  id: number
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  maxUsers: number
  maxProducts: number
  maxBranches: number
  trialDays: number
  features: string[]
  businessType: string
  enabledModules: string[]
  capabilities: string[]
}

// Plan card metadata — which icon/badge/color goes with each plan code
const PLAN_META: Record<string, {
  icon: React.ReactNode
  gradient: string
  badge?: { label: string; type: 'popular' | 'premium' | 'current' }
  ctaText: string
}> = {
  'trial': {
    icon: <Sparkles className="size-6" />,
    gradient: 'linear-gradient(135deg, #6b7089, #454a5e)',
    ctaText: 'ابدأ التجربة المجانية',
  },
  'electronics-basic': {
    icon: <Star className="size-6" />,
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    ctaText: 'اشترك الآن',
  },
  'fashion-basic': {
    icon: <Store className="size-6" />,
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    ctaText: 'اشترك الآن',
  },
  'electronics-pro': {
    icon: <Crown className="size-6" />,
    gradient: 'linear-gradient(135deg, #fbbf24, #d97706)',
    badge: { label: 'الأكثر طلباً', type: 'popular' },
    ctaText: 'اشترك الآن',
  },
  'fashion-pro': {
    icon: <Crown className="size-6" />,
    gradient: 'linear-gradient(135deg, #fbbf24, #d97706)',
    badge: { label: 'الأكثر طلباً', type: 'popular' },
    ctaText: 'اشترك الآن',
  },
}

export default function PricingPage() {
  const router = useRouter()
  const [plans, setPlans] = React.useState<Plan[]>([])
  const [loading, setLoading] = React.useState(true)
  const [billing, setBilling] = React.useState<'monthly' | 'yearly'>('monthly')
  // 🆕 Track auth state + current subscription so we can show the right CTA:
  //   - Not logged in → "ابدأ التجربة المجانية" (go to signup)
  //   - Logged in, never used a trial → "ابدأ تجربة 14 يوم" (start-trial API)
  //   - Logged in, active sub OR trial already used → "اشترك الآن" (checkout via Paymob)
  const [authed, setAuthed] = React.useState(false)
  const [authChecked, setAuthChecked] = React.useState(false)
  const [hasActiveSub, setHasActiveSub] = React.useState(false)
  // 🛡️ v15: المستخدم اللي خد تجربة 14 يوم وخلاص (الباقة انتهت) — مينفعش
  // نعرض له «ابدأ تجربة 14 يوم» تاني، لازم «اشترك الآن» وتحويل مباشر للدفع
  const [trialUsed, setTrialUsed] = React.useState(false)
  const [trialStarting, setTrialStarting] = React.useState<string | null>(null)

  // Load public plans + auth state in parallel
  React.useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.allSettled([
      api<{ items: Plan[] }>('/api/plans/public'),
      getMe().catch(() => null),
    ]).then(([plansRes, meRes]) => {
      if (!alive) return
      if (plansRes.status === 'fulfilled') {
        setPlans(plansRes.value?.items ?? [])
      } else {
        toast.error('فشل تحميل الباقات')
      }
      if (meRes.status === 'fulfilled' && meRes.value) {
        setAuthed(true)
        // 🆕 Check current subscription status to decide CTA label
        api<{ expired: boolean; planCode: string | null; period?: string | null }>('/api/subscription')
          .then((d) => {
            if (!alive) return
            setHasActiveSub(!d?.expired && !!d?.planCode && d.planCode !== '-')
            // 🛡️ v15: آخر اشتراك كان تجربة + انتهت = التجربة اتخدمت خلاص
            setTrialUsed(Boolean(d?.expired) && d?.period === 'trial')
          })
          .catch(() => {
            // If we can't fetch subscription, assume no active sub → allow trial
            setHasActiveSub(false)
          })
      }
      setAuthChecked(true)
    }).finally(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [])

  // ── Plan card click handler ──────────────────────────────
  const handleSubscribe = async (plan: Plan) => {
    // 🛡️ Not logged in → go to /signup with the selected plan
    // The signup page will read the plan query param and show a banner
    // with the plan name + pass it to the API for the trial.
    if (!authed) {
      const params = new URLSearchParams({
        plan: plan.code,
        cycle: billing,
      })
      router.push(`/signup?${params.toString()}`)
      return
    }

    // 🆕 Logged in but no active sub AND never used a trial → start a
    // 14-day trial of this plan (no payment required). After trial expires,
    // the banner will prompt them to subscribe via Paymob.
    // 🛡️ v15: لو التجربة اتخدمت قبل كده (trialUsed) نروح للدفع مباشرة —
    // مفيش لفتة «ابدأ تجربة» مرة تانية خالص.
    if (!hasActiveSub && !trialUsed) {
      setTrialStarting(plan.code)
      try {
        const res = await api<{ ok: boolean; planCode: string; planName: string; tracking?: { trialEventId: string } }>(
          '/api/subscription/start-trial',
          { method: 'POST', body: { planCode: plan.code } },
        )
        if (res?.ok) {
          // ═══ 📊 Tracking Browser-side: StartTrial ═══
          // يُطلق فقط لأن السيرفر أكد نجاح بدء التجربة فعلياً
          // (اشتراك trial نشط في قاعدة البيانات) — نفس event_id.
          try {
            trackEvent(TRACKING_EVENTS.StartTrial, {
              eventId: res.tracking?.trialEventId,
              currency: 'EGP',
              planName: res.planName,
              planId: String(plan.id),
              period: 'trial',
            })
          } catch { /* التتبع لا يوقف التجربة */ }
          toast.success(`تم بدء تجربة 14 يوم لباقة «${res.planName}» 🎉`)
          router.push('/dashboard')
          return
        }
        throw new Error('استجابة غير صالحة')
      } catch (e: any) {
        const msg = e?.message || 'فشل بدء التجربة'
        // If trial already used for this plan, fall through to checkout to pay
        if (msg.includes('TRIAL_ALREADY_USED')) {
          toast.info('لقد استخدمت تجربة الـ 14 يوم من قبل — سيتم تحويلك للدفع')
          // fall through to checkout below
        } else if (msg.includes('ACTIVE_SUB_EXISTS')) {
          toast.info('لديك اشتراك نشط — سيتم تحويلك لصفحة الترقية')
          // fall through to checkout below
        } else if (
          e?.status === 402 ||
          msg.includes('منتهي') ||
          msg.includes('انتهت')
        ) {
          // 🛡️ v15: صافي أمان — لو السيرفر رد «اشتراكك منتهي» لأي سبب،
          // منوقفش المستخدم عند إشعار أحمر ميت: نحوّله لصفحة الدفع على طول
          toast.info('انتهت باقتك — سيتم تحويلك لصفحة الاشتراك والدفع')
          // fall through to checkout below
        } else {
          toast.error(msg)
          setTrialStarting(null)
          return
        }
      } finally {
        setTrialStarting(null)
      }
    }

    // 🛡️ Logged in with active sub (upgrade) OR trial-already-used →
    // go to checkout to pay via Paymob
    const params = new URLSearchParams({
      plan: plan.code,
      cycle: billing,
    })
    router.push(`/checkout?${params.toString()}`)
  }

  // ── Plan display helpers ────────────────────────────────
  // ⚡ FIX: DB prices are ALREADY in EGP (299, 599, 349, 699).
  // No USD conversion needed. Display directly.
  const planClass = (plan: Plan) => {
    if (plan.code === 'trial') return 'pg-card pg-card-trial'
    if (plan.code.endsWith('-basic')) return 'pg-card pg-card-basic'
    if (plan.code.endsWith('-pro')) return 'pg-card pg-card-pro'
    return 'pg-card'
  }

  const planIconClass = (plan: Plan) => {
    if (plan.code === 'trial') return 'pg-card-icon trial'
    if (plan.code.endsWith('-basic')) return 'pg-card-icon basic'
    if (plan.code.endsWith('-pro')) return 'pg-card-icon pro'
    return 'pg-card-icon'
  }

  const planCtaClass = (plan: Plan) => {
    if (plan.code === 'trial') return 'pg-card-cta trial'
    if (plan.code.endsWith('-basic')) return 'pg-card-cta basic'
    if (plan.code.endsWith('-pro')) return 'pg-card-cta pro'
    return 'pg-card-cta'
  }

  // ⚡ FIX: Show DB price directly (it's already EGP)
  const planPriceDisplay = (plan: Plan, cycle: 'monthly' | 'yearly') => {
    if (plan.code === 'trial') return '0'
    const price = cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly
    return price.toLocaleString('en-US')
  }

  const planPeriod = (cycle: 'monthly' | 'yearly') => (cycle === 'monthly' ? '/شهر' : '/سنة')

  const planNote = (plan: Plan, cycle: 'monthly' | 'yearly') => {
    if (plan.code === 'trial') {
      return `مجاناً لمدة ${plan.trialDays || 14} يوم — بدون بطاقة ائتمان`
    }
    const monthly = plan.priceMonthly.toLocaleString('en-US')
    const yearly = plan.priceYearly.toLocaleString('en-US')
    const saving = (plan.priceMonthly * 12 - plan.priceYearly).toLocaleString('en-US')
    return cycle === 'monthly'
      ? `${monthly}  شهرياً`
      : `${yearly}  سنوياً · وفّر ${saving} `
  }

  const planFeaturesForCard = (plan: Plan): { ok: boolean; label: string }[] => {
    if (plan.code === 'trial') {
      return [
        { ok: true, label: `حتى ${plan.maxProducts || 50} منتج` },
        { ok: true, label: `حتى ${plan.maxUsers || 1} مستخدم` },
        { ok: true, label: 'كل ميزات نقطة البيع' },
        { ok: true, label: 'كل ميزات المخزون' },
        { ok: false, label: 'تقارير متقدمة' },
        { ok: false, label: 'بيع بالجملة' },
      ]
    }
    if (plan.code.endsWith('-basic')) {
      return [
        { ok: true, label: `حتى ${plan.maxProducts} منتج` },
        { ok: true, label: `حتى ${plan.maxUsers} مستخدم` },
        { ok: true, label: `حتى ${plan.maxBranches} فرع` },
        { ok: true, label: 'كل ميزات نقطة البيع' },
        { ok: true, label: 'إدارة المخزون والعملاء' },
        { ok: true, label: 'المعاملات المالية والالمعاملات المالية' },
        { ok: false, label: 'تقارير متقدمة' },
        { ok: false, label: 'بيع بالجملة' },
      ]
    }
    if (plan.code.endsWith('-pro')) {
      return [
        { ok: true, label: `حتى ${plan.maxProducts} منتج` },
        { ok: true, label: `حتى ${plan.maxUsers} مستخدم` },
        { ok: true, label: `حتى ${plan.maxBranches} فروع` },
        { ok: true, label: 'كل ميزات الباقة الأساسية' },
        { ok: true, label: 'تقارير متقدمة + Excel' },
        { ok: true, label: 'بيع بالجملة (وحدات وقسم)' },
        { ok: true, label: 'كل الميزات مُفعّلة' },
      ]
    }
    return []
  }

  // ── Plan code → meta lookup (with safe fallback) ─────────
  const getPlanMeta = (plan: Plan) => {
    return PLAN_META[plan.code] ?? {
      icon: <Sparkles className="size-6" />,
      gradient: 'linear-gradient(135deg, #6b7089, #454a5e)',
      ctaText: 'اشترك الآن',
    }
  }

  return (
    <div className="co-page landing-dark">
      {/* Background */}
      <div className="co-bg-glow" aria-hidden="true" />
      <div className="co-bg-grid" aria-hidden="true" />

      {/* Top bar */}
      <header className="co-topbar">
        <div className="co-topbar-inner">
          <Link href="/" className="co-logo">
            <div className="co-logo-icon">
              <Store className="size-4" />
            </div>
            <span>نظام المحل</span>
          </Link>
          <Link href="/" className="co-back">
            <ArrowRight className="size-4" />
            <span>العودة للرئيسية</span>
          </Link>
        </div>
      </header>

      <main className="co-container">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="lp-eyebrow justify-center" style={{ display: 'inline-flex', marginBottom: 12 }}>
            الأسعار
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            خطة تناسب كل محل
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            أسعار عادلة لكل المحلات في الدول العربية — بدون عقود طويلة ولا رسوم خفية.
            ادفع بعملتك المحلية العربي عبر Paymob الآمنة.
          </p>
        </div>

        {/* Billing toggle — monthly/yearly only (EGP directly, no currency switcher) */}
        <div className="pg-toggle-wrap">
          <span className="pg-toggle-save-badge">وفّر 17%</span>
          <div className="pg-toggle">
            <span
              className="pg-toggle-slider"
              style={{ transform: billing === 'yearly' ? 'translateX(-100%)' : 'translateX(0)' }}
            />
            <button
              onClick={() => setBilling('monthly')}
              className={`pg-toggle-btn ${billing === 'monthly' ? 'active' : ''}`}
            >
              <Calendar className="size-4" />
              شهري
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`pg-toggle-btn ${billing === 'yearly' ? 'active' : ''}`}
            >
              <CalendarDays className="size-4" />
              سنوي
            </button>
          </div>
        </div>

        {/* Plans grid */}
        {loading ? (
          <div className="pg-plans-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="pg-card animate-pulse" style={{ minHeight: 480 }}>
                <div className="h-8 w-1/3 bg-muted/30 rounded mb-4" />
                <div className="h-12 w-2/3 bg-muted/30 rounded mb-6" />
                <div className="h-4 w-full bg-muted/20 rounded mb-2" />
                <div className="h-4 w-3/4 bg-muted/20 rounded mb-2" />
                <div className="h-4 w-5/6 bg-muted/20 rounded mb-2" />
                <div className="h-4 w-2/3 bg-muted/20 rounded mb-8" />
                <div className="h-10 w-full bg-muted/40 rounded mt-auto" />
              </div>
            ))}
          </div>
        ) : (
          <div className="pg-plans-grid">
            {plans.map((plan, i) => {
              const meta = getPlanMeta(plan)
              const features = planFeaturesForCard(plan)
              const isTrial = plan.code === 'trial'
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className={planClass(plan)}
                >
                  {/* Badge */}
                  {meta.badge && (
                    <span className={`pg-card-badge ${meta.badge.type}`}>
                      {meta.badge.type === 'popular' && <Sparkles className="size-3" />}
                      {meta.badge.label}
                    </span>
                  )}

                  {/* Head */}
                  <div className="pg-card-head">
                    <div className={planIconClass(plan)} style={{ background: meta.gradient }}>
                      {meta.icon}
                    </div>
                    <div>
                      <div className="pg-card-name">{plan.name}</div>
                      <div className="pg-card-desc">{plan.description || ''}</div>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="pg-card-price-wrap">
                    <span className="pg-card-currency"></span>
                    <span className="pg-card-price">{planPriceDisplay(plan, billing)}</span>
                    <span className="pg-card-period">{planPeriod(billing)}</span>
                  </div>
                  <p className="pg-card-note">{planNote(plan, billing)}</p>

                  {/* CTA — dynamically labeled based on auth + subscription state */}
                  <button
                    onClick={() => handleSubscribe(plan)}
                    disabled={trialStarting === plan.code}
                    className={planCtaClass(plan)}
                  >
                    {trialStarting === plan.code ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        جاري بدء التجربة...
                      </>
                    ) : (
                      <>
                        {/* 🛡️ v15: اللي خلصت تجربته أو باقته نشطة → «اشترك الآن»
                            (الدفع) — «ابدأ تجربة 14 يوم» للمؤهل للتجربة فقط */}
                        {authed
                          ? (hasActiveSub || trialUsed ? 'اشترك الآن' : 'ابدأ تجربة 14 يوم')
                          : 'ابدأ التجربة المجانية'}
                        <ArrowLeft className="size-4" />
                      </>
                    )}
                  </button>

                  {/* Trial hint — only for users still eligible for a trial */}
                  {authed && !hasActiveSub && !trialUsed && trialStarting !== plan.code && (
                    <p className="pg-card-trial-hint">
                      <Sparkles className="size-3" />
                      تجربة 14 يوم بمميزات الباقة الكاملة — بدون دفع
                    </p>
                  )}

                  {/* Features */}
                  <p className="pg-card-features-title">
                    {isTrial ? 'المميزات المتاحة:' : 'يشمل الباقة:'}
                  </p>
                  <ul className="pg-card-features">
                    {features.map((f, idx) => (
                      <li key={idx} className={`pg-card-feature ${f.ok ? 'ok' : 'no'}`}>
                        {f.ok ? (
                          <Check className="size-3.5" />
                        ) : (
                          <X className="size-3.5" />
                        )}
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Support card */}
        <div className="pg-support-card">
          <div className="pg-support-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Headset className="size-5" />
          </div>
          <div className="pg-support-text">
            <h4>للاستفسار أو المساعدة</h4>
            <p>
              الدفع أونلاين آمن عبر Paymob — بطاقات Visa / Mastercard أو المحافظ الإلكترونية.
              للاستفسار أو أي مشكلة تواصل معنا مباشرة.
            </p>
          </div>
          <div className="pg-support-btns">
            <a
              href="https://wa.me/201010328471"
              target="_blank"
              rel="noopener noreferrer"
              className="pg-support-btn pg-support-btn--wa"
            >
              <MessageCircle className="size-4" />
              واتساب
            </a>
            <a href="mailto:nezampos@gmail.com" className="pg-support-btn pg-support-btn--email">
              <Mail className="size-4" />
              بريد إلكتروني
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
