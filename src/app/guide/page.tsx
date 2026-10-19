'use client'

/**
 * صفحة دليل الاستخدام (/guide) — عامة بدون تسجيل دخول
 *
 * ═══ v12 (2026-10-07) — إعادة تصميم كاملة: من «كتاب طويل» إلى «تجربة تفاعلية» ═══
 * المشكلة: 15 خطوة × فقرات طويلة + جدول باقات تسويقي في سكرول واحد = قارئ بيتعب من أول دخول.
 * الحل (Progressive Disclosure):
 *   1) «ابدأ في 5 دقائق» — 4 بطاقات بتوديك جوه الجولة عند الخطوة المعنية.
 *   2) مشغّل جولة تفاعلي — شاشة واحدة قدامك + شريط تقدم + أسهم كيبورد + الشرح الطويل مطوي.
 *   3) الميزات الذكية — أكورديون: الصور ظاهرة والشرح ورا زر.
 *   4) الباقات اتنقلت لصفحة الأسعار — الدليل بقى عن الاستخدام بس.
 *   صفر فقدان محتوى: كل النصوص الأصلية لسه موجودة ورا «الشرح الكامل».
 *
 * التصميم: نفس نظام landing-dark (كلاسات co- و ab-) + طبقة gd- من guide.css
 */

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Store,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Shirt,
  CheckCircle2,
  CircleDollarSign,
  Lightbulb,
  Zap,
  Crown,
  Wand2,
  BookOpen,
  MessageCircle,
  Info,
  ChevronDown,
  Package,
  Calculator,
  Search,
  LogIn,
  PackagePlus,
  ScanBarcode,
  BarChart3,
  MousePointerClick,
  CirclePlay,
} from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { GEMS, TOUR_STEPS, FASHION_STORY, FAQ } from './guide-data'
import './guide.css'

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-70px' },
  transition: { duration: 0.5 },
}

const SECTIONS = [
  { href: '#start', label: 'ابدأ في 5 دقائق' },
  { href: '#tour', label: 'الجولة التفاعلية' },
  { href: '#gems', label: 'ميزات ذكية' },
  { href: '#fashion', label: 'ملابس وأحذية' },
  { href: '#faq', label: 'أسئلة شائعة' },
]

/** مسار البداية السريعة — كل بطاقة بتقفز للخطوة المعنية في الجولة */
const QUICK_START = [
  {
    icon: LogIn,
    title: 'سجّل دخول',
    line: 'بميل وباسورد محلك — وعلّم «تذكّرني» على جهازك الخاص.',
    step: 0,
  },
  {
    icon: PackagePlus,
    title: 'أضف أول منتج',
    line: 'الاسم وسعر البيع و«حفظ» — عشر ثواني وخلص التسجيل.',
    step: 4,
  },
  {
    icon: ScanBarcode,
    title: 'افتح الكاشير وبيع',
    line: 'باركود أو بحث، اختار الصنف وادفع — وخلاص اتباع.',
    step: 2,
  },
  {
    icon: BarChart3,
    title: 'تابع أرقامك',
    line: 'لوحة المعلومات والتقارير بيقولوك بايع كام وربحك كام.',
    step: 1,
  },
]

function Shot({ src, cap, alt }: { src: string; cap?: string; alt: string }) {
  return (
    <figure className="gd-shot">
      <div className="gd-shot-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>Nezam POS — نظام المحل</span>
      </div>
      { }
      <img src={src} alt={alt} loading="lazy" decoding="async" />
      {cap ? <figcaption className="gd-shot-cap">{cap}</figcaption> : null}
    </figure>
  )
}

/** عنوان قصير للـ chips والأزرار — بنقطع النص عند الشرطة الطويلة */
function shortTitle(title: string): string {
  return title.split('—')[0].trim()
}

function TourPlayer({
  current,
  setCurrent,
}: {
  current: number
  setCurrent: React.Dispatch<React.SetStateAction<number>>
}) {
  const total = TOUR_STEPS.length
  const s = TOUR_STEPS[current]
  const isFirst = current === 0
  const isLast = current === total - 1
  const panelRef = React.useRef<HTMLDivElement | null>(null)

  // لو رأس اللوحة طلع بره الشاشة بعد تغيير الخطوة، رجّعه قدام المستخدم
  React.useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 60 || r.top > window.innerHeight * 0.65) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [current])

  return (
    <div className="gd-player">
      {/* شريط صفحات النظام */}
      <div className="gd-chipbar" role="tablist" aria-label="صفحات النظام">
        {TOUR_STEPS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={i === current}
            className={`gd-chip${i === current ? ' is-active' : ''}${i < current ? ' is-done' : ''}`}
            onClick={() => setCurrent(i)}
          >
            <span className="gd-chip-num">{i + 1}</span>
            {shortTitle(t.title)}
          </button>
        ))}
      </div>

      {/* لوحة الخطوة الحالية */}
      <motion.div
        ref={panelRef}
        key={s.id}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="gd-panel"
        style={{ scrollMarginTop: 84 }}
      >
        <div className="gd-panel-head">
          <span className="gd-panel-num">{current + 1}</span>
          <div className="gd-panel-titles">
            <h3 className="gd-panel-title">{s.title}</h3>
            <p className="gd-panel-line">{s.line}</p>
          </div>
          <span className="gd-panel-count">
            {current + 1}
            <i>/</i>
            {total}
          </span>
        </div>

        <div className="gd-progress" aria-hidden="true">
          <i style={{ width: `${Math.round(((current + 1) / total) * 100)}%` }} />
        </div>

        {(s.img || s.img2) && (
          <div className={`gd-panel-shots${s.img2 ? ' is-two' : ''}`}>
            {s.img ? <Shot src={s.img} cap={s.cap} alt={s.cap ?? s.title} /> : null}
            {s.img2 ? <Shot src={s.img2} cap={s.cap2} alt={s.cap2 ?? s.title} /> : null}
          </div>
        )}

        {s.tip ? (
          <div className="gd-tip">
            <Lightbulb className="size-4" />
            <span>
              <b>خد بالك:</b> {s.tip}
            </span>
          </div>
        ) : null}

        {s.desc.length > 0 && (
          <details className="gd-details">
            <summary>
              <BookOpen className="size-4" />
              الشرح الكامل للشاشة دي
              <ChevronDown className="chev size-4" />
            </summary>
            <div className="gd-details-body">
              {s.desc.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </div>
          </details>
        )}

        <div className="gd-panel-nav">
          <button
            type="button"
            className="gd-nav-btn"
            onClick={() => setCurrent((v) => Math.max(0, v - 1))}
            disabled={isFirst}
          >
            <ArrowRight className="size-4" />
            السابق
          </button>

          <div className="gd-panel-dots" aria-hidden="true">
            {TOUR_STEPS.map((t, i) => (
              <i
                key={t.id}
                className={i === current ? 'on' : i < current ? 'done' : ''}
              />
            ))}
          </div>

          {isLast ? (
            <Link href="/signup" className="gd-nav-btn is-primary">
              <Sparkles className="size-4" />
              خلصت الجولة — سجّل محلك مجاناً
            </Link>
          ) : (
            <button
              type="button"
              className="gd-nav-btn is-primary"
              onClick={() => setCurrent((v) => Math.min(total - 1, v + 1))}
            >
              التالي: {shortTitle(TOUR_STEPS[current + 1].title)}
              <ArrowLeft className="size-4" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function GuidePage() {
  const [step, setStep] = React.useState(0)

  // أسهم الكيبورد: شمال = التالي، يمين = السابق (اتجاه القراءة RTL)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') setStep((v) => Math.min(v + 1, TOUR_STEPS.length - 1))
      else if (e.key === 'ArrowRight') setStep((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const jumpToStep = (i: number) => {
    setStep(i)
    requestAnimationFrame(() => {
      document.getElementById('tour')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="co-page landing-dark" dir="rtl">
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
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
              <BookOpen className="size-3.5" />
              دليل الاستخدام
            </span>
            <Link href="/" className="co-back">
              <ArrowLeft className="size-4" />
              <span>العودة للرئيسية</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="co-container" style={{ paddingBottom: 64 }}>
        {/* ═══════════ Hero — مختصر ═══════════ */}
        <section className="gd-hero" style={{ marginTop: 24 }}>
          <span className="gd-hero-kicker">
            <Sparkles className="size-3.5" />
            دليل الاستخدام — مُحدَّث 2026
          </span>
          <h1 className="gd-hero-title">
            تعلّم نظام المحل في <span className="lg-grad-text">5 دقائق</span>
            <br />— بالصور وخطوة بخطوة
          </h1>
          <p className="gd-hero-sub">
            مش هتقرا كتاب هنا. اضغط «التالي» وامشي في الجولة: كل شاشة قدامك بصورتها الحقيقية
            وسطر واحد بيقول بتعمل إيه — والتفاصيل كلها موجودة لما تحبها.
          </p>
          <div className="gd-hero-cta">
            <a href="#tour" className="gd-btn-primary">
              <CirclePlay className="size-4" />
              ابدأ الجولة دلوقتي
            </a>
            <Link href="/signup" className="gd-btn-ghost">
              <CircleDollarSign className="size-4" />
              عندي محل — جرّب 14 يوم مجاناً
            </Link>
          </div>
          <div className="gd-hero-stats">
            <span className="gd-stat">
              <BookOpen className="size-3.5" />
              {TOUR_STEPS.length} شاشة مشروحة
            </span>
            <span className="gd-stat">
              <Shirt className="size-3.5" />
              صوت ومحتوى للملابس والإلكترونيات
            </span>
            <span className="gd-stat">
              <Zap className="size-3.5" />
              4 خطوات لصوت أول فاتورة
            </span>
          </div>
        </section>

        {/* شريط الأقسام */}
        <nav className="gd-anchorbar" aria-label="أقسام الدليل">
          {SECTIONS.map((sec) => (
            <a key={sec.href} href={sec.href} className="gd-anchor">
              {sec.label}
            </a>
          ))}
        </nav>

        {/* ═══════════ ابدأ في 5 دقائق ═══════════ */}
        <section id="start" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Zap className="size-3" />
              للمستعجلين
            </span>
            <h2 className="ab-section-title">
              ابدأ في <span className="lg-grad-text">5 دقائق</span> — 4 خطوات بس
            </h2>
            <p className="ab-section-desc">
              دي كل اللي محتاجه عشان تشتغل من أول يوم: من صفحة الدخول لحد أول فاتورة
              وقراية أرقامك. دوس على أي خطوة وتنقلك لمكانها في الجولة.
            </p>
          </motion.div>

          <div className="gd-qs-grid">
            {QUICK_START.map((q, i) => (
              <motion.button
                key={q.title}
                type="button"
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="gd-qs-card"
                onClick={() => jumpToStep(q.step)}
              >
                <span className="gd-qs-num">{i + 1}</span>
                <span className="gd-qs-icon">
                  <q.icon className="size-5" />
                </span>
                <h3>{q.title}</h3>
                <p>{q.line}</p>
                <span className="gd-qs-link">
                  شوفها في الجولة
                  <MousePointerClick className="size-3.5" />
                </span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* ═══════════ الجولة التفاعلية ═══════════ */}
        <section id="tour" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <BookOpen className="size-3" />
              جولة بالصور — صفحة صفحة
            </span>
            <h2 className="ab-section-title">
              الجولة التفاعلية: <span className="lg-grad-text">{TOUR_STEPS.length} شاشة</span> بتشرح نفسها
            </h2>
            <p className="ab-section-desc">
              كل الصور من نظام شغال فعلاً بمحل تجريبي فيه 46 منتج وفواتير حقيقية. اضغط
              «التالي» أو استخدم أسهم الكيبورد ← → — والشرح الطويل موجود مطوي لمن يحب يقرأ.
            </p>
          </motion.div>

          <TourPlayer current={step} setCurrent={setStep} />
        </section>

        {/* ═══════════ الميزات الذكية — أكورديون ═══════════ */}
        <section id="gems" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Wand2 className="size-3" />
              كنوز بتوفرلك ساعات كل أسبوع
            </span>
            <h2 className="ab-section-title">
              3 ميزات ذكية <span className="lg-grad-text">هتفرق معاك من أول يوم</span>
            </h2>
            <p className="ab-section-desc">
              الصور قدامك على طول — ولو حبيت تفهم بالتفصيل، افتح «التفاصيل» تحت كل ميزة.
              وكل ميزة مكتوب فوقها متاحة في أنهي باقة.
            </p>
          </motion.div>

          <div className="gd-gemacc-list">
            {GEMS.map((g) => (
              <motion.details key={g.id} {...fadeUp} className="gd-gemacc">
                <summary>
                  <span className="gd-gem-badge">
                    <Crown className="size-3.5" />
                    {g.badge}
                  </span>
                  <span className="gd-gemacc-head">
                    <h3 className="gd-gem-title">{g.title}</h3>
                    <span className="gd-gem-line">{g.line}</span>
                  </span>
                  <ChevronDown className="chev size-5" />
                </summary>
                <div className="gd-gemacc-body">
                  {g.desc.map((d, i) => (
                    <p key={i}>{d}</p>
                  ))}
                </div>
                <div className="gd-gem-shots">
                  {g.shots.map((sh) => (
                    <Shot key={sh.src} src={sh.src} cap={sh.cap} alt={sh.cap} />
                  ))}
                </div>
              </motion.details>
            ))}
          </div>
        </section>

        {/* ═══════════ ملابس وأحذية ═══════════ */}
        <section id="fashion" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Shirt className="size-3" />
              محلك ملابس أو أحذية؟
            </span>
            <h2 className="ab-section-title">
              النظام بيتكلم <span className="lg-grad-text">لغة مقاسات وألوان</span>
            </h2>
          </motion.div>

          <div className="gd-points">
            {FASHION_STORY.points.map((pt, i) => (
              <motion.span
                key={i}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="gd-point"
              >
                <CheckCircle2 className="size-4" />
                {pt}
              </motion.span>
            ))}
          </div>

          <div className="gd-fashion-shots">
            {FASHION_STORY.shots.map((sh) => (
              <Shot key={sh.src} src={sh.src} cap={sh.cap} alt={sh.cap} />
            ))}
          </div>
        </section>

        {/* ═══════════ يعني إيه ERP؟ — مختصر بصري ═══════════ */}
        <section id="erp" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Info className="size-3" />
              لو عايز تفهم الفكرة من جوه
            </span>
            <h2 className="ab-section-title">
              يعني إيه <span className="lg-grad-text">نظام ERP</span>؟ ببساطة
            </h2>
          </motion.div>

          <div className="gd-erp-grid">
            <motion.div {...fadeUp} className="gd-erp-card">
              <div className="gd-erp-icon">
                <Lightbulb className="size-5" />
              </div>
              <h3>قبل النظام: الدفاتر</h3>
              <div className="gd-erp-list">
                <span>
                  <Search className="dot size-3.5" /> ساعات في عدّ المخزون يدوي
                </span>
                <span>
                  <Search className="dot size-3.5" /> ديون العملاء بتتلخبط وتضيع
                </span>
                <span>
                  <Search className="dot size-3.5" /> صافي ربحك محدش عارفه بالظبط
                </span>
              </div>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="gd-erp-card is-accent"
            >
              <div className="gd-erp-icon">
                <Zap className="size-5" />
              </div>
              <h3>مع نظام المحل: حركة واحدة</h3>
              <div className="gd-erp-list">
                <span>
                  <CheckCircle2 className="dot size-4" /> بتبيع قطعة من الكاشير
                </span>
                <span>
                  <CheckCircle2 className="dot size-4" /> المخزون والخزنة والعميل بيتحدثوا لوحدهم
                </span>
                <span>
                  <CheckCircle2 className="dot size-4" /> والتقارير بتتحدث في نفس اللحظة
                </span>
              </div>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.16 }}
              className="gd-erp-card"
            >
              <div className="gd-erp-icon">
                <Calculator className="size-5" />
              </div>
              <h3>النتيجة بعد شهر</h3>
              <div className="gd-erp-list">
                <span>
                  <CircleDollarSign className="dot size-4" /> بايع كام وربحك كام في 10 ثواني
                </span>
                <span>
                  <Package className="dot size-4" /> إيه اللي قرب يخلص من المخزون
                </span>
                <span>
                  <CircleDollarSign className="dot size-4" /> مين عليه فلوس واتأخر في السداد
                </span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════ الباقات — شريط يودي لصفحة الأسعار ═══════════ */}
        <section id="plans" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="gd-miniplan">
            <div className="gd-miniplan-text">
              <h2>محتار في الباقة المناسبة لمحلك؟</h2>
              <p>
                4 باقات لمجالين — موبايل وكمبيوتر وملابس وأحذية — وكلها بتجربة 14 يوم مجاناً
                بدون بطاقة ائتمان. المقارنة الكاملة بالأسعار والميزات مستنيةك في صفحة الأسعار.
              </p>
            </div>
            <Link href="/pricing" className="gd-btn-primary">
              <CircleDollarSign className="size-4" />
              شوف الباقات والأسعار
            </Link>
          </motion.div>
        </section>

        {/* ═══════════ الأسئلة الشائعة ═══════════ */}
        <section id="faq" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Info className="size-3" />
              الأسئلة اللي بتتكرر
            </span>
            <h2 className="ab-section-title">
              أسئلة <span className="lg-grad-text">شائعة</span>
            </h2>
          </motion.div>

          <div className="gd-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <ChevronDown className="chev size-4" />
                </summary>
                <div className="gd-faq-a">{f.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ═══════════ CTA ═══════════ */}
        <motion.section {...fadeUp} className="gd-cta">
          <h2>
            جاهز تجرب بنفسك؟ <span className="lg-grad-text">14 يوم مجاناً</span>
          </h2>
          <p>بدون بطاقة ائتمان وبدون التزام — افتح محلك، أضف منتجاتك، وابعت أول فاتورة النهاردة.</p>
          <div className="gd-cta-buttons">
            <Link href="/signup" className="gd-btn-primary">
              <Sparkles className="size-4" />
              أنشئ محلك مجاناً
            </Link>
            <a
              href="https://wa.me/201010328471"
              target="_blank"
              rel="noopener noreferrer"
              className="gd-btn-ghost"
            >
              <MessageCircle className="size-4" />
              اسأل الدعم على واتساب
            </a>
          </div>
          <p className="gd-cta-note">أو شوف الأسعار بالتفصيل من صفحة الأسعار — والتبديل بين الباقات متاح في أي وقت.</p>
        </motion.section>
      </main>

      <LandingFooter />
    </div>
  )
}
