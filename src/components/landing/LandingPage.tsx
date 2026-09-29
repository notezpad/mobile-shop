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
import { ScreenshotsSection } from './ScreenshotsSection'
import { PricingSection } from './PricingSection'
import { TrustSection } from './TrustSection'
import { FAQSection } from './FAQSection'
import { FinalCTASection } from './FinalCTASection'
import { LandingFooter } from './LandingFooter'
import { VerticalProvider } from './vertical-context'
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
  const router = useRouter()

  // 🛡️ 2026-09-17 (v3): Navigate to separate routes instead of using local state.
  // This way the URL changes to /login or /signup, and refresh preserves the page.
  const openAuth = React.useCallback((mode: 'login' | 'signup') => {
    router.push(`/${mode}`)
  }, [router])

  return (
    <VerticalProvider>
      <div className="landing-dark flex min-h-screen flex-col">
        <LandingHeader onOpenAuth={openAuth} />

        <main className="flex-1">
          <HeroSection onOpenAuth={openAuth} />

          {/* Stats bar */}
          <section className="landing-dark relative border-y border-white/5 py-2">
            <div className="relative mx-auto grid max-w-7xl grid-cols-2 divide-x divide-x-reverse divide-white/10 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
              {STATS.map((s, i) => {
                const Icon = s.icon
                return (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                    className="flex items-center justify-center gap-3 py-6 sm:py-8"
                  >
                    <Icon className="size-7 text-brand-400" />
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-white sm:text-base">
                        {s.headline}
                      </p>
                      <p className="text-[11px] lg-muted sm:text-xs">{s.label}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </section>

          <FeaturesSection />
          <WhoForSection />
          <HowItWorksSection />
          <ScreenshotsSection />
          <ComparisonSection onOpenAuth={openAuth} />
          <PricingSection onOpenAuth={openAuth} />
          <TrustSection />
          <FAQSection />
          <FinalCTASection onOpenAuth={openAuth} />
        </main>

        <LandingFooter />
      </div>
    </VerticalProvider>
  )
}
