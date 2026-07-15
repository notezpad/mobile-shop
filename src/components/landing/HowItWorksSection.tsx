'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { UserPlus, Package, ShoppingCart } from 'lucide-react'

const STEPS = [
  {
    icon: UserPlus,
    title: 'سجل حسابك المجاني',
    desc: 'أنشئ حسابك في دقيقتين، بدون بطاقة ائتمان. تجربة 14 يوم مجاناً بكل المزايا.',
  },
  {
    icon: Package,
    title: 'أضف منتجاتك',
    desc: 'أدخل منتجاتك بالباركود أو يدوياً، أنشئ تصنيفات بنقرة واحدة.',
  },
  {
    icon: ShoppingCart,
    title: 'ابدأ البيع',
    desc: 'استخدم نقطة البيع السريعة، اطبع الفواتير، تتبع أرباحك لحظياً.',
  },
]

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 border-y bg-muted/30 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
          >
            البداية
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            ابدأ في 3 خطوات بسيطة
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-base text-muted-foreground sm:text-lg"
          >
            من التسجيل لأول بيع في أقل من 5 دقائق
          </motion.p>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {/* Dashed connecting line (desktop) */}
          <div
            aria-hidden
            className="absolute right-[16%] left-[16%] top-12 hidden border-t-2 border-dashed border-primary/30 md:block"
          />

          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="relative flex flex-col items-center text-center"
              >
                {/* Number circle with icon */}
                <div className="relative">
                  <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-white shadow-xl shadow-primary/25">
                    <Icon className="size-9" />
                  </div>
                  {/* Step number badge */}
                  <span className="absolute -right-2 -top-2 flex size-8 items-center justify-center rounded-full border-4 border-background bg-foreground text-sm font-bold text-background">
                    {i + 1}
                  </span>
                </div>

                <h3 className="mt-6 text-xl font-bold text-foreground">{s.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
