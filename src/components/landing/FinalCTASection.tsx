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
    <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-emerald-700 py-20 sm:py-24">
      {/* Decorative shapes */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-16 size-72 rounded-full bg-brand-300/20 blur-3xl"
      />
      {/* Dot pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl"
        >
          جاهز تبدأ؟
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="mx-auto mt-4 max-w-xl text-base text-primary-foreground/85 sm:text-lg"
        >
          انضم لأكثر من 50 محل نشط على منصتنا. تجربتك المجانية تبدأ الآن.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="mt-8 flex justify-center"
        >
          <Button
            size="lg"
            onClick={() => onOpenAuth('signup')}
            className="h-12 gap-2 bg-primary-foreground px-7 text-base text-primary shadow-xl hover:bg-primary-foreground/90"
          >
            <Rocket className="size-5" />
            ابدأ تجربتك المجانية لمدة 14 يوم
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-primary-foreground/80 sm:text-sm"
        >
          <span className="flex items-center gap-1">
            <Check className="size-3.5" />
            بدون بطاقة ائتمان
          </span>
          <span className="flex items-center gap-1">
            <Check className="size-3.5" />
            إلغاء في أي وقت
          </span>
          <span className="flex items-center gap-1">
            <Check className="size-3.5" />
            دعم مجاني
          </span>
        </motion.div>
      </div>
    </section>
  )
}
