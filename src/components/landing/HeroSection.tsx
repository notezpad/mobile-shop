'use client'

import * as React from 'react'
import {
  Check,
  Rocket,
  PlayCircle,
  TrendingUp,
  Gift,
  CreditCard,
  Zap,
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
    <section id="top" className="landing-green relative overflow-hidden pb-20 pt-3 sm:pb-32 sm:pt-8 lg:pt-10">
      <div className="lgh-ledger" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-2.5 sm:px-6 lg:px-8">
        {/* Top badge + vertical switcher */}
        <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-9 sm:gap-3.5">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="glass-pill inline-flex h-auto min-h-10 max-w-full items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white sm:px-5 sm:text-sm"
          >
            <span className="lg-dot shrink-0" />
            <span className="leading-snug">نظام إدارة محلات التجزئة والجملة</span>
          </motion.div>

          <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp} className="flex flex-col items-center gap-1.5">
            <span className="text-xs font-bold text-white sm:hidden">اختر نشاط محلك</span>
            <VerticalSwitch label="اختر نشاط محلك" />
          </motion.div>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          {/* Right column (text) — aligned to the start (right in RTL) */}
          <div className="flex flex-col items-start gap-4 text-start sm:gap-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={vertical + '-title'}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <h1
                  className="lgh-title font-black leading-[1.18] text-white"
                  style={{ fontSize: 'clamp(1.7rem, 2.9vw, 2.7rem)', textWrap: 'balance' }}
                >
                  {meta.heroTitle}
                </h1>
                <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed lg-muted sm:mt-5 sm:text-lg lg:text-xl">
                  {meta.heroSubtitle}
                </p>
              </motion.div>
            </AnimatePresence>


            <motion.div
              custom={4}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="flex w-full flex-col items-stretch gap-3 pt-1 sm:w-auto sm:flex-row sm:items-center sm:justify-start sm:pt-2"
            >
              <Button
                size="lg"
                onClick={() => onOpenAuth('signup')}
                className="h-12 w-full gap-2 rounded-xl bg-white px-6 text-base sm:h-14 sm:px-8 sm:text-lg font-extrabold text-[#00573f] shadow-xl shadow-[#00402c]/30 transition-transform hover:-translate-y-0.5 hover:bg-[#effcf7] sm:w-auto"
              >
                <Rocket className="size-5" />
                ابدأ تجربتك المجانية
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={scrollToScreenshots}
                className="h-12 gap-2 rounded-xl border-white/50 bg-white/10 px-6 text-base sm:h-14 sm:px-7 sm:text-lg font-semibold text-white hover:bg-white/20 hover:text-white"
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
              className="grid w-full max-w-xl grid-cols-3 overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_20px_40px_-16px_rgba(0,40,28,0.55)]"
            >
              {[
                { icon: Gift, b: '14 يوم', c: 'مجاناً' },
                { icon: CreditCard, b: 'بدون بطاقة', c: 'ائتمان' },
                { icon: Zap, b: 'دقيقتين', c: 'إعداد سريع' },
              ].map((g, i) => (
                <div
                  key={g.b}
                  className={'flex flex-col items-center gap-1 px-1 py-2.5 text-center transition-colors hover:bg-[#effcf7] sm:flex-row sm:items-center sm:gap-2.5 sm:px-3.5 sm:text-start ' + (i > 0 ? 'border-s border-[#00573f]/10' : '')}
                >
                  <span className="landing-tile size-7 shrink-0 sm:size-9">
                    <g.icon className="size-3.5 sm:size-[18px]" />
                  </span>
                  <p className="grid min-w-0 leading-tight">
                    <b className="text-[10.5px] font-extrabold leading-snug text-[#0b2a20] sm:text-sm">{g.b}</b>
                    <span className="text-[9px] leading-snug text-[#5b7a6e] sm:text-xs">{g.c}</span>
                  </p>
                </div>
              ))}
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.ul
                key={vertical + '-bullets'}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, delay: 0.05 }}
                className="w-full max-w-xl space-y-2.5"
              >
                {meta.heroBullets.map((t) => (
                  <li key={t} className="flex items-center justify-start gap-2.5 text-sm sm:text-base">
                    <span className="grid size-5.5 shrink-0 place-items-center rounded-full bg-white text-[#00946a] shadow-md shadow-[#00402c]/25 ring-1 ring-black/5">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    <span className="font-semibold text-white drop-shadow-sm">{t}</span>
                  </li>
                ))}
              </motion.ul>
            </AnimatePresence>
          </div>

          {/* Left column (visual) — glass dashboard mockup, swaps per vertical */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative hidden lg:block"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={vertical}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                {/* Floating badges */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-4 right-0 z-20 flex items-center gap-1.5 rounded-xl border border-[#00c98b]/25 bg-white px-3 py-2 text-xs font-bold text-[#0b2a20] shadow-xl shadow-[#00402c]/25 sm:right-4"
                >
                  <TrendingUp className="size-4 text-[#00946a]" />
                  +{meta.mockStats[0].value} اليوم
                </motion.div>

                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="absolute -bottom-4 left-0 z-20 flex items-center gap-1.5 rounded-xl border border-[#00c98b]/25 bg-white px-3 py-2 text-xs font-bold text-[#0b2a20] shadow-xl shadow-[#00402c]/25 sm:left-4"
                >
                  <meta.icon className="size-4 text-[#00946a]" />
                  {meta.label}
                </motion.div>

                {/* Browser frame */}
                <div className="relative overflow-hidden rounded-2xl border-2 border-white bg-white shadow-[0_30px_60px_-20px_rgba(0,40,28,0.6)]">
                  {/* Top bar */}
                  <div className="flex items-center gap-2 border-b border-[#00c98b]/20 bg-[#effcf7] px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="size-3 rounded-full bg-red-400/70" />
                      <span className="size-3 rounded-full bg-amber-400/70" />
                      <span className="size-3 rounded-full bg-[#00c98b]/80" />
                    </div>
                    <div
                      className="mx-auto flex items-center gap-1.5 rounded-md border border-[#00c98b]/20 bg-white px-3 py-1 text-[10px] text-[#5b7a6e]"
                      dir="ltr"
                    >
                      <span className="size-2 rounded-full bg-[#00c98b]" />
                      nezampos.com/dashboard
                    </div>
                  </div>

                  {/* Inner dashboard */}
                  <div className="space-y-3 bg-[#f7fbf9] p-3 sm:p-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-[#5b7a6e]">لوحة المعلومات</p>
                        <p className="text-sm font-bold text-[#0b2a20]">{meta.mockShopName}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-md bg-[#00c98b]/15 px-2 py-1 text-[10px] font-bold text-[#00694c]">
                        <TrendingUp className="size-3" />
                        +12.5%
                      </div>
                    </div>

                    {/* Mini stat cards */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {meta.mockStats.map((s) => (
                        <div key={s.label} className="rounded-lg border border-[#00c98b]/20 bg-white p-2.5 shadow-sm">
                          <div className="mb-1 flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-[#19e0a2] to-[#00c98b] text-white">
                            <s.icon className="size-3.5" />
                          </div>
                          <p className="text-[9px] text-[#5b7a6e]">{s.label}</p>
                          <p className="text-sm font-extrabold text-[#0b2a20]">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Mini bar chart */}
                    <div className="rounded-lg border border-[#00c98b]/20 bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] font-bold text-[#0b2a20]">مبيعات الأسبوع</p>
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
                          <div
                              key={i}
                              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                            >
                            <div
                              className="w-full rounded-t-md bg-gradient-to-t from-[#00946a] to-[#19e0a2] shadow-[0_2px_8px_-2px_rgba(0,148,106,0.5)] transition-transform duration-300 hover:scale-x-105"
                              style={{ height: `${bar.v}%` }}
                            />
                            <span className="text-[9px] text-[#5b7a6e]">{bar.d}</span>
                          </div>
                        ))}
                      </div>
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
