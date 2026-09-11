'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Sparkles, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AuthMode } from './AuthModal'
import { api } from '@/lib/api'
import { useVertical, VERTICAL_META, FALLBACK_PLANS, type LandingPlan, type Vertical } from './vertical-context'

interface ApiPlan {
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
  businessType?: string
}

interface PricingSectionProps {
  onOpenAuth: (mode: AuthMode) => void
}

export function PricingSection({ onOpenAuth }: PricingSectionProps) {
  const { vertical } = useVertical()
  const meta = VERTICAL_META[vertical]
  const [yearly, setYearly] = React.useState(false)
  const [plans, setPlans] = React.useState<LandingPlan[]>(FALLBACK_PLANS)

  React.useEffect(() => {
    let alive = true
    api<{ items: ApiPlan[] }>('/api/plans/public')
      .then((data) => {
        if (!alive) return
        const items = data?.items
        if (!Array.isArray(items) || items.length === 0) return
        // Merge live DB data over the fallback, matched by `code`, so the
        // page always shows the correct 4 plans even if the DB is missing one.
        const merged = FALLBACK_PLANS.map((fb) => {
          const fromApi = items.find((p) => p.code === fb.code)
          if (!fromApi) return fb
          return {
            ...fb,
            name: fromApi.name || fb.name,
            description: fromApi.description || fb.description,
            priceMonthly: fromApi.priceMonthly ?? fb.priceMonthly,
            priceYearly: fromApi.priceYearly ?? fb.priceYearly,
            maxUsers: fromApi.maxUsers ?? fb.maxUsers,
            maxProducts: fromApi.maxProducts ?? fb.maxProducts,
            maxBranches: fromApi.maxBranches ?? fb.maxBranches,
            features: fromApi.features?.length ? fromApi.features : fb.features,
            businessType: (fromApi.businessType as Vertical) || fb.businessType,
          }
        })
        setPlans(merged)
      })
      .catch(() => {
        /* keep fallback plans — page always looks complete */
      })
    return () => {
      alive = false
    }
  }, [])

  const visiblePlans = plans.filter((p) => p.businessType === vertical)

  return (
    <section id="pricing" className="landing-dark relative scroll-mt-24 border-y border-white/5 py-20 sm:py-24">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="lg-eyebrow justify-center"
          >
            الأسعار · {meta.label}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.9rem)', lineHeight: 1.2 }}
          >
            باقتان تناسبان كل حجم محل
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-lg leading-[1.7] lg-muted"
          >
            ابدأ مجاناً 14 يوم، اختر الباقة المناسبة عند نموّك. بدون عقود، ألغِ في أي وقت.
          </motion.p>
        </div>

        {/* Billing toggle */}
        <div className="mb-10 flex items-center justify-center gap-3">
          <span className={'text-sm font-medium transition-colors ' + (!yearly ? 'text-white' : 'lg-muted')}>
            شهري
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            onClick={() => setYearly((v) => !v)}
            className={
              'relative h-7 w-12 rounded-full transition-colors ' +
              (yearly ? 'bg-gradient-to-l from-brand-500 to-brand-700' : 'bg-white/15')
            }
          >
            <span
              className={
                'absolute top-1 size-5 rounded-full bg-white shadow transition-all ' +
                (yearly ? 'left-1' : 'right-1')
              }
            />
          </button>
          <div className="flex items-center gap-2">
            <span className={'text-sm font-medium transition-colors ' + (yearly ? 'text-white' : 'lg-muted')}>
              سنوي
            </span>
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-300">
              وفّر شهرين
            </span>
          </div>
        </div>

        {/* Plans grid — always 2 plans per vertical (basic / pro) */}
        <AnimatePresence mode="wait">
          <motion.div
            key={vertical}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2"
          >
            {visiblePlans.length === 0
              ? [0, 1].map((i) => <Skeleton key={i} className="h-[420px] rounded-2xl" />)
              : visiblePlans.map((plan, i) => (
                  <PlanCard
                    key={plan.code}
                    plan={plan}
                    yearly={yearly}
                    onOpenAuth={onOpenAuth}
                    index={i}
                  />
                ))}
          </motion.div>
        </AnimatePresence>

        {/* Below grid note */}
        <p className="mt-10 text-center text-xs lg-muted sm:text-sm">
          كل الباقات تشمل: تحديثات مجانية · نسخ احتياطي يومي · أمان عالي · بدون رسوم خفية
        </p>
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  yearly,
  onOpenAuth,
  index,
}: {
  plan: LandingPlan
  yearly: boolean
  onOpenAuth: (mode: AuthMode) => void
  index: number
}) {
  const price = yearly ? plan.priceYearly : plan.priceMonthly
  const periodLabel = yearly ? 'ج.م/سنة' : 'ج.م/شهر'
  const priceDisplay = price.toLocaleString('ar-EG', { maximumFractionDigits: 0 })
  const savings = plan.priceMonthly * 12 - plan.priceYearly

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className={
        'relative flex flex-col rounded-2xl p-7 transition-all duration-300 ' +
        (plan.isPro
          ? 'glass-panel-strong shadow-xl shadow-brand-600/10 sm:scale-[1.03]'
          : 'glass-card')
      }
    >
      {plan.isPro && (
        <div className="absolute -top-3 right-1/2 flex translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-l from-brand-500 to-brand-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-md">
          <Star className="size-3.5 fill-current" />
          🔥 الأكثر طلباً
        </div>
      )}

      <div className="mb-4">
        <h3 className={'text-xl font-extrabold ' + (plan.isPro ? 'text-brand-300' : 'text-white')}>
          باقة {plan.name}
        </h3>
        <p className="mt-1.5 text-sm lg-muted">{plan.description}</p>
      </div>

      <div className="mb-1 flex items-end gap-1">
        <span className="text-5xl font-black tracking-tight text-white">{priceDisplay}</span>
        <span className="mb-1.5 text-sm lg-muted">{periodLabel}</span>
      </div>
      {yearly && savings > 0 && (
        <p className="mb-3 text-xs font-semibold text-brand-300">
          يوفّر {savings.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج.م سنوياً
        </p>
      )}

      <Button
        onClick={() => onOpenAuth('signup')}
        className={
          'mb-5 mt-3 h-12 w-full gap-1.5 rounded-xl text-base font-bold text-white ' +
          (plan.isPro
            ? 'bg-gradient-to-l from-brand-500 to-brand-700 shadow-md shadow-brand-600/30 hover:from-brand-400 hover:to-brand-600'
            : 'border border-white/15 bg-white/5 hover:bg-white/10')
        }
      >
        <Sparkles className="size-4" />
        ابدأ تجربتك المجانية
      </Button>

      <ul className="mt-auto space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
              <Check className="size-3.5" />
            </span>
            <span className="text-white/85">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4 text-xs lg-muted">
        <span className="rounded-md bg-white/5 px-2.5 py-1">{plan.maxUsers} مستخدم</span>
        <span className="rounded-md bg-white/5 px-2.5 py-1">{plan.maxProducts.toLocaleString('ar-EG')} منتج</span>
        <span className="rounded-md bg-white/5 px-2.5 py-1">{plan.maxBranches} فرع</span>
      </div>
    </motion.div>
  )
}
