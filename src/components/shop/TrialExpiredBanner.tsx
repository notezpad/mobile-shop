'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Clock,
  Sparkles,
  X,
  CreditCard,
} from 'lucide-react'
import { useShopStore } from '@/lib/store'

/**
 * TrialExpiredBanner — floating subscription card (bottom-center overlay).
 *
 * 🎨 v15 REDESIGN (صفر إزاحة للعناصر):
 *   - قبل كده كان sticky banner جوّه تدفق الصفحة → بيزحّف الهيدر والعناصر
 *     لتحت في كل الصفحات. دلوقتي بيرجّع «كارت» فقط، والتمركز الثابت
 *     (fixed bottom-center) بيتم في (shop)/layout.tsx جوّه حاوية
 *     pointer-events-none — فالكارت بيظهر فوق المحتوى كطبقة عائمة أنيقة
 *     بدون ما ياخد أي ارتفاع من تدفق الصفحة.
 *
 * Behavior (2026-09-13, unchanged):
 *   - When `subscription.expired` is true → prominent red gradient card
 *     with "اشترك الآن" CTA. NOT dismissible (business need) — but it
 *     floats at the bottom so it never blocks the work area.
 *   - When `subscription.expiringSoon` is true (≤7 days left) → softer
 *     amber gradient card with "جدّد الآن" CTA + dismiss button.
 *   - Dismiss is per-render (session state), resets when state changes.
 *
 * Sibling of `OfflineIndicator` in the same floating container.
 */
export function TrialExpiredBanner() {
  const subscription = useShopStore((s) => s.subscription)
  const [dismissed, setDismissed] = React.useState(false)

  // Reset dismissed when subscription state changes from expired→active
  React.useEffect(() => {
    if (!subscription.expired && !subscription.expiringSoon) {
      setDismissed(false)
    }
  }, [subscription.expired, subscription.expiringSoon])

  // Don't render anything if subscription is healthy or banner was dismissed
  if (dismissed) return null
  if (!subscription.expired && !subscription.expiringSoon) return null

  const isExpired = subscription.expired
  const daysLeft = subscription.daysLeft ?? 0

  return (
    <div
      role={isExpired ? 'alert' : 'status'}
      aria-live={isExpired ? 'assertive' : 'polite'}
      className={
        'pointer-events-auto relative w-full max-w-[min(92vw,480px)] overflow-hidden rounded-2xl text-white shadow-2xl ring-1 ring-white/25 backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-300 ' +
        (isExpired
          ? 'bg-gradient-to-l from-red-600 via-rose-600 to-red-700 shadow-red-950/30'
          : 'bg-gradient-to-l from-amber-500 via-orange-500 to-amber-600 shadow-amber-950/30')
      }
    >
      {/* لمعة علوية رفيعة — إحساس جودة بدون مبالغة */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" />

      <div className="flex items-center gap-3 p-3">
        {/* Icon — بنبضة خفيفة في حالة الانتهاء لجذب الانتباه بهدوء */}
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ${
            isExpired ? 'animate-pulse' : ''
          }`}
        >
          {isExpired ? <AlertTriangle className="size-5" /> : <Clock className="size-5" />}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-extrabold sm:text-sm">
            {isExpired ? (
              'انتهت فترة التجربة المجانية'
            ) : subscription.inGrace ? (
              <>
                انتهى اشتراكك — فترة سماح <span className="tabular-nums">{subscription.graceDaysLeft ?? 0}</span> يوم متبقي
              </>
            ) : (
              <>
                باقتك تنتهي خلال <span className="tabular-nums">{daysLeft}</span> يوم
              </>
            )}
          </p>
          <p className="truncate text-[11px] font-medium text-white/85 sm:text-xs">
            {isExpired ? (
              <>
                النظام لا يزال متاحاً — اشترك الآن للمتابعة بدون انقطاع
                {subscription.planName && (
                  <span className="hidden sm:inline"> · باقتك السابقة: {subscription.planName}</span>
                )}
              </>
            ) : subscription.inGrace ? (
              'جدّد الآن قبل انتهاء فترة السماح لتجنب توقف الخدمة'
            ) : (
              'جدّد اشتراكك الآن لتجنب انقطاع الخدمة'
            )}
          </p>
        </div>

        {/* CTA — primary */}
        <Link
          href="/pricing"
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-extrabold shadow-sm transition-all hover:brightness-95 active:scale-95 sm:px-4 sm:text-sm ${
            isExpired
              ? 'text-red-700 shadow-red-950/20'
              : 'text-amber-700 shadow-amber-950/20'
          }`}
        >
          {isExpired ? (
            <>
              <CreditCard className="size-4" />
              <span className="hidden sm:inline">اشترك الآن</span>
              <span className="sm:hidden">اشترك</span>
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              <span className="hidden sm:inline">جدّد الآن</span>
              <span className="sm:hidden">جدّد</span>
            </>
          )}
        </Link>

        {/* Dismiss — only for expiring-soon, not for expired */}
        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            aria-label="إغلاق التنبيه"
            className="flex size-8 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/20 hover:text-white active:scale-90"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
