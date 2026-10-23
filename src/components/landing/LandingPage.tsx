'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Store, Users, Star, TrendingUp } from 'lucide-react'
import { LandingHeader } from './LandingHeader'
import { HeroSection } from './HeroSection'
import { FeaturesSection } from './FeaturesSection'
import { WhoForSection } from './WhoForSection'
import { ComparisonSection } from './ComparisonSection'
import { HowItWorksSection } from './HowItWorksSection'
import dynamic from 'next/dynamic'
import { LazyOnVisible } from './LazyOnVisible'

// ⚡ قسم الصور تقيل (464 سطر + صور) — ما بيتحمّلش غير لما الزائر يقرّب منه
const ScreenshotsSection = dynamic(
  () => import('./ScreenshotsSection').then((m) => m.ScreenshotsSection),
  { ssr: false },
)
import { PricingSection } from './PricingSection'
import { TrustSection } from './TrustSection'
import { FAQSection } from './FAQSection'
import { FinalCTASection } from './FinalCTASection'
import { LandingFooter } from './LandingFooter'
import { VerticalProvider, useVertical } from './vertical-context'
import { StickyMobileCTA } from './StickyMobileCTA'
import type { AuthUser } from '@/lib/auth-client'

/**
 * 🛡️ 2026-09-17 (v3): URL-based auth routing.
 *
 * Removed the local `authView` state that was controlling whether to show
 * the AuthPage overlay. Instead, when the user clicks "Login" or "Sign up"
 * on the landing, we navigate to `/login` or `/signup` (separate routes).
 *
 * Why? Because the old approach stored the auth mode in React state, so:
 *   - User on `/` → clicks "Sign up" → state = 'signup' (URL still `/`)
 *   - Refresh → state resets to null → back to landing page (BAD UX)
 *   - User couldn't share the signup URL with someone else
 *   - Back button didn't work as expected
 *
 * With separate routes:
 *   - User on `/` → clicks "Sign up" → navigates to `/signup` (URL changes)
 *   - Refresh → stays on `/signup` (URL preserved) ✓
 *   - User can share the URL ✓
 *   - Back button goes back to `/` (landing) ✓
 *
 * The `onAuthed` prop is now optional because the separate `/login` and
 * `/signup` pages handle their own post-auth redirect via router.push.
 * The `(shop)/layout.tsx` fetches the session on mount and hydrates the
 * Zustand store, so the store gets updated when the user lands on /dashboard.
 */

interface LandingPageProps {
  onAuthed?: (u: AuthUser, shopName?: string) => void
}

const STATS = [
  { icon: Store, headline: 'لكل أنواع المحلات', label: 'إلكترونيات وموبايلات وأكتر' },
  { icon: Users, headline: 'فريقك كله في مكان واحد', label: 'صلاحيات مخصصة لكل موظف' },
  { icon: Star, headline: 'دعم فني بيرد بسرعة', label: 'مش هتستنى ساعات عشان تتحل مشكلتك' },
  { icon: TrendingUp, headline: 'تقارير لحظية', label: 'تعرف وضع محلك أول بأول' },
]

export function LandingPage({ onAuthed: _onAuthed }: LandingPageProps) {
  return (
    <VerticalProvider>
      <LandingInner />
    </VerticalProvider>
  )
}

function LandingInner() {
  const router = useRouter()
  const { vertical } = useVertical()

  // 🛡️ 2026-09-17 (v3): Navigate to separate routes instead of using local state.
  // This way the URL changes to /login or /signup, and refresh preserves the page.
  // النشاط المختار في الصفحة بيتنقل للتسجيل (باقة الملابس أو الموبايلات مختارة جاهزة)
  const openAuth = React.useCallback((mode: 'login' | 'signup') => {
    router.push(mode === 'signup' ? `/signup?plan=${vertical}-basic` : `/${mode}`)
  }, [router, vertical])

  return (
    <>
      <div className="landing-light flex min-h-screen flex-col">
        <LandingHeader onOpenAuth={openAuth} />

        <main className="flex-1">
          <HeroSection onOpenAuth={openAuth} />

          {/* Stats bar — كارت أبيض عايم بيعدّي على أسفل الهيرو الأخضر */}
          <section className="relative z-10 -mt-12 px-2.5 pb-2 sm:-mt-20 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-x-reverse divide-[#00573f]/10 overflow-hidden rounded-2xl border border-white/80 bg-white sm:rounded-3xl shadow-[0_30px_60px_-24px_rgba(0,40,28,0.7)] lg:grid-cols-4">
              {STATS.map((s, i) => {
                const Icon = s.icon
                return (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                    className="flex items-center justify-center gap-3 px-2 py-3.5 transition-colors hover:bg-[#effcf7] sm:py-7 [&:nth-child(n+3)]:border-t [&:nth-child(n+3)]:border-[#00573f]/10 lg:[&:nth-child(n+3)]:border-t-0"
                  >
                    <span className="landing-tile size-9 shrink-0 sm:size-11">
                      <Icon className="size-5" />
                    </span>
                    <div className="text-right">
                      <p className="text-[13px] font-extrabold leading-snug text-[#0b2a20] sm:text-base">{s.headline}</p>
                      <p className="text-[10.5px] leading-snug text-[#5b7a6e] sm:text-xs">{s.label}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </section>

          {/* ترتيب مبني على زائر الموبايل: خطوات بسيطة ← مزايا ← أسعار ← باقي الإثباتات */}
          <HowItWorksSection />
          <FeaturesSection />
          <PricingSection onOpenAuth={openAuth} />
          <LazyOnVisible id="screenshots" minHeight={640}>
            <ScreenshotsSection />
          </LazyOnVisible>
          <WhoForSection />
          {/* المقارنة مخفية على الموبايل لتقصير الصفحة (ظاهرة من الشاشات المتوسطة) */}
          <div className="hidden md:block">
            <ComparisonSection onOpenAuth={openAuth} />
          </div>
          <TrustSection />
          <FAQSection />
          <FinalCTASection onOpenAuth={openAuth} />
        </main>

        <LandingFooter />
      </div>
      <StickyMobileCTA onClick={() => openAuth('signup')} />
    </>
  )
}
