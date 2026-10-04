'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Clock,
  Sparkles,
  X,
  CreditCard,
} from 'lucide-react'
import { useShopStore } from '@/lib/store'

/**
 * TrialExpiredBanner — sticky top banner shown when the tenant's
 * subscription has expired.
 *
 * Behavior (2026-09-13):
 *   - When `subscription.expired` is true, we render a prominent red banner
 *     at the very top of every shop page encouraging the user to subscribe.
 *   - The user is NOT locked out — they can still navigate, view data, and
 *     use the system. The banner just reminds them to subscribe.
 *   - When `subscription.expiringSoon` is true (≤7 days left), we render a
 *     softer amber banner as a heads-up.
 *   - The banner is dismissible per-session via localStorage, but reappears
 *     on the next session.
 *
 * Sibling of `OfflineIndicator` in (shop)/layout.tsx.
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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={
          'sticky top-0 z-40 w-full border-b backdrop-blur-sm ' +
          (isExpired
            ? 'bg-gradient-to-l from-red-600/95 via-red-700/95 to-red-800/95 border-red-900/50'
            : 'bg-gradient-to-l from-amber-500/95 via-amber-600/95 to-amber-700/95 border-amber-900/50')
        }
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-6">
          {/* Icon */}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
            {isExpired ? (
              <AlertTriangle className="size-5 text-white" />
            ) : (
              <Clock className="size-5 text-white" />
            )}
          </div>

          {/* Text — collapses on mobile */}
          <div className="min-w-0 flex-1">
            {isExpired ? (
              <>
                <p className="text-sm font-bold text-white leading-tight sm:text-base">
                  انتهت فترة التجربة المجانية
                </p>
                <p className="text-[11px] text-white/85 leading-tight sm:text-xs">
                  النظام لا يزال متاحاً — اشترك الآن للمتابعة بدون انقطاع
                  {subscription.planName && (
                    <span className="hidden sm:inline"> · باقتك السابقة: {subscription.planName}</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-white leading-tight sm:text-base">
                  باقتك تنتهي خلال {daysLeft} يوم
                </p>
                <p className="text-[11px] text-white/85 leading-tight sm:text-xs">
                  جدّد اشتراكك الآن لتجنب انقطاع الخدمة
                </p>
              </>
            )}
          </div>

          {/* CTA — primary */}
          <Link
            href="/pricing"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-bold text-red-700 shadow-sm transition-colors hover:bg-red-50 sm:px-4"
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
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
