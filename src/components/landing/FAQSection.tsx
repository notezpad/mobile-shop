'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const FAQS = [
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
    a: 'نعم، تقدر تترقى أو تنزل في أي وقت من لوحة التحكم. الفرق يُحسب تلقائياً.',
  },
  {
    q: 'إيه اللي يحصل لو خلصت التجربة وملحقتش أشترك؟',
    a: 'بياناتك تفضل محفوظة 90 يوم، تقدر ترجع وتشترك في أي وقت وتلاقي كل حاجة مكانها.',
  },
  {
    q: 'هل المنصة تشتغل على الموبايل؟',
    a: 'نعم، المنصة متجاوبة بالكامل وتشتغل على أي جهاز (موبايل، تابلت، لابتوب) عبر المتصفح.',
  },
  {
    q: 'هل تدعم الطباعة الحرارية للفواتير؟',
    a: 'نعم، الفواتير تُطبع على طابعات A5 حرارية أو عادية، مع دعم الباركود.',
  },
  {
    q: 'أقدر أحصل على دعم فني؟',
    a: 'نعم، باقة التجربة فيها دعم بالبريد. الباقات المدفوعة فيها دعم أولوية عبر الهاتف والواتساب.',
  },
  {
    q: 'هل فيه رسوم خفية؟',
    a: 'مفيش أي رسوم خفية. السعر اللي تشوفه هو اللي تدفعه، شامل كل المزايا والتحديثات.',
  },
]

export function FAQSection() {
  return (
    <section
      id="faq"
      className="scroll-mt-24 border-t bg-muted/30 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
          >
            الأسئلة الشائعة
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            عندك سؤال؟ عندنا الإجابة
          </motion.h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-2xl border border-border/70 bg-card px-5 shadow-sm sm:px-6"
        >
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((item, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className={i === FAQS.length - 1 ? 'border-b-0' : ''}
              >
                <AccordionTrigger className="text-right text-sm font-semibold text-foreground hover:no-underline sm:text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-right text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  )
}
