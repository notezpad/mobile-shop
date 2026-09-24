'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Store,
  Sparkles,
  Target,
  Lightbulb,
  ShieldCheck,
  WifiOff,
  Wallet,
  Smartphone,
  Users,
  Code2,
  Database,
  Cloud,
  Cpu,
  Zap,
  Heart,
  ArrowLeft,
  CheckCircle2,
  TrendingUp,
  Wrench,
  ShoppingBag,
  Boxes,
  BarChart3,
} from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'

/**
 * صفحة "من نحن" — About Page
 *
 * 🛡️ 2026-09-14: Premium dark glassmorphic design مطابق للـ landing page.
 * محتوى مخصص بناءً على المعلومات اللي用户提供ها:
 * - الاسم: نظام المحل
 * - القطاع: محلات موبايل/كمبيوتر + ملابس/أحذية
 * - الرسالة: حل مشكلة المحلات العربية + تبسيط الإدارة بالتقنية
 * - القيم: سهولة + أسعار عادلة + أمان + يعمل بدون إنترنت
 * - التواصل: واتساب 201010328471
 */

// ─── Motion variants ─────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5 },
}

const stagger = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { staggerChildren: 0.08 },
}

// ─── Page data ──────────────────────────────────────────
const STATS = [
  { value: '16', label: 'وحدة إدارية', suffix: 'وحدة', icon: Boxes },
  { value: '4', label: 'باقات مرنة', suffix: 'باقات', icon: Wallet },
  { value: '14', label: 'يوم تجربة مجانية', suffix: 'يوم', icon: Sparkles },
  { value: '100%', label: 'بأيد عربية', suffix: '', icon: Heart },
]

const VALUES = [
  {
    icon: Smartphone,
    title: 'سهولة الاستخدام',
    desc: 'نظام بسيط يقدر أي صاحب محل يستخدمه بدون خبرة تقنية — ابدأ البيع في دقائق بدون تدريب معقد.',
    color: 'from-emerald-500/20 to-emerald-700/10',
    iconColor: 'text-emerald-300',
  },
  {
    icon: Wallet,
    title: 'أسعار عادلة بعملتك المحلية',
    desc: 'باقات بأسعار مناسبة بدون رسوم خفية أو عقود طويلة — ادفع شهري أو سنوي حسب ما يناسبك.',
    color: 'from-amber-500/20 to-amber-700/10',
    iconColor: 'text-amber-300',
  },
  {
    icon: ShieldCheck,
    title: 'أمان البيانات',
    desc: 'بياناتك محمية بأحدث تقنيات التشفير SSL 256-bit مع نسخ احتياطي يومي تلقائي على Supabase.',
    color: 'from-blue-500/20 to-blue-700/10',
    iconColor: 'text-blue-300',
  },
  {
    icon: WifiOff,
    title: 'يعمل بدون إنترنت',
    desc: 'PWA متقدم يشتغل offline بالكامل — بِع وعدّل وامسح الباركود حتى لو النت مقطوع، وتزامن تلقائي لما يرجع.',
    color: 'from-purple-500/20 to-purple-700/10',
    iconColor: 'text-purple-300',
  },
]

const FEATURES = [
  {
    icon: ShoppingBag,
    title: 'نقطة بيع (POS)',
    desc: 'بيع سريع بالباركود، دفع نقدي أو آجل، فاتورة حرارية بباركود، وربط مباشر بالمخزون والعملاء.',
  },
  {
    icon: Boxes,
    title: 'إدارة مخزون ذكية',
    desc: 'تنبيهات قبل النفاد، جرد بالباركود، تحويلات بين الفروع، وحركات وارد/صادر كاملة.',
  },
  {
    icon: Wrench,
    title: 'متابعة الصيانة',
    desc: 'سجل كل جهاز بحالته (مستلم، قيد الفحص، جاهز للتسليم) وتنبيه تلقائي للعميل لما يجهز.',
  },
  {
    icon: Wallet,
    title: 'المعاملات المالية',
    desc: 'محافظ إلكترونية متعددة — كل معاملة مسجّلة بعمولتها وصافي المكسب لحظياً.',
  },
  {
    icon: TrendingUp,
    title: 'تقارير وأرباح لحظية',
    desc: 'اعرف أكثر منتج مبيعاً، هامش الربح الحقيقي، وأداء كل فرع — كل ده في شاشة واحدة.',
  },
  {
    icon: Sparkles,
    title: 'بيع بالجملة',
    desc: 'وحدات بيع متعددة (قطاعة، كرتونة، دستة) بأسعار مختلفة تلقائياً لكل وحدة — للتجار الجملة.',
  },
]

const TECH_STACK = [
  { name: 'Next.js 16', desc: 'App Router + React 19', icon: Code2 },
  { name: 'Supabase', desc: 'PostgreSQL + Auth', icon: Database },
  { name: 'Cloudflare Workers', desc: 'Edge deployment', icon: Cloud },
  { name: 'Prisma ORM', desc: 'Type-safe database', icon: Database },
  { name: 'PWA + IndexedDB', desc: 'Offline-first', icon: Cpu },
  { name: 'Paymob', desc: 'دفع آمن', icon: Wallet },
]

export default function AboutPage() {
  return (
    <div className="co-page landing-dark" dir="rtl">
      {/* Background */}
      <div className="co-bg-glow" aria-hidden="true" />
      <div className="co-bg-grid" aria-hidden="true" />

      {/* Top bar */}
      <header className="co-topbar">
        <div className="co-topbar-inner">
          <Link href="/" className="co-logo">
            <div className="co-logo-icon">
              <Store className="size-4" />
            </div>
            <span>نظام المحل</span>
          </Link>
          <Link href="/" className="co-back">
            <ArrowLeft className="size-4" />
            <span>العودة للرئيسية</span>
          </Link>
        </div>
      </header>

      <main className="co-container ab-content">
        {/* ════════════ Hero ════════════ */}
        <section className="ab-hero">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="ab-hero-inner"
          >
            <span className="lp-eyebrow ab-hero-eyebrow">
              <Sparkles className="size-3" />
              من نحن
            </span>
            <h1 className="ab-hero-title">
              بَنينا <span className="lg-grad-text">نظام المحل</span>
              <br />
              عشان نحل مشكلة المحلات العربية
            </h1>
            <p className="ab-hero-subtitle">
              منصة سحابية متكاملة لإدارة محلات الموبايل والكمبيوتر، والملابس والأحذية —
              نقطة بيع، مخزون، صيانة، ومعاملات مالية في مكان واحد. صُممت بأيد عربية،
              للسوق العربي، بأسعار بعملتك المحلية.
            </p>
            <div className="ab-hero-cta">
              <Link href="/pricing" className="ab-btn-primary">
                <Sparkles className="size-4" />
                ابدأ تجربتك المجانية
              </Link>
              <Link href="/" className="ab-btn-secondary">
                <ArrowLeft className="size-4" />
                شاهد المزايا
              </Link>
            </div>
          </motion.div>

          {/* Floating stats */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="ab-stats-grid"
          >
            {STATS.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.label} className="ab-stat-card">
                  <div className="ab-stat-icon">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <p className="ab-stat-value">{s.value}</p>
                    <p className="ab-stat-label">{s.label}</p>
                  </div>
                </div>
              )
            })}
          </motion.div>
        </section>

        {/* ════════════ Mission ════════════ */}
        <section className="ab-section">
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Target className="size-3" />
              رسالتنا
            </span>
            <h2 className="ab-section-title">
              نمكّن كل محل عربي من <span className="lg-grad-text">التقنية</span> اللي تستاهلها
            </h2>
          </motion.div>

          <div className="ab-mission-grid">
            <motion.div {...fadeUp} className="ab-mission-card">
              <div className="ab-mission-icon ab-mission-icon-1">
                <Lightbulb className="size-6" />
              </div>
              <h3>المشكلة</h3>
              <p>
                أصحاب المحلات في الدول العربية بيعانوا من الدفاتر الورقية، صعوبة متابعة المخزون،
                ضياع معاملات محافظ إلكترونية، وعدم معرفة صافي الربح الحقيقي.
                الأنظمة الموجودة إما معقدة جداً أو غالية جداً أو مش متكيفة مع السوق العربي.
              </p>
            </motion.div>

            <motion.div {...fadeUp} transition={{ duration: 0.5, delay: 0.1 }} className="ab-mission-card ab-mission-card-accent">
              <div className="ab-mission-icon ab-mission-icon-2">
                <Sparkles className="size-6" />
              </div>
              <h3>الحل</h3>
              <p>
                بنينا نظام متكامل بسيط كفاية إن أي حد يستخدمه، قوي كفاية إنه يدير محل كامل.
                نقطة بيع، مخزون، صيانة، معاملات مالية، تقارير — كل ده في مكان واحد،
                بأسعار بعملتك المحلية، وبيشتغل حتى لو النت مقطوع.
              </p>
            </motion.div>

            <motion.div {...fadeUp} transition={{ duration: 0.5, delay: 0.2 }} className="ab-mission-card">
              <div className="ab-mission-icon ab-mission-icon-3">
                <Target className="size-6" />
              </div>
              <h3>الهدف</h3>
              <p>
                نساعد المحلات الصغيرة تكبر وتنافس، نوفر وقت أصحاب المحلات عشان يركزوا على
                بيعتهم بدل ما يغرقوا في ورق، ونعطيهم تقارير واضحة تخليهم ياخدوا قرارات
                بناءً على أرقام حقيقية مش تخمين.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ════════════ Features highlight ════════════ */}
        <section className="ab-section">
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Zap className="size-3" />
              مميزات تقنية
            </span>
            <h2 className="ab-section-title">
              تقنيات حديثة بـ <span className="lg-grad-text">بساطة عربية</span>
            </h2>
            <p className="ab-section-desc">
              بنينا النظام بأحدث التقنيات العالمية، وعدّلناها للسوق العربي —
              عشان تاخد تجربة احترافية بدون تعقيد.
            </p>
          </motion.div>

          <motion.div {...stagger} className="ab-features-grid">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <motion.div
                  key={f.title}
                  variants={{ initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 } }}
                  className="ab-feature-card"
                >
                  <div className="ab-feature-icon">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="ab-feature-title">{f.title}</h3>
                  <p className="ab-feature-desc">{f.desc}</p>
                </motion.div>
              )
            })}
          </motion.div>
        </section>

        {/* ════════════ Values ════════════ */}
        <section className="ab-section">
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Heart className="size-3" />
              قيمنا
            </span>
            <h2 className="ab-section-title">
              اللي <span className="lg-grad-text">بيميزنا</span>
            </h2>
          </motion.div>

          <motion.div {...stagger} className="ab-values-grid">
            {VALUES.map((v) => {
              const Icon = v.icon
              return (
                <motion.div
                  key={v.title}
                  variants={{ initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 } }}
                  className="ab-value-card"
                >
                  <div
                    className="ab-value-icon"
                    style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${v.color}`} />
                    <Icon className={`size-6 relative ${v.iconColor}`} />
                  </div>
                  <h3 className="ab-value-title">{v.title}</h3>
                  <p className="ab-value-desc">{v.desc}</p>
                </motion.div>
              )
            })}
          </motion.div>
        </section>

        {/* ════════════ Tech stack ════════════ */}
        <section className="ab-section">
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Code2 className="size-3" />
              التقنيات
            </span>
            <h2 className="ab-section-title">
              مبني على <span className="lg-grad-text">أسس قوية</span>
            </h2>
            <p className="ab-section-desc">
              استخدمنا أحدث التقنيات عشان نضمن سرعة، أمان، وموثوقية.
            </p>
          </motion.div>

          <motion.div {...stagger} className="ab-tech-grid">
            {TECH_STACK.map((t) => {
              const Icon = t.icon
              return (
                <motion.div
                  key={t.name}
                  variants={{ initial: { opacity: 0, scale: 0.95 }, whileInView: { opacity: 1, scale: 1 } }}
                  className="ab-tech-card"
                >
                  <div className="ab-tech-icon">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <p className="ab-tech-name">{t.name}</p>
                    <p className="ab-tech-desc">{t.desc}</p>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        </section>

        {/* ════════════ Made in Egypt ════════════ */}
        <motion.section {...fadeUp} className="ab-egypt-banner">
          <div className="ab-egypt-content">
            <div className="ab-egypt-flag">🌍</div>
            <h2 className="ab-egypt-title">صُنع للعالم العربي</h2>
            <p className="ab-egypt-desc">
              فريق عربي بنى النظام ده من الصفر — بنفهم السوق العربي، اللغة العربية،
              المعاملات المالية، والاحتياجات الحقيقية لأصحاب المحلات. مش نظام أجنبي مترجم،
              ده نظام عربي 100%.
            </p>
            <div className="ab-egypt-features">
              <span className="ab-egypt-chip">
                <CheckCircle2 className="size-3.5" />
                دعم بالعربي
              </span>
              <span className="ab-egypt-chip">
                <CheckCircle2 className="size-3.5" />
                أسعار بعملتك المحلية
              </span>
              <span className="ab-egypt-chip">
                <CheckCircle2 className="size-3.5" />
                Paymob معتمد
              </span>
              <span className="ab-egypt-chip">
                <CheckCircle2 className="size-3.5" />
                محافظ إلكترونية
              </span>
            </div>
          </div>
        </motion.section>

        {/* ════════════ CTA ════════════ */}
        <motion.section {...fadeUp} className="ab-cta">
          <div className="ab-cta-inner">
            <h2 className="ab-cta-title">
              جاهز تبدأ؟ <span className="lg-grad-text">تجربة 14 يوم مجانية</span>
            </h2>
            <p className="ab-cta-desc">
              بدون بطاقة ائتمان، بدون عقود، بدون التزام — ابدأ تجربتك وقرر بعدين.
            </p>
            <div className="ab-cta-buttons">
              <Link href="/pricing" className="ab-btn-primary ab-btn-lg">
                <Sparkles className="size-5" />
                ابدأ التجربة المجانية
              </Link>
              <a
                href="https://wa.me/201010328471"
                target="_blank"
                rel="noopener noreferrer"
                className="ab-btn-whatsapp"
              >
                <MessageCircleIcon />
                <span>تواصل معنا</span>
              </a>
            </div>
            <p className="ab-cta-footnote">
              أو رجوع لـ{' '}
              <Link href="/" className="ab-link">الصفحة الرئيسية</Link>
            </p>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  )
}

// Small inline WhatsApp icon (avoid extra imports)
function MessageCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.13c-.24.68-1.42 1.31-1.95 1.35-.5.04-1.13.21-3.7-.77-3.13-1.18-5.13-4.36-5.28-4.56-.15-.2-1.27-1.69-1.27-3.22 0-1.53.8-2.28 1.09-2.59.27-.31.6-.39.8-.39.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.59.83 2.04.9 2.18.07.15.12.32.02.51-.1.2-.15.32-.29.49-.15.18-.31.39-.44.53-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.34 1.46.29.15.46.13.63-.08.17-.2.73-.85.93-1.14.2-.29.4-.24.67-.15.27.1 1.72.81 2.01.96.3.15.5.22.57.34.07.13.07.74-.17 1.42z"/>
    </svg>
  )
}
