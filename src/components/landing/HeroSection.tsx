'use client'

import * as React from 'react'
import {
  Check,
  Rocket,
  BarChart3,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { motion, type Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
import type { AuthMode } from './AuthModal'

interface HeroSectionProps {
  onOpenAuth: (mode: AuthMode) => void
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

export function HeroSection({ onOpenAuth }: HeroSectionProps) {
  const scrollToScreenshots = () => {
    const el = document.querySelector('#screenshots')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section
      id="top"
      className="relative overflow-hidden bg-gradient-to-b from-primary/[0.06] via-background to-background"
    >
      {/* Background pattern dots */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, oklch(0.55 0.18 142 / 0.18) 1px, transparent 0)',
          backgroundSize: '24px 24px',
          maskImage:
            'radial-gradient(ellipse 60% 50% at 50% 30%, black, transparent)',
          WebkitMaskImage:
            'radial-gradient(ellipse 60% 50% at 50% 30%, black, transparent)',
        }}
      />
      {/* Decorative blurred blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-1/4 size-72 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-1/4 size-72 rounded-full bg-emerald-300/20 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-24">
        {/* Right column (text) — appears first in RTL */}
        <div className="flex flex-col items-start gap-5 text-right">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          >
            <Rocket className="size-3.5" />
            منصة إدارة المحلات #1 في مصر
          </motion.div>

          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-4xl font-extrabold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            أدر محلك باحترافية
            <br />
            في <span className="text-primary">مكان واحد</span>
          </motion.h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="max-w-xl text-base text-muted-foreground sm:text-lg"
          >
            نظام متكامل لإدارة المبيعات والمخزون والصيانة والعملاء — مصمم خصيصاً لمحلات
            الموبايل والإكسسوارات.
          </motion.p>

          <motion.ul
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="space-y-2.5"
          >
            {[
              'نقطة بيع سهلة وسرعة في إتمام البيع',
              'تتبع المخزون والتنبيهات قبل النفاد',
              'تقارير مالية مفصلة وأرباح لحظية',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2 text-sm sm:text-base">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3.5" />
                </span>
                <span className="text-foreground/90">{t}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Button
              size="lg"
              onClick={() => onOpenAuth('signup')}
              className="h-12 gap-2 px-6 text-base shadow-lg shadow-primary/30"
            >
              <Rocket className="size-5" />
              ابدأ تجربتك المجانية
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={scrollToScreenshots}
              className="h-12 gap-2 px-6 text-base"
            >
              <BarChart3 className="size-5" />
              شاهد العرض التوضيحي
            </Button>
          </motion.div>

          <motion.div
            custom={5}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:text-sm"
          >
            <span className="flex items-center gap-1">
              <Check className="size-3.5 text-primary" />
              14 يوم مجاناً
            </span>
            <span className="flex items-center gap-1">
              <Check className="size-3.5 text-primary" />
              بدون بطاقة ائتمان
            </span>
            <span className="flex items-center gap-1">
              <Check className="size-3.5 text-primary" />
              إعداد في دقيقتين
            </span>
          </motion.div>

          {/* Avatar group */}
          <motion.div
            custom={6}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex items-center gap-3 pt-2"
          >
            <div className="flex -space-x-2 space-x-reverse">
              {['أ', 'م', 'س', 'خ', 'ع'].map((ch, i) => (
                <span
                  key={i}
                  className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-primary to-emerald-600 text-[11px] font-bold text-primary-foreground"
                  style={{ zIndex: 10 - i }}
                >
                  {ch}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              انضم لأكثر من <span className="font-bold text-foreground">50 محل نشط</span>
            </p>
          </motion.div>
        </div>

        {/* Left column (visual) — browser mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          {/* Floating badges */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-4 right-0 z-20 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-lg sm:right-4"
          >
            <DollarSign className="size-4 text-emerald-600" />
            +5,420 ج.م اليوم
          </motion.div>

          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            className="absolute -bottom-4 left-0 z-20 flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700 shadow-lg sm:left-4"
          >
            <AlertTriangle className="size-4 text-amber-500" />
            3 تنبيهات مخزون
          </motion.div>

          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -top-4 left-0 z-20 hidden items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-lg sm:left-8 sm:flex"
          >
            <CheckCircle2 className="size-4 text-emerald-600" />
            بيع جديد
          </motion.div>

          {/* Browser frame */}
          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl shadow-primary/10">
            {/* Top bar */}
            <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-rose-400" />
                <span className="size-3 rounded-full bg-amber-400" />
                <span className="size-3 rounded-full bg-emerald-400" />
              </div>
              <div className="mx-auto flex items-center gap-1.5 rounded-md bg-background px-3 py-1 text-[10px] text-muted-foreground" dir="ltr">
                <span className="size-2 rounded-full bg-emerald-500" />
                app.shop-system.eg/dashboard
              </div>
            </div>

            {/* Inner dashboard */}
            <div className="space-y-3 bg-background p-3 sm:p-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">لوحة المعلومات</p>
                  <p className="text-sm font-bold text-foreground">محل الاتصالات</p>
                </div>
                <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                  <TrendingUp className="size-3" />
                  +12.5%
                </div>
              </div>

              {/* Mini stat cards */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat
                  icon={<DollarSign className="size-3.5" />}
                  label="مبيعات اليوم"
                  value="5,420"
                  color="emerald"
                />
                <MiniStat
                  icon={<ShoppingCart className="size-3.5" />}
                  label="عدد الفواتير"
                  value="38"
                  color="primary"
                />
                <MiniStat
                  icon={<Package className="size-3.5" />}
                  label="المنتجات"
                  value="247"
                  color="amber"
                />
                <MiniStat
                  icon={<Users className="size-3.5" />}
                  label="العملاء"
                  value="156"
                  color="rose"
                />
              </div>

              {/* Mini bar chart */}
              <div className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-foreground">مبيعات الأسبوع</p>
                  <span className="text-[10px] text-muted-foreground">ج.م</span>
                </div>
                <div className="flex h-24 items-end justify-between gap-1.5">
                  {[
                    { d: 'س', v: 45 },
                    { d: 'ح', v: 62 },
                    { d: 'ن', v: 50 },
                    { d: 'ث', v: 78 },
                    { d: 'ر', v: 65 },
                    { d: 'خ', v: 95 },
                    { d: 'ج', v: 88 },
                  ].map((bar, i) => (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-primary/70 to-primary"
                        style={{ height: `${bar.v}%` }}
                      />
                      <span className="text-[9px] text-muted-foreground">
                        {bar.d}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mini product table */}
              <div className="overflow-hidden rounded-lg border">
                <div className="grid grid-cols-3 bg-muted/60 px-3 py-2 text-[10px] font-semibold text-muted-foreground">
                  <span>المنتج</span>
                  <span className="text-center">الكمية</span>
                  <span className="text-left">السعر</span>
                </div>
                {[
                  { n: 'شاحن سريع 20W', q: 12, p: '250' },
                  { n: 'كفر آيفون 15', q: 8, p: '180' },
                  { n: 'سماعة بلوتوث', q: 5, p: '650' },
                ].map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-3 border-t px-3 py-2 text-[11px] text-foreground"
                  >
                    <span className="truncate">{r.n}</span>
                    <span className="text-center text-muted-foreground">{r.q}</span>
                    <span className="text-left font-semibold text-emerald-600">
                      {r.p} ج.م
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* Mini stat card for the hero mockup */
function MiniStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'emerald' | 'primary' | 'amber' | 'rose'
}) {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  }
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className={'mb-1 flex size-6 items-center justify-center rounded ' + colorMap[color]}>
        {icon}
      </div>
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}
