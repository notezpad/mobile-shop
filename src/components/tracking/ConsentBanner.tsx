'use client'

/**
 * ═══════════════════════════════════════════════════════════════════
 * Cookie Consent Banner — واجهة الموافقة الفعلية
 * ═══════════════════════════════════════════════════════════════════
 * شريط موافقة حقيقي (Cookie Banner) يظهر للمستخدم عند تفعيل
 * Consent Management من لوحة الأدمن — وليس مجرد بنية داخلية:
 *
 *  1) الزيارة الأولى → شريط سفلي + لوحة تفضيلات (تحليلات / تسويق)
 *  2) قرار المستخدم → setConsent() من طبقة التتبع:
 *     - يخزن القرار في localStorage
 *     - يحدّث Google Consent Mode v2 فوراً
 *     - يحمّل بكسلات Meta / TikTok فقط عند موافقة التسويق
 *  3) زر عائم لإعادة فتح التفضيلات في أي وقت (مطلب امتثالي أساسي)
 *
 * البانر لا يظهر إطلاقاً عندما تكون إدارة الموافقة معطلة من الإعدادات —
 * وعندها تعمل المنصات بالسلوك المباشر السابق.
 */

import { useCallback, useEffect, useState } from 'react'
import { PublicTrackingConfig } from '@/lib/tracking/types'
import {
  getConsent,
  hasStoredConsent,
  setConsent,
} from '@/lib/tracking/client'

type Phase = 'waiting' | 'banner' | 'preferences'

function CookieIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
      <path d="M8.5 8.5v.01M15.5 12.5v.01M11 15v.01M7 12.5v.01M13 18.5v.01" />
    </svg>
  )
}

export function ConsentBanner({ config }: { config: PublicTrackingConfig }) {
  const [phase, setPhase] = useState<Phase>('waiting')
  const [reopenVisible, setReopenVisible] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  // ── الفتح الأولي: فقط عند تفعيل إدارة الموافقة وعدم وجود قرار سابق ──
  // config يُمرر كـ prop من TrackingBootstrap — لا نعتمد على window.NezamTracking
  // setState داخل setTimeout (deferred) لتجنب cascading renders — نمط المشروع الموحد.
  useEffect(() => {
    if (!config?.general.consentManagement) return
    const t = setTimeout(() => {
      if (hasStoredConsent()) {
        const c = getConsent()
        setAnalytics(c.analytics)
        setMarketing(c.marketing)
        setReopenVisible(true)
      } else {
        // زيارة أولى — إظهار البانر (التأخير يمنع الوميض أثناء الـ hydration)
        setPhase('banner')
      }
    }, 500)
    return () => clearTimeout(t)
  }, [config])

  // ── الاستماع لقرارات الموافقة القادمة من أي مصدر (Banner / API / Console) ──
  useEffect(() => {
    const onConsent = (e: Event) => {
      const detail = (e as CustomEvent<{ analytics: boolean; marketing: boolean }>).detail
      setAnalytics(!!detail?.analytics)
      setMarketing(!!detail?.marketing)
      setPhase('waiting')
      setReopenVisible(true)
    }
    window.addEventListener('nezam:consent', onConsent)
    return () => window.removeEventListener('nezam:consent', onConsent)
  }, [])

  const acceptAll = useCallback(() => setConsent({ analytics: true, marketing: true }), [])
  const rejectAll = useCallback(() => setConsent({ analytics: false, marketing: false }), [])
  const savePreferences = useCallback(
    () => setConsent({ analytics, marketing }),
    [analytics, marketing]
  )

  const openPreferences = useCallback(() => {
    const c = getConsent()
    setAnalytics(c.analytics)
    setMarketing(c.marketing)
    setPhase('preferences')
  }, [])

  return (
    <>
      {/* ─── زر إعادة فتح التفضيلات (بعد اتخاذ أول قرار) ─── */}
      {phase === 'waiting' && reopenVisible && (
        <button
          type="button"
          onClick={openPreferences}
          aria-label="إعدادات الكوكيز"
          title="إعدادات الكوكيز"
          className="fixed bottom-4 start-4 z-40 inline-flex size-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CookieIcon />
        </button>
      )}

      {/* ─── الشريط السفلي ─── */}
      {phase !== 'waiting' && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="الموافقة على ملفات تعريف الارتباط"
          className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
        >
          <div className="mx-auto max-w-3xl rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-popover/80 animate-in slide-in-from-bottom-4 fade-in duration-300">
            {phase === 'banner' ? (
              /* ─── العرض الأساسي ─── */
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CookieIcon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold sm:text-base">
                      الخصوصية وملفات تعريف الارتباط
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      نستخدم الكوكيز لتشغيل الموقع وقياس الأداء وتحسين حملاتنا التسويقية.
                      يمكنك قبول الكل، أو رفض الكل، أو اختيار ما تسمح به تحديداً.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={openPreferences}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    التفضيلات
                  </button>
                  <button
                    type="button"
                    onClick={rejectAll}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    رفض الكل
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    قبول الكل
                  </button>
                </div>
              </div>
            ) : (
              /* ─── لوحة التفضيلات ─── */
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CookieIcon className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold sm:text-base">تفضيلات الكوكيز</h2>
                    <p className="text-xs text-muted-foreground">
                      اختر الفئات المسموح بها — يمكنك تغيير رأيك في أي وقت من زر الكوكيز.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {/* ضرورية — دائماً مفعّلة */}
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        ضرورية
                        <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          مطلوبة دائماً
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        لتشغيل الموقع وحماية جلساتك وعمليات الدفع — لا يمكن إيقافها.
                      </p>
                    </div>
                    <span
                      aria-disabled="true"
                      className="relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full bg-primary opacity-70"
                    >
                      <span className="block size-4 translate-x-4 rounded-full bg-primary-foreground ltr:translate-x-4 rtl:-translate-x-4" />
                    </span>
                  </div>

                  {/* التحليلات */}
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:bg-accent/40">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">التحليلات</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        تساعدنا على فهم استخدام الموقع وتحسينه (Google Analytics).
                      </p>
                    </div>
                    <span className="shrink-0">
                      <input type="checkbox" className="sr-only" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
                      <span
                        aria-hidden="true"
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${analytics ? 'bg-primary' : 'bg-input'}`}
                      >
                        <span
                          className={`block size-4 rounded-full bg-background shadow transition-transform ${analytics ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0.5 rtl:-translate-x-0.5'}`}
                        />
                      </span>
                    </span>
                  </label>

                  {/* التسويق */}
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:bg-accent/40">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">التسويق والإعلانات</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        لقياس فعالية الحملات وتخصيص الإعلانات (Meta / TikTok) — يشمل
                        ad_storage وad_user_data وad_personalization.
                      </p>
                    </div>
                    <span className="shrink-0">
                      <input type="checkbox" className="sr-only" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                      <span
                        aria-hidden="true"
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${marketing ? 'bg-primary' : 'bg-input'}`}
                      >
                        <span
                          className={`block size-4 rounded-full bg-background shadow transition-transform ${marketing ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0.5 rtl:-translate-x-0.5'}`}
                        />
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPhase('banner')}
                    className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    رجوع
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    قبول الكل
                  </button>
                  <button
                    type="button"
                    onClick={savePreferences}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    حفظ التفضيلات
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
