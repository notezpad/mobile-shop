'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useVertical, VERTICAL_META } from './vertical-context'

// 🎨 V2: توحيد ألوان أيقونات المزايا على هوية البراند —
// بدل التدوير العشوائي (أحمر/أزرق/بنفسجي) اللي كان بيدي شكل قالب جاهز،
// دلوقتي تايل أخضر موحد بتناوب بسيط بين فاتح وغامق جوه نفس العيلة.
const FEATURE_COLORS = [
  { tile: 'landing-tile' },
  { tile: 'landing-tile is-deep' },
  { tile: 'landing-tile' },
  { tile: 'landing-tile is-deep' },
  { tile: 'landing-tile' },
  { tile: 'landing-tile is-deep' },
]

export function FeaturesSection() {
  const { vertical } = useVertical()
  const meta = VERTICAL_META[vertical]

  return (
    <section id="features" className="landing-light is-alt relative scroll-mt-24 overflow-hidden py-8 sm:py-28">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[400px] w-[800px] max-w-full"
        style={{ background: 'radial-gradient(ellipse, oklch(0.65 0.17 162 / 0.08) 0%, transparent 70%)' }}
        aria-hidden
      />
      <div className="lg-grid-mask opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-2.5 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-5 max-w-2xl text-center sm:mb-16">
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
            className="mt-2.5 font-black text-[#0b2a20] sm:mt-4"
            style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.9rem)', lineHeight: 1.2 }}
          >
            كل اللي محتاجه في مكان واحد
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-2 max-w-xl text-[15px] leading-[1.7] sm:mt-4 sm:text-lg lg-muted"
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
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
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
                  className="glass-card group flex flex-row items-center gap-3 rounded-2xl p-3 sm:flex-col sm:items-stretch sm:gap-0 sm:p-7"
                >
                  <div className={`size-11 shrink-0 sm:size-14 ${c.tile} transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
                    <Icon className="size-6" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="text-[15px] font-extrabold leading-snug text-[#0b2a20] sm:mt-5 sm:text-xl">{f.title}</h3>
                    <p className="mt-0.5 flex-1 text-[13px] leading-relaxed sm:mt-2.5 sm:text-base lg-muted">{f.desc}</p>
                    <span className="lg-tag mt-4 w-fit px-2.5 py-1 text-xs lp-hide-sm">
                      {f.tag}
                    </span>
                  </div>
                  </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
