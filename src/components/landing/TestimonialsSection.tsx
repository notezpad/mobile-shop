'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Quote } from 'lucide-react'
import { useVertical } from './vertical-context'

const TESTIMONIALS = {
  electronics: [
    {
      quote: 'أخيراً نظام بسيط ومفهوم، ولادي اشتغلوا عليه في يوم واحد. المبيعات زادت 30% لأننا بقينا نعرف بالظبط بتبيع إيه.',
      name: 'أحمد محمد', shop: 'محل الاتصالات', location: 'القاهرة', initial: 'أ', color: 'from-emerald-500 to-emerald-600',
    },
    {
      quote: 'متابعة الصيانة كانت كابوس على الورق. دلوقتي كل جهاز له حالة واضحة والعميل بياخد تحديث لحظي.',
      name: 'سارة محمود', shop: 'موبايل هب', location: 'الإسكندرية', initial: 'س', color: 'from-violet-500 to-violet-600',
    },
    {
      quote: 'خزنة محافظ إلكترونية متعددة كانت بتضيع مني فلوس كتير. دلوقتي كل حاجة متابعة أول بأول.',
      name: 'خالد عبدالله', shop: 'اكسسوارات موبايل', location: 'الجيزة', initial: 'خ', color: 'from-amber-500 to-amber-600',
    },
    {
      quote: 'بقيت أبيع بالجملة والقطاعي من نفس النظام، وكل وحدة بيع بسعرها الصح تلقائياً.',
      name: 'محمد إبراهيم', shop: 'محل موبايل', location: 'طنطا', initial: 'م', color: 'from-sky-500 to-sky-600',
    },
  ],
  fashion: [
    {
      quote: 'المقاسات والألوان كانت أكبر مشكلة عندي. دلوقتي كل مقاس متابَع لوحده ومش بضيع بيعة بسبب نقص.',
      name: 'منى السيد', shop: 'بوتيك الأناقة', location: 'القاهرة', initial: 'م', color: 'from-rose-500 to-rose-600',
    },
    {
      quote: 'عندي عملاء جملة بياخدوا بالدستة، والنظام بيحسبلهم السعر الصح تلقائي من غير ما أتعب في الحسبة.',
      name: 'عمرو فتحي', shop: 'أحذية الجملة', location: 'الإسكندرية', initial: 'ع', color: 'from-violet-500 to-violet-600',
    },
    {
      quote: 'كل كوليكشن بقى منظم لوحده وسهل أطبق خصم عليه كله بضغطة واحدة وقت التنزيلات.',
      name: 'ياسمين طارق', shop: 'ستايل كوليكشن', location: 'الجيزة', initial: 'ي', color: 'from-amber-500 to-amber-600',
    },
    {
      quote: 'التقارير بتقوللي أكتر موديل وأكتر مقاس مبيعاً، فبقيت أجهز البضاعة الصح كل موسم.',
      name: 'كريم عادل', shop: 'محل ملابس رجالي', location: 'طنطا', initial: 'ك', color: 'from-sky-500 to-sky-600',
    },
  ],
} as const

export function TestimonialsSection() {
  const { vertical } = useVertical()
  const list = TESTIMONIALS[vertical]

  return (
    <section id="testimonials" className="landing-dark relative scroll-mt-24 py-12 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-brand-300"
          >
            آراء العملاء
          </motion.span>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            محلات تثق بنا
          </motion.h2>
        </div>

        {/* Testimonials grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={vertical}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            {list.map((t, i) => (
              <motion.div
                key={t.name}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="glass-card flex flex-col rounded-2xl p-6"
              >
                <Quote className="size-7 text-brand-400/30" />

                <div className="mt-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="size-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-white/85">{t.quote}</p>

                <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                  <span
                    className={
                      'flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ' +
                      t.color
                    }
                  >
                    {t.initial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{t.name}</p>
                    <p className="truncate text-xs lg-muted">
                      {t.shop} — {t.location}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
