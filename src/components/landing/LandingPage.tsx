'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Store, Users, Star, TrendingUp } from 'lucide-react'
import { LandingHeader } from './LandingHeader'
import { HeroSection } from './HeroSection'
import { FeaturesSection } from './FeaturesSection'
import { HowItWorksSection } from './HowItWorksSection'
import { ScreenshotsSection } from './ScreenshotsSection'
import { PricingSection } from './PricingSection'
import { TestimonialsSection } from './TestimonialsSection'
import { FAQSection } from './FAQSection'
import { FinalCTASection } from './FinalCTASection'
import { LandingFooter } from './LandingFooter'
import { AuthPage, type AuthMode } from './AuthPage'
import type { AuthUser } from '@/lib/auth-client'

interface LandingPageProps {
  onAuthed: (u: AuthUser, shopName?: string) => void
}

const STATS = [
  { icon: Store, label: 'محل نشط', value: '50+', color: 'text-success-subtle-foreground' },
  { icon: Users, label: 'مستخدم نشط', value: '1,000+', color: "text-info-subtle-foreground" },
  { icon: Star, label: 'تقييم العملاء', value: '4.9', color: 'text-accent2-500' },
  { icon: TrendingUp, label: 'نمو شهري', value: '15%', color: "text-chart-4" },
]

export function LandingPage({ onAuthed }: LandingPageProps) {
  // null = show landing page, 'login'/'signup' = show auth page
  const [authView, setAuthView] = React.useState<AuthMode | null>(null)

  const openAuth = React.useCallback((mode: AuthMode) => {
    setAuthView(mode)
  }, [])

  const closeAuth = React.useCallback(() => {
    setAuthView(null)
  }, [])

  // Show full-page auth when triggered
  if (authView) {
    return (
      <AuthPage
        mode={authView}
        onModeChange={setAuthView}
        onAuthed={onAuthed}
        onBack={closeAuth}
      />
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader onOpenAuth={openAuth} />

      <main className="flex-1">
        <HeroSection onOpenAuth={openAuth} />

        {/* Stats bar */}
        <section className="border-y bg-card">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-x-reverse divide-border/60 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            {STATS.map((s, i) => {
              const Icon = s.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="flex items-center justify-center gap-3 py-6 sm:py-8"
                >
                  <Icon className={'size-7 ' + s.color} />
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-foreground sm:text-2xl">
                      {s.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground sm:text-xs">
                      {s.label}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </section>

        <FeaturesSection />
        <HowItWorksSection />
        <ScreenshotsSection />
        <PricingSection onOpenAuth={openAuth} />
        <TestimonialsSection />
        <FAQSection />
        <FinalCTASection onOpenAuth={openAuth} />
      </main>

      <LandingFooter />
    </div>
  )
}
