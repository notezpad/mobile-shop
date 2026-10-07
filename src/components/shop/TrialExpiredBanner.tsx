'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertTriangle, Clock, Sparkles, X, CreditCard, ChevronLeft } from 'lucide-react'
import { useShopStore } from '@/lib/store'
import { cn } from '@/lib/utils'

/**
 * TrialExpiredBanner — بطاقة تنبيه الاشتراك.
 *
 * 🎨 2026-10-07: إعادة تصميم كاملة.
 *   - قبل كده كان شريط أحمر/كهرماني مصمت فوق الشِل كله (فوق السايدبار والهيدر)،
 *     وبينزّل التطبيق كله لتحت فيتحرّك التولبار والسايدبار بشكل غريب.
 *   - دلوقتي بطاقة هادية (خلفية شفافة ملوّنة + شريط جانبي) داخل منطقة المحتوى
 *     نفسها، فوق محتوى الصفحة مباشرة: الهيدر والسايدبار ثابتين مكانهم ومفيش
 *     أي إزاحة للشِل. بتتحرّك مع سكرول المحتوى بدل ما تاخد مساحة دايمة.
 *   - المستخدم مش مقفول برا النظام: التنبيه تذكير بس.
 *   - التنبيه الكهرماني (قرب الانتهاء) بيتقفل؛ الأحمر (منتهي) لأ.
 */
export function TrialExpiredBanner() {
  const subscription = useShopStore((s) => s.subscription)
  const [dismissed, setDismissed] = React.useState(false)

  // لو الاشتراك رجع سليم نصفّر حالة الإغلاق
  React.useEffect(() => {
    if (!subscription.expired && !subscription.expiringSoon) {
      setDismissed(false)
    }
  }, [subscription.expired, subscription.expiringSoon])

  if (dismissed) return null
  if (!subscription.expired && !subscription.expiringSoon) return null

  const isExpired = subscription.expired
  const daysLeft = subscription.daysLeft ?? 0

  // 🛡️ v15: «اشترك الآن» بيودّي مباشرة لصفحة الدفع لباقة المستخدم نفسها
  // (لو الباقة مجهولة نرجّعه لصفحة الأسعار).
  const subCode = subscription.planCode
  const checkoutHref =
    !subCode || subCode === '-' || subCode === 'platform'
      ? '/pricing'
      : `/checkout?plan=${encodeURIComponent(subCode)}&cycle=${
          subscription.period === 'yearly' ? 'yearly' : 'monthly'
        }`

  const tone = isExpired
    ? {
        box: 'border-rose-500/25 bg-rose-500/[0.06]',
        stripe: 'bg-rose-500',
        glow: 'bg-rose-500/15',
        icon: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
        btn: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25',
      }
    : {
        box: 'border-amber-500/30 bg-amber-500/[0.07]',
        stripe: 'bg-amber-500',
        glow: 'bg-amber-500/15',
        icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        chip: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
        btn: 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25',
      }

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('relative mb-4 overflow-hidden rounded-2xl border sm:mb-5', tone.box)}
    >
      {/* شريط جانبي + وهج ناعم (زخرفة فقط) */}
      <span aria-hidden className={cn('absolute inset-y-0 start-0 w-1', tone.stripe)} />
      <span aria-hidden className={cn('pointer-events-none absolute -top-10 -end-10 size-32 rounded-full blur-2xl', tone.glow)} />

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3 py-3 pe-3 ps-4 sm:flex-nowrap sm:py-3.5 sm:pe-4 sm:ps-5">
        {/* الأيقونة */}
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone.icon)}>
          {isExpired ? <AlertTriangle className="size-5" /> : <Clock className="size-5" />}
        </span>

        {/* النص */}
        <div className="min-w-0 flex-1 basis-[13rem]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-extrabold leading-snug text-foreground">
            {isExpired ? 'انتهت فترة التجربة المجانية' : `باقتك تنتهي خلال ${daysLeft} يوم`}
            {isExpired && subscription.planName && (
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', tone.chip)}>
                {subscription.planName}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {isExpired
              ? 'النظام لسه شغال معاك — اشترك دلوقتي عشان تكمل من غير انقطاع.'
              : 'جدّد اشتراكك دلوقتي عشان تتجنب انقطاع الخدمة.'}
          </p>
        </div>

        {/* الإجراءات */}
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          <Link
            href={isExpired ? checkoutHref : '/pricing'}
            className={cn(
              'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white shadow-md transition-all active:scale-[0.97] sm:flex-none',
              tone.btn,
            )}
          >
            {isExpired ? <CreditCard className="size-4" /> : <Sparkles className="size-4" />}
            {isExpired ? 'اشترك الآن' : 'جدّد الآن'}
            <ChevronLeft className="size-4 opacity-70" />
          </Link>

          {/* الإغلاق — للتنبيه المبكر فقط */}
          {!isExpired && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="إغلاق التنبيه"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
