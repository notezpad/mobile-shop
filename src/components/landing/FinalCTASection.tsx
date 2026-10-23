'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Rocket, Check, Receipt, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AuthMode } from './AuthModal'

interface FinalCTASectionProps {
  onOpenAuth: (mode: AuthMode) => void
}

const GUARANTEES = [
  { icon: Check, label: 'بدون بطاقة ائتمان' },
  { icon: Check, label: 'إلغاء في أي وقت' },
  { icon: Check, label: 'دعم مجاني' },
]

export function FinalCTASection({ onOpenAuth }: FinalCTASectionProps) {
  return (
    <section className="landing-green relative overflow-hidden py-16 sm:py-28">
      <div className="lgh-ledger" aria-hidden />

      {/* توهجات ناعمة للخلفية */}
      <div aria-hidden className="pointer-events-none absolute -top-28 right-[6%] size-80 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-[4%] size-96 rounded-full bg-[#003c28]/45 blur-3xl" />

      {/* كروت عايمة على الجانبين (ديسكتوب بس) */}
      <motion.div
        aria-hidden
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        className="float-chip absolute right-[6%] top-16 z-10 hidden xl:inline-flex"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#19e0a2] to-[#00b47f] text-white">
          <TrendingUp className="size-4" />
        </span>
        +12.5% مبيعات النهاردة
      </motion.div>

      <motion.div
        aria-hidden
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        className="float-chip absolute bottom-24 left-[6%] z-10 hidden xl:inline-flex"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#19e0a2] to-[#00b47f] text-white">
          <Receipt className="size-4" />
        </span>
        فاتورة جديدة · 128 ج
      </motion.div>

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        {/* بادج علوي */}
        <motion.span
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.4 }}
          className="glass-pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold text-white sm:text-sm"
        >
          <span className="lg-dot" />
          ابدأ في أقل من دقيقتين
        </motion.span>

        <motion.h2
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mt-5 font-black leading-[1.15] text-white"
          style={{ fontSize: 'clamp(1.9rem, 4vw, 3.4rem)', textWrap: 'balance' }}
        >
          جاهز <span className="lg-grad-text">تبدأ؟</span>
        </motion.h2>

        <motion.p
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="mx-auto mt-4 max-w-xl text-lg leading-relaxed lg-muted sm:text-xl"
        >
          كن من أوائل المحلات اللي بتجرب النظام وتستمتع بميزاته كاملة مجاناً لمدة 14 يوم.
        </motion.p>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-9 flex justify-center"
        >
          <Button
            size="lg"
            onClick={() => onOpenAuth('signup')}
            className="cta-shine h-14 gap-2.5 rounded-2xl bg-white px-10 text-lg font-extrabold text-[#00573f] shadow-2xl shadow-[#00301f]/40 transition-transform hover:-translate-y-0.5 hover:bg-[#effcf7] focus-visible:ring-4 focus-visible:ring-white/40"
          >
            <Rocket className="size-5" />
            ابدأ تجربتك المجانية لمدة 14 يوم
          </Button>
        </motion.div>

        {/* ضمانات */}
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.28 }}
          className="mt-7 flex flex-wrap items-center justify-center gap-2.5"
        >
          {GUARANTEES.map((g) => (
            <span key={g.label} className="cta-chip">
              <span className="chip-ic">
                <g.icon className="size-3.5" strokeWidth={3} />
              </span>
              {g.label}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
