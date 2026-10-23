'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Lightbulb, TriangleAlert } from 'lucide-react'
import { useVertical, VERTICAL_META } from './vertical-context'

export function WhoForSection() {
  const { vertical } = useVertical()
  const meta = VERTICAL_META[vertical]

  return (
    <section id="who-for" className="landing-light is-alt relative scroll-mt-24 border-y border-[#00573f]/12 py-12 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="lg-eyebrow justify-center"
          >
            لمن النظام
          </motion.span>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 font-black text-[#0b2a20]"
            style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.9rem)', lineHeight: 1.2 }}
          >
            مصمم لكل من يدير {meta.label}
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-lg leading-[1.7] lg-muted"
          >
            سواء بتبيع بالقطاعي أو بالجملة، النظام بيحل مشكلتك بالظبط
          </motion.p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={vertical}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {meta.personas.map((p, i) => (
              <motion.div
                key={p.title}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="glass-card group rounded-2xl p-7"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="landing-tile is-deep size-11 shrink-0 text-base font-black transition-transform duration-300 group-hover:scale-110">
                    {i + 1}
                  </span>
                  <h3 className="text-xl font-extrabold text-[#0b2a20]">{p.title}</h3>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-gradient-to-bl from-amber-500/[0.07] to-amber-500/[0.02] p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-600">
                      <TriangleAlert className="size-3.5" />
                    </span>
                    <p className="text-sm font-extrabold text-amber-600">المشكلة</p>
                  </div>
                  <p className="mt-2 text-base leading-relaxed text-[#0b2a20]/70">{p.problem}</p>
                </div>

                <div className="mt-3 rounded-xl border border-brand-500/20 bg-gradient-to-bl from-brand-500/[0.08] to-brand-500/[0.02] p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-[#00946a]">
                      <Lightbulb className="size-3.5" />
                    </span>
                    <p className="text-sm font-extrabold text-[#00946a]">الحل</p>
                  </div>
                  <p className="mt-2 text-base leading-relaxed text-[#0b2a20]/80">{p.solution}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8 flex items-center justify-center gap-1.5 text-sm lg-muted"
        >
          مش لاقي نفسك؟ النظام يصلح لأي نشاط بيع بالقطعة أو الجملة
          <ArrowLeft className="size-4" />
        </motion.div>
      </div>
    </section>
  )
}
