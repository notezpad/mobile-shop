'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Rocket, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AuthMode } from './AuthModal'

interface FinalCTASectionProps {
  onOpenAuth: (mode: AuthMode) => void
}

export function FinalCTASection({ onOpenAuth }: FinalCTASectionProps) {
  return (
    <section className="landing-dark relative overflow-hidden py-20 sm:py-24">
      <div className="lg-aurora" aria-hidden />
      <div className="lg-grid-mask" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <motion.h2
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="font-black tracking-tight text-white"
          style={{ fontSize: 'clamp(1.8rem, 3.8vw, 3.2rem)', lineHeight: 1.2 }}
        >
          جاهز تبدأ؟
        </motion.h2>

        <motion.p
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="mx-auto mt-4 max-w-xl text-lg lg-muted"
        >
          كن من أوائل المحلات اللي بتجرب النظام وتستمتع بميزاته كاملة مجاناً لمدة 14 يوم.
        </motion.p>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="mt-8 flex justify-center"
        >
          <Button
            size="lg"
            onClick={() => onOpenAuth('signup')}
            className="h-14 gap-2 rounded-xl bg-gradient-to-l from-brand-500 to-brand-700 px-8 text-lg font-extrabold text-white shadow-xl shadow-brand-600/30 hover:from-brand-400 hover:to-brand-600"
          >
            <Rocket className="size-5" />
            ابدأ تجربتك المجانية لمدة 14 يوم
          </Button>
        </motion.div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs lg-muted sm:text-sm"
        >
          <span className="flex items-center gap-1">
            <Check className="size-3.5 text-brand-400" />
            بدون بطاقة ائتمان
          </span>
          <span className="flex items-center gap-1">
            <Check className="size-3.5 text-brand-400" />
            إلغاء في أي وقت
          </span>
          <span className="flex items-center gap-1">
            <Check className="size-3.5 text-brand-400" />
            دعم مجاني
          </span>
        </motion.div>
      </div>
    </section>
  )
}
