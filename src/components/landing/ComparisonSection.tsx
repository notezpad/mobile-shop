'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVertical, VERTICAL_META } from './vertical-context'
import type { AuthMode } from './AuthModal'

const ROWS_BY_VERTICAL = {
  electronics: [
    { task: 'حساب أرباح اليوم', manual: 'حسبة يدوية آخر اليوم على دفتر أو إكسل', system: 'صافي الربح لحظياً بعد خصم تكلفة الصيانة' },
    { task: 'متابعة أجهزة الصيانة', manual: 'ورقة لكل جهاز، سهل تتلخبط أو تضيع', system: 'حالة كل جهاز محدّثة لحظياً من أي شاشة' },
    { task: 'المعاملات المالية', manual: 'فودافون كاش وفوري مسجّلين على دفتر منفصل', system: 'كل معاملة مسجّلة تلقائياً مع الخزنة' },
    { task: 'تتبع المخزون', manual: 'جرد يدوي دوري، واكتشاف النقص متأخر', system: 'تنبيه فوري قبل نفاد أي منتج' },
    { task: 'البيع بالجملة والقطاعي', manual: 'حساب يدوي لفرق السعر بين الجملة والقطاعي', system: 'سعر تلقائي مختلف لكل وحدة بيع' },
  ],
  fashion: [
    { task: 'متابعة المقاسات والألوان', manual: 'جرد يدوي لكل مقاس ولون على حدة', system: 'مخزون دقيق ولحظي لكل متغير' },
    { task: 'البيع بالجملة ونص الجملة', manual: 'حساب يدوي لسعر الدستة مقابل القطعة', system: 'سعر تلقائي مختلف لكل وحدة بيع' },
    { task: 'إدارة الكوليكشنات', manual: 'كل كوليكشن بيتابع في ملف إكسل منفصل', system: 'كوليكشنات منظمة مع خصم موحّد بضغطة' },
    { task: 'حساب أرباح اليوم', manual: 'حسبة يدوية آخر اليوم على دفتر أو إكسل', system: 'صافي الربح لحظياً لكل قطعة وكوليكشن' },
    { task: 'تتبع المخزون', manual: 'جرد يدوي دوري، واكتشاف النقص متأخر', system: 'تنبيه فوري قبل نفاد أي مقاس أو لون' },
  ],
} as const

interface ComparisonSectionProps {
  onOpenAuth: (mode: AuthMode) => void
}

export function ComparisonSection({ onOpenAuth }: ComparisonSectionProps) {
  const { vertical } = useVertical()
  const meta = VERTICAL_META[vertical]
  const rows = ROWS_BY_VERTICAL[vertical]

  return (
    <section className="landing-dark relative py-20 sm:py-24">
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-14">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="lg-eyebrow justify-center"
          >
            ليه نظام المحل
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.9rem)', lineHeight: 1.2 }}
          >
            الدفاتر والإكسل مقابل نظام المحل
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-lg leading-[1.7] lg-muted"
          >
            شوف الفرق بنفسك بين الطريقة اليدوية القديمة وإدارة {meta.label} عبر نظام سحابي حديث
          </motion.p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={vertical}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="glass-card overflow-hidden rounded-2xl"
          >
            {/* Header row — desktop/tablet table header only */}
            <div className="hidden border-b border-white/10 bg-white/[0.03] px-7 py-4 text-sm font-bold sm:grid sm:grid-cols-3">
              <span className="lg-muted">المهمة</span>
              <span className="text-center text-white/50">الطريقة اليدوية</span>
              <span className="flex justify-center">
                <span className="glass-pill rounded-full bg-brand-500/15 px-3 py-1 text-center text-brand-300 ring-1 ring-inset ring-brand-400/30">
                  نظام المحل
                </span>
              </span>
            </div>

            {rows.map((r, i) => (
              <div
                key={r.task}
                className={
                  'px-5 py-5 transition-colors hover:bg-white/[0.02] sm:grid sm:grid-cols-3 sm:items-stretch sm:gap-2.5 sm:px-7 sm:py-4 ' +
                  (i !== rows.length - 1 ? 'border-b border-white/5' : '')
                }
              >
                {/* Task title — always visible, own line on mobile */}
                <span className="flex items-center text-base font-bold text-white sm:text-sm">
                  {r.task}
                </span>

                {/* Mobile: labeled stacked rows. Desktop: plain table cells (labels hidden via sm:hidden). */}
                <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:contents">
                  <span className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 text-sm text-white/50 sm:rounded-none sm:bg-transparent sm:py-1 sm:text-base">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                      <X className="size-3 text-red-400/80" />
                    </span>
                    <span className="flex-1">
                      <span className="ms-1 font-semibold text-white/40 sm:hidden">يدوي: </span>
                      {r.manual}
                    </span>
                  </span>
                  <span className="flex items-start gap-2 rounded-lg bg-brand-500/[0.07] px-3.5 py-2.5 text-sm text-white/90 ring-1 ring-inset ring-brand-400/15 sm:text-base">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20">
                      <Check className="size-3 text-brand-300" />
                    </span>
                    <span className="flex-1">
                      <span className="ms-1 font-semibold text-brand-300/70 sm:hidden">نظام المحل: </span>
                      {r.system}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="glass-panel mt-8 flex flex-col items-center gap-4 rounded-2xl p-7 text-center sm:flex-row sm:justify-between sm:text-right"
        >
          <p className="text-base lg-muted sm:text-lg">
            <span className="font-bold text-white">الخلاصة؟</span> نظام المحل بيوفّر عليك ساعات من
            الحساب اليدوي كل أسبوع، ويحميك من أخطاء مكلفة في الجرد والتسعير.
          </p>
          <Button
            onClick={() => onOpenAuth('signup')}
            className="h-12 shrink-0 gap-2 rounded-xl bg-gradient-to-l from-brand-500 to-brand-700 px-6 text-base font-bold text-white shadow-md shadow-brand-600/30 hover:from-brand-400 hover:to-brand-600"
          >
            <Rocket className="size-4" />
            ابدأ مجاناً الآن
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
