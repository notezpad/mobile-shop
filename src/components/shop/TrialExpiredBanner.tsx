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
 * Behavior:
 *   - When `subscription.expired` is true → prominent red gradient card
 *     with "اشترك الآن" CTA. NOT dismissible (business need) — but it
 *     floats at the bottom so it never blocks the work area.
 *   - When `subscription.expiringSoon` is true (≤7 days left) → softer
 *     amber gradient card with "جدّد الآن" CTA + dismiss button.
 *
 * 🧠 Persistent dismissal (2026-10-22 — fix: البانر كان بيرجع يظهر مع كل
 *   refresh لأن القفل كان React state في الميموري بس):
 *   - القفل بيتحفظ في localStorage بمفتاح لكل محل (`tenantId`) ومعاه
 *     «توقيع حالة التنبيه»: تاريخ انتهاء الاشتراك + المتبقي (أيام العرض
 *     أو أيام السماح).
 *   - نفس الحالة (نفس اليوم مثلًا): مقفول نهائيًا حتى بعد refresh أو فتح
 *     تاب جديد — دي الشكوى اللي ااتصلحت.
 *   - لما الحالة تتغير فعليًا (المتبقي نزل يوم، دخول فترة السماح، انتهاء،
 *     أو تجديد غيّر تاريخ الانتهاء) → التوقيع بيتغير والتنبيه يرجع يظهر
 *     مرة واحدة — فالتذكير التجاري شغال من غير إزعاج متكرر.
 *   - `dismissed` بيبدأ `null` (لسه منقراش من localStorage) وبنرجّع null
 *     مؤقتًا عشان مفيش وميض «يظهر لحظة ويختفي» بعد الـ refresh.
 *
 * Sibling of `OfflineIndicator` in the same floating container.
 */
/** مفتاح التخزين لكل محل — الحالة مش مشتركة بين المحلات على نفس المتصفح. */
const DISMISS_STORAGE_PREFIX = 'nezam:sub-banner-dismissed:'

/**
 * توقيع «حالة التنبيه» الحالية: تاريخ الانتهاء + المتبقي.
 * أي تغيير حقيقي في الحالة (يوم جديد / سماح / تجديد) = توقيع مختلف.
 */
function reminderSignature(s: {
  endDate: string | null
  inGrace?: boolean
  graceDaysLeft?: number | null
  daysLeft: number | null
}): string {
  const bucket = s.inGrace
    ? `grace:${s.graceDaysLeft ?? 'x'}`
    : `soon:${s.daysLeft ?? 'x'}`
  return `${s.endDate ?? 'none'}|${bucket}`
}

export function TrialExpiredBanner() {
  const subscription = useShopStore((s) => s.subscription)
  const tenantId = useShopStore((s) => s.user?.tenantId ?? null)
  // null = لسه منقراش من localStorage (بنرجّع null مؤقتًا لمنع الوميض)
  const [dismissed, setDismissed] = React.useState<boolean | null>(null)

  // التنبيه قابل للقفل فقط في حالة «قريب من الانتهاء/سماح» (الأحمر مش قابل)
  const dismissible = !subscription.expired && subscription.expiringSoon === true
  const signature = React.useMemo(
    () => (dismissible ? reminderSignature(subscription) : null),
    [dismissible, subscription],
  )

  // اقرأ القفل المحفوظ كل ما يتغير التوقيع أو المحل
  React.useEffect(() => {
    if (!signature) {
      setDismissed(null)
      return
    }
    try {
      const raw = window.localStorage.getItem(
        DISMISS_STORAGE_PREFIX + (tenantId ?? 'anon'),
      )
      if (!raw) {
        setDismissed(false)
        return
      }
      const saved = JSON.parse(raw) as { sig?: string }
      setDismissed(saved?.sig === signature)
    } catch {
      // بيانات تالفة أو تخزين غير متاح — نعتبرها غير مقفولة
      setDismissed(false)
    }
  }, [signature, tenantId])

  function handleDismiss() {
    if (!signature) return
    try {
      window.localStorage.setItem(
        DISMISS_STORAGE_PREFIX + (tenantId ?? 'anon'),
        JSON.stringify({ sig: signature, at: Date.now() }),
      )
    } catch {
      // التخزين غير متاح (وضع خاص/ممتلئ) — القفل في الميموري يكفي للجلسة
    }
    setDismissed(true)
  }

  // Don't render anything if subscription is healthy or banner was dismissed
  if (dismissed) return null
  // لسه منقراش القفل المحفوظ؟ بنستنى نتيجة القراءة بدل ما نظهر البانر
  // لحظة ونخفيه (وميض بعد الـ refresh) — الكارت الأحمر (غير القابل للقفل)
  // مش متأثر لأن dismissed بيفضل null فيه.
  if (dismissed === null && dismissible) return null
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

        {/* Dismiss — only for expiring-soon, not for expired (persisted) */}
        {!isExpired && (
          <button
            onClick={handleDismiss}
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
