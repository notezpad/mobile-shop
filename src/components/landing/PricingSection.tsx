'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Check, Sparkles, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AuthMode } from './AuthModal'
import { api } from '@/lib/api'

interface PublicPlan {
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
  sortOrder: number
}

/* Static fallback so the page always looks great even if DB is empty */
const FALLBACK_PLANS: PublicPlan[] = [
  {
    id: 0,
    code: 'trial',
    name: 'الباقة التجريبية',
    description: 'جرّب كل المزايا مجاناً',
    priceMonthly: 0,
    priceYearly: 0,
    maxUsers: 1,
    maxProducts: 50,
    maxBranches: 1,
    trialDays: 14,
    features: ['حتى 50 منتج', 'مستخدم واحد', 'كل المزايا الأساسية', 'دعم عبر البريد'],
    sortOrder: 0,
  },
  {
    id: 0,
    code: 'pro',
    name: 'الباقة الاحترافية',
    description: 'مثالية للمحلات الصغيرة والمتوسطة',
    priceMonthly: 99,
    priceYearly: 1090,
    maxUsers: 5,
    maxProducts: 500,
    maxBranches: 1,
    trialDays: 0,
    features: [
      'حتى 500 منتج',
      '5 مستخدمين',
      'تقارير متقدمة',
      'دعم فني بالبريد',
      'نقطة بيع + صيانة + عملاء',
    ],
    sortOrder: 1,
  },
  {
    id: 0,
    code: 'business',
    name: 'باقة الأعمال',
    description: 'للمحلات متعددة الفروع',
    priceMonthly: 299,
    priceYearly: 3290,
    maxUsers: 20,
    maxProducts: 5000,
    maxBranches: 3,
    trialDays: 0,
    features: [
      'حتى 5000 منتج',
      '20 مستخدم',
      '3 فروع',
      'دعم أولوية',
      'تقارير مخصصة',
    ],
    sortOrder: 2,
  },
  {
    id: 0,
    code: 'enterprise',
    name: 'باقة المؤسسات',
    description: 'للشركات والسلاسل الكبيرة',
    priceMonthly: 999,
    priceYearly: 10990,
    maxUsers: 999,
    maxProducts: 999999,
    maxBranches: 10,
    trialDays: 0,
    features: [
      'منتجات غير محدودة',
      'مستخدمين غير محدودين',
      '10 فروع',
      'دعم مخصص 24/7',
      'API وتكاملات',
    ],
    sortOrder: 3,
  },
]

interface PricingSectionProps {
  onOpenAuth: (mode: AuthMode) => void
}

export function PricingSection({ onOpenAuth }: PricingSectionProps) {
  const [yearly, setYearly] = React.useState(false)
  const [plans, setPlans] = React.useState<PublicPlan[] | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let alive = true
    api<{ items: PublicPlan[] }>('/api/plans/public')
      .then((data) => {
        if (!alive) return
        const items = data?.items
        if (Array.isArray(items) && items.length > 0) {
          // Merge with fallback to ensure all 4 standard codes exist
          const merged: PublicPlan[] = []
          for (const fb of FALLBACK_PLANS) {
            const fromApi = items.find((p) => p.code === fb.code)
            if (fromApi) {
              merged.push({
                ...fromApi,
                features:
                  fromApi.features && fromApi.features.length > 0
                    ? fromApi.features
                    : fb.features,
              })
            } else {
              merged.push(fb)
            }
          }
          setPlans(merged)
        } else {
          setPlans(FALLBACK_PLANS)
        }
      })
      .catch(() => {
        if (alive) setPlans(FALLBACK_PLANS)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const handleContact = () => {
    window.location.href = 'mailto:sales@shop-system.eg?subject=' + encodeURIComponent('استفسار عن باقة المؤسسات')
  }

  return (
    <section id="pricing" className="scroll-mt-24 border-y bg-muted/30 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
          >
            الأسعار
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            باقات تناسب كل المحلات
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-base text-muted-foreground sm:text-lg"
          >
            ابدأ مجاناً، اختر الباقة المناسبة عند نموّك. بدون عقود، ألغِ في أي وقت.
          </motion.p>
        </div>

        {/* Billing toggle */}
        <div className="mb-10 flex items-center justify-center gap-3">
          <span
            className={
              'text-sm font-medium transition-colors ' +
              (!yearly ? 'text-foreground' : 'text-muted-foreground')
            }
          >
            شهري
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            onClick={() => setYearly((v) => !v)}
            className={
              'relative h-7 w-12 rounded-full transition-colors ' +
              (yearly ? 'bg-primary' : 'bg-muted-foreground/30')
            }
          >
            <span
              className={
                'absolute top-1 size-5 rounded-full bg-background shadow transition-all ' +
                (yearly ? 'left-1' : 'right-1')
              }
            />
          </button>
          <div className="flex items-center gap-2">
            <span
              className={
                'text-sm font-medium transition-colors ' +
                (yearly ? 'text-foreground' : 'text-muted-foreground')
              }
            >
              سنوي
            </span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-primary">
              وفّر شهرين
            </span>
          </div>
        </div>

        {/* Plans grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[420px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(plans ?? FALLBACK_PLANS).map((plan, i) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                yearly={yearly}
                onOpenAuth={onOpenAuth}
                onContact={handleContact}
                index={i}
              />
            ))}
          </div>
        )}

        {/* Below grid note */}
        <p className="mt-10 text-center text-xs text-muted-foreground sm:text-sm">
          كل الباقات تشمل: تحديثات مجانية | نسخ احتياطي يومي | أمان عالي | بدون رسوم
          خفية
        </p>
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  yearly,
  onOpenAuth,
  onContact,
  index,
}: {
  plan: PublicPlan
  yearly: boolean
  onOpenAuth: (mode: AuthMode) => void
  onContact: () => void
  index: number
}) {
  const isTrial = plan.code === 'trial'
  const isPro = plan.code === 'pro'
  const isEnterprise = plan.code === 'enterprise'

  const price = yearly ? plan.priceYearly : plan.priceMonthly
  const periodLabel = isTrial
    ? '14 يوم'
    : yearly
      ? 'ج.م/سنة'
      : 'ج.م/شهر'

  const priceDisplay = isTrial
    ? 'مجاناً'
    : price.toLocaleString('ar-EG', { maximumFractionDigits: 0 })

  const handleCTA = () => {
    if (isEnterprise) {
      onContact()
    } else {
      onOpenAuth('signup')
    }
  }

  const ctaLabel = isTrial
    ? 'ابدأ مجاناً'
    : isEnterprise
      ? 'تواصل معنا'
      : 'اشترك الآن'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className={
        'relative flex flex-col rounded-2xl border bg-card p-6 transition-all duration-300 ' +
        (isPro
          ? 'border-primary shadow-xl shadow-primary/15 lg:scale-[1.04] lg:-translate-y-2'
          : 'border-border/70 shadow-sm hover:border-primary/40 hover:shadow-md')
      }
    >
      {/* Ribbon for Pro */}
      {isPro && (
        <div className="absolute -top-3 right-1/2 flex translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-l from-primary to-emerald-600 px-3 py-1 text-[10px] font-bold text-primary-foreground shadow-md">
          <Star className="size-3 fill-current" />
          🔥 الأكثر شعبية
        </div>
      )}

      {/* Plan header */}
      <div className="mb-4">
        <h3
          className={
            'text-lg font-bold ' + (isPro ? 'text-primary' : 'text-foreground')
          }
        >
          {plan.name}
        </h3>
        {plan.description && (
          <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
        )}
      </div>

      {/* Price */}
      <div className="mb-1 flex items-end gap-1">
        <span
          className={
            'text-4xl font-extrabold tracking-tight ' +
            (isTrial ? 'text-primary' : 'text-foreground')
          }
        >
          {priceDisplay}
        </span>
        {!isTrial && (
          <span className="mb-1 text-xs text-muted-foreground">{periodLabel}</span>
        )}
      </div>
      {isTrial && (
        <p className="mb-1 text-xs text-muted-foreground">لمدة {periodLabel}</p>
      )}
      {yearly && !isTrial && (
        <p className="mb-3 text-[10px] text-primary">
          يوفّر{' '}
          {(plan.priceMonthly * 12 - plan.priceYearly).toLocaleString('ar-EG', {
            maximumFractionDigits: 0,
          })}{' '}
          ج.م سنوياً
        </p>
      )}

      {/* CTA */}
      <Button
        onClick={handleCTA}
        variant={isTrial || isEnterprise ? 'outline' : 'default'}
        className={
          'mb-5 mt-3 w-full gap-1.5 ' +
          (isPro ? 'shadow-md shadow-primary/30' : '')
        }
      >
        {!isTrial && !isEnterprise && <Sparkles className="size-4" />}
        {ctaLabel}
      </Button>

      {/* Features */}
      <ul className="mt-auto space-y-2.5">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Check className="size-3" />
            </span>
            <span className="text-foreground/85">{f}</span>
          </li>
        ))}
      </ul>

      {/* Plan limits footer */}
      <div className="mt-5 flex flex-wrap gap-2 border-t pt-4 text-[10px] text-muted-foreground">
        <span className="rounded-md bg-muted/60 px-2 py-0.5">
          {plan.maxUsers === 999 ? '∞' : plan.maxUsers} مستخدم
        </span>
        <span className="rounded-md bg-muted/60 px-2 py-0.5">
          {plan.maxProducts >= 999999 ? '∞' : plan.maxProducts} منتج
        </span>
        <span className="rounded-md bg-muted/60 px-2 py-0.5">
          {plan.maxBranches >= 10 ? '10+' : plan.maxBranches} فرع
        </span>
      </div>
    </motion.div>
  )
}
