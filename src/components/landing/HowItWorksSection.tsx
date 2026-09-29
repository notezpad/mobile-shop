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
    <section id="how-it-works" className="landing-dark relative scroll-mt-24 border-y border-white/5 py-20 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="lg-eyebrow justify-center"
          >
            البداية
          </motion.span>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.9rem)', lineHeight: 1.2 }}
          >
            ابدأ في 3 خطوات بسيطة
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-lg leading-[1.7] lg-muted"
          >
            من التسجيل لأول بيع في أقل من 5 دقائق
          </motion.p>
        </div>

        {/* Steps — solid cards with oversized faded step number, WorkerOS-style */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.div
                key={s.title}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="glass-card relative overflow-hidden rounded-2xl p-7 pt-10"
              >
                <span
                  className="pointer-events-none absolute -top-3 left-4 font-black text-white/[0.06]"
                  style={{ fontSize: '5.5rem', lineHeight: 1 }}
                >
                  {i + 1}
                </span>
                <div className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25">
                  <Icon className="size-6" />
                </div>
                <h3 className="relative mt-5 text-xl font-extrabold text-white">{s.title}</h3>
                <p className="relative mt-2.5 max-w-xs text-base leading-relaxed lg-muted">{s.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
