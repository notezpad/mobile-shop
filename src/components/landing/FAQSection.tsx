'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useVertical } from './vertical-context'

const COMMON_FAQS = [
  {
    q: 'هل التجربة المجانية تحتاج بطاقة ائتمان؟',
    a: 'لا، التجربة مجانية تماماً 14 يوم بدون أي بيانات دفع. في نهاية المدة تختار الباقة المناسبة أو توقف بدون أي التزام.',
  },
  {
    q: 'هل بياناتي آمنة؟',
    a: 'نعم، نستخدم تشفير كامل لجميع البيانات، نسخ احتياطي يومي، وعزل تام بين بيانات المحلات المختلفة.',
  },
  {
    q: 'أقدر أغير الباقة في أي وقت؟',
    a: 'نعم، تقدر تترقى من الباقة الأساسية للاحترافية في أي وقت من لوحة التحكم. الفرق يُحسب تلقائياً.',
  },
  {
    q: 'هل المنصة تشتغل على الموبايل؟',
    a: 'نعم، المنصة متجاوبة بالكامل وتشتغل على أي جهاز (موبايل، تابلت، لابتوب) عبر المتصفح.',
  },
  {
    q: 'هل تدعم الطباعة الحرارية للفواتير؟',
    a: 'نعم، الفواتير تُطبع على طابعات A5 حرارية أو عادية، مع دعم الباركود.',
  },
]

const VERTICAL_FAQS = {
  electronics: [
    {
      q: 'هل النظام يتابع أجهزة الصيانة؟',
      a: 'نعم، تقدر تسجّل كل جهاز بحالته (مستلم، قيد الفحص، جاهز للتسليم) وتتابعه لحظة بلحظة من أي شاشة.',
    },
    {
      q: 'هل يدعم المحافظ الإلكترونية المتعددة؟',
      a: 'نعم، كل معاملات الدفع الإلكتروني مسجّلة تلقائياً في الخزنة مع تسوية يومية دقيقة.',
    },
    {
      q: 'هل أقدر أبيع بالجملة لتجار الإكسسوارات؟',
      a: 'نعم، الباقة الاحترافية تدعم وحدات بيع متعددة (قطاعة، دستة، كرتونة) بسعر مختلف لكل وحدة.',
    },
  ],
  fashion: [
    {
      q: 'هل النظام يدعم المقاسات والألوان؟',
      a: 'نعم، كل منتج بمقاساته وألوانه كمتغيرات مستقلة، مع مخزون دقيق ومنفصل لكل متغير.',
    },
    {
      q: 'إزاي يشتغل البيع بالجملة ونص الجملة؟',
      a: 'الباقة الاحترافية بتديك وحدات بيع متعددة — قطعة، نص دستة، دستة — وكل وحدة سعرها يتحسب تلقائياً.',
    },
    {
      q: 'هل أقدر أنظّم منتجاتي في كوليكشنات؟',
      a: 'نعم، تقدر تجمّع منتجاتك في كوليكشنات موسمية وتطبّق خصم موحّد على الكوليكشن كله بضغطة واحدة.',
    },
  ],
} as const

export function FAQSection() {
  const { vertical } = useVertical()
  const faqs = [...VERTICAL_FAQS[vertical], ...COMMON_FAQS]

  return (
    <section id="faq" className="landing-light relative scroll-mt-24 border-t border-[#00573f]/12 py-8 sm:py-24">
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-5 max-w-2xl text-center sm:mb-12">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="lg-eyebrow justify-center"
          >
            الأسئلة الشائعة
          </motion.span>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-2.5 font-black text-[#0b2a20] sm:mt-4"
            style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.9rem)', lineHeight: 1.2 }}
          >
            عندك سؤال؟ عندنا الإجابة
          </motion.h2>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={vertical}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="glass-card overflow-hidden rounded-2xl px-3.5 sm:px-7"
          >
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className={'border-[#00573f]/12 ' + (i === faqs.length - 1 ? 'border-b-0' : '')}
                >
                  <AccordionTrigger className="py-3.5 text-right text-[15px] font-bold leading-snug text-[#0b2a20] hover:no-underline sm:py-4 sm:text-lg">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-right text-sm leading-relaxed sm:text-base lg-muted">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
