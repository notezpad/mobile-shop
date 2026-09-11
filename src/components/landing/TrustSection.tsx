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
    <section id="trust" className="landing-dark relative scroll-mt-24 py-20 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-brand-300"
          >
            ليه تثق فينا
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            مفيش مخاطرة عليك، وإحنا واخدين بالنا من ده
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-base lg-muted sm:text-lg"
          >
            نظام المحل منتج جديد وبيتطوّر بسرعة — وده معناه إننا بنسمع كل ملاحظة منك وبننفذها بسرعة. دي وعودنا الملموسة ليك:
          </motion.p>
        </div>

        {/* Trust grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_POINTS.map((t, i) => {
            const Icon = t.icon
            return (
              <motion.div
                key={t.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="glass-card flex flex-col gap-3 rounded-2xl p-6"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-inset ring-brand-400/20">
                  <Icon className="size-5 text-brand-300" />
                </span>
                <h3 className="text-sm font-bold text-white sm:text-base">{t.title}</h3>
                <p className="text-xs leading-relaxed lg-muted sm:text-sm">{t.body}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
