'use client'

import * as React from 'react'
import {
  Check,
  Rocket,
  PlayCircle,
  TrendingUp,
} from 'lucide-react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { VerticalSwitch } from './VerticalSwitch'
import { useVertical, VERTICAL_META } from './vertical-context'
import type { AuthMode } from './AuthModal'

interface HeroSectionProps {
  onOpenAuth: (mode: AuthMode) => void
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

export function HeroSection({ onOpenAuth }: HeroSectionProps) {
  const { vertical } = useVertical()
  const meta = VERTICAL_META[vertical]

  const scrollToScreenshots = () => {
    const el = document.querySelector('#screenshots')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section id="top" className="landing-dark relative overflow-hidden pb-20 pt-10 sm:pb-28 sm:pt-14 lg:pt-16">
      <div className="lg-aurora" aria-hidden />
      <div className="lg-grid-mask" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top badge + vertical switcher */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center sm:mb-14">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="glass-pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold text-brand-300"
          >
            <span className="lg-dot" />
            منصة SaaS واحدة لإدارة محلات التجزئة والجملة في الدول العربية
          </motion.div>

          <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
            <VerticalSwitch />
          </motion.div>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          {/* Right column (text) — appears first in RTL */}
          <div className="flex flex-col items-start gap-5 text-right">
            <AnimatePresence mode="wait">
              <motion.div
                key={vertical + '-title'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <h1
                  className="font-black leading-[1.15] tracking-tight text-white"
                  style={{ fontSize: 'clamp(2.1rem, 4.6vw, 4.2rem)', letterSpacing: '-0.5px' }}
                >
                  {meta.heroTitle}
                </h1>
                <p className="mt-5 max-w-xl text-lg lg-muted sm:text-xl">
                  {meta.heroSubtitle}
                </p>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.ul
                key={vertical + '-bullets'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, delay: 0.05 }}
                className="space-y-2.5"
              >
                {meta.heroBullets.map((t) => (
                  <li key={t} className="flex items-center gap-2 text-sm sm:text-base">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                      <Check className="size-3.5" />
                    </span>
                    <span className="text-white/90">{t}</span>
                  </li>
                ))}
              </motion.ul>
            </AnimatePresence>

            <motion.div
              custom={4}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center"
            >
              <Button
                size="lg"
                onClick={() => onOpenAuth('signup')}
                className="h-14 gap-2 rounded-xl bg-gradient-to-l from-brand-500 to-brand-700 px-8 text-lg font-extrabold text-white shadow-lg shadow-brand-600/30 transition-transform hover:-translate-y-0.5 hover:from-brand-400 hover:to-brand-600"
              >
                <Rocket className="size-5" />
                ابدأ تجربتك المجانية
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={scrollToScreenshots}
                className="h-14 gap-2 rounded-xl border-white/12 bg-white/5 px-7 text-lg font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <PlayCircle className="size-5" />
                شاهد العرض التوضيحي
              </Button>
            </motion.div>

            <motion.div
              custom={5}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs lg-muted sm:text-sm"
            >
              <span className="flex items-center gap-1">
                <Check className="size-3.5 text-brand-400" />
                14 يوم مجاناً
              </span>
              <span className="flex items-center gap-1">
                <Check className="size-3.5 text-brand-400" />
                بدون بطاقة ائتمان
              </span>
              <span className="flex items-center gap-1">
                <Check className="size-3.5 text-brand-400" />
                إعداد في دقيقتين
              </span>
            </motion.div>
          </div>

          {/* Left column (visual) — glass dashboard mockup, swaps per vertical */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={vertical}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                {/* Floating badges */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="glass-panel-strong absolute -top-4 right-0 z-20 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-lg sm:right-4"
                >
                  <TrendingUp className="size-4 text-brand-300" />
                  +{meta.mockStats[0].value}  اليوم
                </motion.div>

                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="glass-panel-strong absolute -bottom-4 left-0 z-20 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-lg sm:left-4"
                >
                  <meta.icon className="size-4 text-amber-300" />
                  {meta.label}
                </motion.div>

                {/* Browser frame */}
                <div className="glass-panel relative overflow-hidden rounded-2xl shadow-2xl">
                  {/* Top bar */}
                  <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="size-3 rounded-full bg-red-400/70" />
                      <span className="size-3 rounded-full bg-amber-400/70" />
                      <span className="size-3 rounded-full bg-brand-400/70" />
                    </div>
                    <div
                      className="mx-auto flex items-center gap-1.5 rounded-md bg-black/20 px-3 py-1 text-[10px] text-white/60"
                      dir="ltr"
                    >
                      <span className="size-2 rounded-full bg-brand-400" />
                      app.shop-system.com/dashboard
                    </div>
                  </div>

                  {/* Inner dashboard */}
                  <div className="space-y-3 p-3 sm:p-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/50">لوحة المعلومات</p>
                        <p className="text-sm font-bold text-white">{meta.mockShopName}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-md bg-brand-500/15 px-2 py-1 text-[10px] font-medium text-brand-300">
                        <TrendingUp className="size-3" />
                        +12.5%
                      </div>
                    </div>

                    {/* Mini stat cards */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {meta.mockStats.map((s) => (
                        <div key={s.label} className="glass-card rounded-lg p-2.5">
                          <div className="mb-1 flex size-6 items-center justify-center rounded bg-white/10 text-white">
                            <s.icon className="size-3.5" />
                          </div>
                          <p className="text-[9px] text-white/50">{s.label}</p>
                          <p className="text-sm font-bold text-white">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Mini bar chart */}
                    <div className="glass-card rounded-lg p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-white">مبيعات الأسبوع</p>
                        <span className="text-[10px] text-white/50"></span>
                      </div>
                      <div className="flex h-24 items-end justify-between gap-1.5">
                        {[
                          { d: 'س', v: 45 },
                          { d: 'ح', v: 62 },
                          { d: 'ن', v: 50 },
                          { d: 'ث', v: 78 },
                          { d: 'ر', v: 65 },
                          { d: 'خ', v: 95 },
                          { d: 'ج', v: 88 },
                        ].map((bar, i) => (
                          <div key={i} className="flex flex-1 flex-col items-center gap-1">
                            <div
                              className="w-full rounded-t bg-gradient-to-t from-brand-600/70 to-brand-400"
                              style={{ height: `${bar.v}%` }}
                            />
                            <span className="text-[9px] text-white/40">{bar.d}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Mini table */}
                    <div className="glass-card overflow-hidden rounded-lg">
                      <div className="grid grid-cols-3 bg-white/5 px-3 py-2 text-[10px] font-semibold text-white/50">
                        <span>{meta.mockTableTitle}</span>
                        <span className="text-center">العدد</span>
                        <span className="text-left">القيمة</span>
                      </div>
                      {meta.mockTableRows.map((r, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-3 border-t border-white/10 px-3 py-2 text-[11px] text-white/90"
                        >
                          <span className="truncate">{r.n}</span>
                          <span className="text-center text-white/50">{r.q}</span>
                          <span className="text-left font-semibold text-brand-300">
                            {r.p} 
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
