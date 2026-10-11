'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useVertical, VERTICAL_META } from './vertical-context'

// Cycling accent palette for feature icon tiles — mirrors the
// WorkerOS reference (amber/emerald/red/blue/purple rotation),
// re-mapped so emerald leads since it's this project's brand hue.
// `bar` sets the always-visible top border color per card (via a
// CSS custom property consumed by .glass-card::before).
const FEATURE_COLORS = [
  { icon: 'text-amber-300', bg: 'bg-amber-500/12', ring: 'ring-amber-500/25', bar: 'oklch(0.75 0.15 80)' },
  { icon: 'text-brand-300', bg: 'bg-brand-500/12', ring: 'ring-brand-500/25', bar: 'oklch(0.74 0.16 162)' },
  { icon: 'text-red-300', bg: 'bg-red-500/12', ring: 'ring-red-500/25', bar: 'oklch(0.7 0.19 25)' },
  { icon: 'text-amber-300', bg: 'bg-amber-500/12', ring: 'ring-amber-500/25', bar: 'oklch(0.75 0.15 80)' },
  { icon: 'text-blue-300', bg: 'bg-blue-500/12', ring: 'ring-blue-500/25', bar: 'oklch(0.7 0.15 235)' },
  { icon: 'text-purple-300', bg: 'bg-purple-500/12', ring: 'ring-purple-500/25', bar: 'oklch(0.65 0.18 300)' },
]

export function FeaturesSection() {
  const { vertical } = useVertical()
  const meta = VERTICAL_META[vertical]

  return (
    <section id="features" className="landing-dark relative scroll-mt-24 overflow-hidden py-12 sm:py-28">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[400px] w-[800px] max-w-full"
        style={{ background: 'radial-gradient(ellipse, oklch(0.65 0.17 162 / 0.08) 0%, transparent 70%)' }}
        aria-hidden
      />
      <div className="lg-grid-mask opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="lg-eyebrow justify-center"
          >
            المزايا · {meta.label}
          </motion.span>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.9rem)', lineHeight: 1.2 }}
          >
            كل اللي محتاجه في مكان واحد
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-lg leading-[1.7] lg-muted"
          >
            نظام متكامل صُمّم خصيصاً لواقع {meta.label} في الدول العربية — بدون زوائد ولا تعقيدات
          </motion.p>
        </div>

        {/* Solid feature-card grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={vertical}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {meta.features.map((f, i) => {
              const Icon = f.icon
              const c = FEATURE_COLORS[i % FEATURE_COLORS.length]
              return (
                <motion.div
                  key={f.title}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.45, delay: i * 0.06 }}
                  style={{ '--card-bar': c.bar } as React.CSSProperties}
                  className="glass-card group flex flex-col rounded-2xl p-7 [&::before]:bg-[image:linear-gradient(90deg,var(--card-bar),transparent)]"
                >
                  <div className={`flex size-14 items-center justify-center rounded-xl ring-1 ${c.bg} ${c.ring} ${c.icon}`}>
                    <Icon className="size-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold text-white">{f.title}</h3>
                  <p className="mt-2.5 flex-1 text-base leading-relaxed lg-muted">{f.desc}</p>
                  <span className="mt-4 inline-flex w-fit items-center rounded-md border border-brand-500/25 bg-brand-500/8 px-2.5 py-1 text-xs font-bold text-brand-300">
                    {f.tag}
                  </span>
                </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
