'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  ShoppingCart,
  Package,
  Users,
  Wrench,
  Wallet,
  BarChart3,
} from 'lucide-react'

const FEATURES = [
  {
    icon: ShoppingCart,
    title: 'نقطة البيع (POS)',
    desc: 'بيعة سريعة بضغطة زر، ابحث بالباركود أو الاسم، اطبع الفاتورة فوراً.',
    color: 'from-emerald-500 to-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: Package,
    title: 'إدارة المخزون',
    desc: 'تتبع كل منتج، تنبيهات قبل النفاد، تقارير قيمة المخزون.',
    color: 'from-sky-500 to-sky-600',
    bg: 'bg-sky-50',
  },
  {
    icon: Users,
    title: 'إدارة العملاء',
    desc: 'سجل العملاء، الآجل والدفعات، كشف حساب كامل لكل عميل.',
    color: 'from-violet-500 to-violet-600',
    bg: 'bg-violet-50',
  },
  {
    icon: Wrench,
    title: 'مركز الصيانة',
    desc: 'تتبع أجهزة الصيانة من الاستلام للتسليم مع التكاليف.',
    color: 'from-amber-500 to-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: Wallet,
    title: 'الإدارة المالية',
    desc: 'خزنة، معاملات فودافون كاش/انستاباي/فوري مع حساب العمولات تلقائياً.',
    color: 'from-rose-500 to-rose-600',
    bg: 'bg-rose-50',
  },
  {
    icon: BarChart3,
    title: 'التقارير الذكية',
    desc: 'تقارير مبيعات وأرباح، أكثر المنتجات مبيعاً، تنبيهات ذكية.',
    color: 'from-teal-500 to-teal-600',
    bg: 'bg-teal-50',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 bg-background py-20 sm:py-24">
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
            المزايا
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            كل ما تحتاجه لإدارة محلك في منصة واحدة
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-base text-muted-foreground sm:text-lg"
          >
            ادعم محلك بأدوات احترافية مصممة خصيصاً للسوق المصري
          </motion.p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                whileHover={{ y: -6 }}
                className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
              >
                {/* Hover glow */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/0 blur-2xl transition-colors duration-300 group-hover:bg-primary/10"
                />

                <div
                  className={
                    'relative flex size-14 items-center justify-center rounded-2xl ' +
                    f.bg +
                    ' transition-transform duration-300 group-hover:scale-110'
                  }
                >
                  <span
                    className={
                      'flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white ' +
                      f.color
                    }
                  >
                    <Icon className="size-6" />
                  </span>
                </div>

                <h3 className="relative mt-5 text-lg font-bold text-foreground">
                  {f.title}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
