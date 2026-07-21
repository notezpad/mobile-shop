'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Star, Quote } from 'lucide-react'

const TESTIMONIALS = [
  {
    quote:
      'أخيراً نظام بسيط ومفهوم، ولادي اشتغلوا عليه في يوم واحد. المبيعات زادت 30% لأننا بقينا نعرف بالظبط بتبيع إيه.',
    name: 'أحمد محمد',
    shop: 'محل الاتصالات',
    location: 'القاهرة',
    initial: 'أ',
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    quote:
      'نقطة البيع سريعة جداً، الباركود بيقرا في ثانية. الفواتير بتطبع جميلة والعملاء بيفرحوا بيها.',
    name: 'سارة محمود',
    shop: 'موبايل هب',
    location: 'الإسكندرية',
    initial: 'س',
    color: 'from-violet-500 to-violet-600',
  },
  {
    quote:
      'حساب الآجل والدفعات حلت لي مشكلة كبيرة. كل عميل عندي كشف حساب واضح، مفيش فلوس ضايعة.',
    name: 'خالد عبدالله',
    shop: 'اكسسوارات موبايل',
    location: 'الجيزة',
    initial: 'خ',
    color: 'from-amber-500 to-amber-600',
  },
  {
    quote:
      'التقارير بتقوللي بالظبط إيه أكتر منتج مبيعاً وإيه اللي مكدس في المخزن. وفّرت عليّ شراء بضاعة مش هتتباع.',
    name: 'محمد إبراهيم',
    shop: 'محل موبايل',
    location: 'طنطا',
    initial: 'م',
    color: 'from-sky-500 to-sky-600',
  },
]

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="scroll-mt-24 bg-background py-20 sm:py-24"
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
            آراء العملاء
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            محلات تثق بنا
          </motion.h2>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="flex flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-md"
            >
              {/* Quote icon */}
              <Quote className="size-7 text-primary/20" />

              {/* Stars */}
              <div className="mt-3 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star
                    key={j}
                    className="size-4 fill-accent2-400 text-accent2-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">
                {t.quote}
              </p>

              {/* Author */}
              <div className="mt-5 flex items-center gap-3 border-t pt-4">
                <span
                  className={
                    'flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ' +
                    t.color
                  }
                >
                  {t.initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {t.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.shop} — {t.location}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
