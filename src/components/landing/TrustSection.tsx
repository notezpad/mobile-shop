'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, RefreshCcw, FileDown, MessagesSquare, Ban, Lock } from 'lucide-react'

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: 'ضمان استرداد الفلوس خلال 30 يوم',
    body: 'لو حسّيت إن النظام مش مناسب لمحلك، هنرجّعلك فلوسك كاملة من غير أي أسئلة.',
  },
  {
    icon: FileDown,
    title: 'بياناتك ملكك 100%',
    body: 'تقدر تصدّر كل بيانات محلك — منتجات، عملاء، فواتير — بضغطة زر في أي وقت. مفيش قفل عليك.',
  },
  {
    icon: RefreshCcw,
    title: 'نسخة احتياطية يومية تلقائية',
    body: 'بياناتك متحفوظة يوميًا على سيرفرات آمنة، مش متروكة لجهاز واحد ممكن يتعطل أو يضيع.',
  },
  {
    icon: MessagesSquare,
    title: 'دعم مباشر من فريق بيسمعك',
    body: 'إحنا فريق صغير بنبني المنتج ده دلوقتي — لما تكلمنا، بتتكلم مع اللي بيطوروا النظام فعليًا، وملاحظتك بتتنفذ بسرعة.',
  },
  {
    icon: Ban,
    title: 'بدون عقود ولا التزام',
    body: 'تجربة مجانية 14 يوم من غير بطاقة ائتمان، وتقدر تلغي اشتراكك في أي وقت من غير أي شرط.',
  },
  {
    icon: Lock,
    title: 'تشفير وأمان من أول لحظة',
    body: 'بياناتك ومعاملاتك المالية محمية بتشفير قوي، وصلاحيات دقيقة تتحكم فيها لكل موظف عندك.',
  },
]

export function TrustSection() {
  return (
    <section id="trust" className="landing-light is-alt relative scroll-mt-24 py-8 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-5 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-[#00946a]"
          >
            ليه تثق فينا
          </motion.span>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-3 text-[1.45rem] font-black text-[#0b2a20] sm:mt-4 sm:text-4xl lg:text-5xl"
            style={{ lineHeight: 1.25 }}
          >
            مفيش مخاطرة عليك، وإحنا واخدين بالنا من ده
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-2 max-w-2xl text-[14px] leading-relaxed lg-muted sm:mt-4 sm:text-lg"
          >
            نظام المحل منتج جديد وبيتطوّر بسرعة — وده معناه إننا بنسمع كل ملاحظة منك وبننفذها بسرعة. دي وعودنا الملموسة ليك:
          </motion.p>
        </div>

        {/* Trust grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {TRUST_POINTS.map((t, i) => {
            const Icon = t.icon
            return (
              <motion.div
                key={t.title}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="glass-card group flex flex-col gap-3 rounded-2xl p-6 sm:gap-4 sm:p-7"
              >
                <div className="flex shrink-0 items-center justify-between gap-3">
                  <span className="landing-tile size-11 transition-transform duration-300 sm:size-12 group-hover:scale-110 group-hover:-rotate-3">
                    <Icon className="size-5.5" />
                  </span>
                  <span
                    aria-hidden
                    className="hidden font-black sm:block text-[#00c98b]/12 transition-colors duration-300 group-hover:text-[#00c98b]/25"
                    style={{ fontSize: '2.6rem', lineHeight: 1 }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold leading-snug text-[#0b2a20] sm:text-xl">{t.title}</h3>
                <p className="text-sm leading-relaxed lg-muted sm:-mt-2 sm:text-base">{t.body}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
