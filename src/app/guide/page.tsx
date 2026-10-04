'use client'

/**
 * صفحة دليل الاستخدام (/guide) — عامة بدون تسجيل دخول
 * شرح المنهج كامل: إيه هو ERP ← الباقات الأربعة ← الميزات الذكية ← جولة صفحة-بصفحة بالصور ← أسئلة شائعة
 * التصميم: نفس نظام landing-dark بتاع صفحات الماركتينج (كلاسات co- و ab-) + طبقة gd- من guide.css
 */

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Store,
  ArrowLeft,
  Sparkles,
  Smartphone,
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
} from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { PLANS, COMPARE_ROWS, GEMS, TOUR_STEPS, FASHION_STORY, FAQ } from './guide-data'
import './guide.css'

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-70px' },
  transition: { duration: 0.5 },
}

const SECTIONS = [
  { href: '#erp', label: 'يعني إيه ERP؟' },
  { href: '#plans', label: 'الباقات الأربعة' },
  { href: '#gems', label: 'الميزات الذكية' },
  { href: '#tour', label: 'الجولة بالصور' },
  { href: '#fashion', label: 'ملابس وأحذية' },
  { href: '#faq', label: 'أسئلة شائعة' },
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      {cap ? <figcaption className="gd-shot-cap">{cap}</figcaption> : null}
    </figure>
  )
}

function PlanIconBubble({ icon }: { icon: 'phone' | 'shirt' }) {
  return (
    <div className="gd-plan-icon">
      {icon === 'phone' ? <Smartphone className="size-5" /> : <Shirt className="size-5" />}
    </div>
  )
}

export default function GuidePage() {
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
        {/* ═══════════ Hero ═══════════ */}
        <section className="gd-hero" style={{ marginTop: 24 }}>
          <span className="gd-hero-kicker">
            <Sparkles className="size-3.5" />
            دليل الاستخدام الكامل — مُحدَّث 2026
          </span>
          <h1 className="gd-hero-title">
            اعرف نظام المحل من <span className="lg-grad-text">أول شاشة لآخر إعداد</span>
            <br />
            — خطوة بخطوة وبالصور
          </h1>
          <p className="gd-hero-sub">
            الدليل ده كتبناه لصاحب المحل اللي مش خبير تقنية: هنشرح يعني إيه نظام ERP بكلام بسيط،
            نديك تختار الباقة اللي على قياس محلك من 4 باقات (موبايل وكمبيوتر / ملابس وأحذية — أساسية واحترافية)،
            وبعدين نمشي معاك جولة حقيقية بالصور من لوحة المعلومات لحد آخر صفحة إعدادات.
          </p>
          <div className="gd-hero-cta">
            <Link href="/signup" className="gd-btn-primary">
              <Sparkles className="size-4" />
              ابدأ تجربة 14 يوم مجاناً
            </Link>
            <a href="#plans" className="gd-btn-ghost">
              <CircleDollarSign className="size-4" />
              شوف الباقات الأول
            </a>
          </div>
        </section>

        {/* شريط الأقسام */}
        <nav className="gd-anchorbar" aria-label="أقسام الدليل">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} className="gd-anchor">
              {s.label}
            </a>
          ))}
        </nav>

        {/* ═══════════ يعني إيه ERP؟ ═══════════ */}
        <section id="erp" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Info className="size-3" />
              للمبتدئين تماماً
            </span>
            <h2 className="ab-section-title">
              يعني إيه <span className="lg-grad-text">نظام ERP</span>؟ وبيعمل إيه لمحلك؟
            </h2>
            <p className="ab-section-desc">
              خد نفسك — مش هنتكلم بمصطلحات. تخيل إن محلك عنده 4 دفاتر: دفتر مبيعات، شيت مخزون،
              دفتر خزنة، ودفتر عملاء. النظام بيدمج الأربعة في شاشة واحدة بتتكلم مع نفسها.
            </p>
          </motion.div>

          <div className="gd-erp-grid">
            <motion.div {...fadeUp} className="gd-erp-card">
              <div className="gd-erp-icon">
                <Lightbulb className="size-5" />
              </div>
              <h3>قبل النظام: الدفاتر</h3>
              <p>كل عملية بتتسجل في مكان، والحساب بيتعمل في مكان تاني، والنتيجة:</p>
              <div className="gd-erp-list">
                <span>
                  <Search className="dot size-3.5" /> تفضل ساعات بتعدّ مخزون يدوي
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
              <p>بتبيع قطعة واحدة من الكاشير؟ النظام فوراً بيعمل كل ده من غير ما تحس:</p>
              <div className="gd-erp-list">
                <span>
                  <CheckCircle2 className="dot size-4" /> نقص الكمية من المخزون
                </span>
                <span>
                  <CheckCircle2 className="dot size-4" /> زوّد رصيد الخزنة
                </span>
                <span>
                  <CheckCircle2 className="dot size-4" /> حدّث حساب العميل وسجل الفاتورة
                </span>
                <span>
                  <CheckCircle2 className="dot size-4" /> حدّث كل التقارير والأرباح
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
              <p>بتفتح لوحة المعلومات الصبح وتشوف في 10 ثواني:</p>
              <div className="gd-erp-list">
                <span>
                  <CircleDollarSign className="dot size-4" /> بايع كام النهاردة وربحك كام
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

        {/* ═══════════ الباقات الأربعة ═══════════ */}
        <section id="plans" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Crown className="size-3" />
              اختار اللي على قياس محلك
            </span>
            <h2 className="ab-section-title">
              4 باقات — <span className="lg-grad-text">مجالين × مستويين</span>
            </h2>
            <p className="ab-section-desc">
              النظام متخصص في مجالين: محلات الموبايل والكمبيوتر، ومحلات الملابس والأحذية.
              وكل مجال له مستويان: «أساسية» تبدأ بيها براحتك، و«احترافية» لما تكبر وتحتاج
              فروع أكتر ومستخدمين أكتر وميزات الجملة. كل الباقات بيها تجربة مجانية 14 يوم.
            </p>
          </motion.div>

          <div className="gd-plans-grid">
            {PLANS.map((p, i) => (
              <motion.div
                key={p.code}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className={`gd-plan${p.pro ? ' is-pro' : ''}`}
              >
                {p.pro ? <span className="gd-plan-badge">الأكثر مرونة</span> : null}
                <PlanIconBubble icon={p.icon} />
                <h3 className="gd-plan-name">{p.name}</h3>
                <p className="gd-plan-forwho">{p.forWho}</p>
                <div className="gd-plan-price">
                  <b>{p.priceMonthly}</b>
                  <span>جنيه / شهرياً</span>
                  <span className="yearly">أو {p.priceYearly.toLocaleString('ar-EG')} سنوياً</span>
                </div>
                <div className="gd-plan-features">
                  {p.features.map((f) => (
                    <span key={f}>
                      <CheckCircle2 className="check size-4" />
                      {f}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* جدول المقارنة */}
          <motion.div {...fadeUp} className="gd-table-wrap">
            <table className="gd-table">
              <thead>
                <tr>
                  <th>المقارنة</th>
                  <th>أساسية — موبايل وكمبيوتر</th>
                  <th>احترافية — موبايل وكمبيوتر</th>
                  <th>أساسية — ملابس وأحذية</th>
                  <th>احترافية — ملابس وأحذية</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((r) => (
                  <tr key={r.label} className={r.highlight ? 'is-highlight' : ''}>
                    <td>{r.label}</td>
                    {r.values.map((v, j) => (
                      <td key={j}>
                        {v === '✓' ? (
                          <CheckCircle2 className="yes size-4 inline" />
                        ) : v === '—' ? (
                          <span className="no">—</span>
                        ) : (
                          v
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </section>

        {/* ═══════════ الميزات الذكية ═══════════ */}
        <section id="gems" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <Wand2 className="size-3" />
              الكنوز اللي ناس كتير مش واخدة بالها بيها
            </span>
            <h2 className="ab-section-title">
              3 ميزات ذكية <span className="lg-grad-text">هتوفرلك ساعات كل أسبوع</span>
            </h2>
            <p className="ab-section-desc">
              دي الميزات اللي بتفرق النظام عن أي دفتر — جربها مرة وهتبقى مش عارف تشتغل من غيرها.
              كل ميزة مكتوب فوقها هي متاحة في أنهي باقة.
            </p>
          </motion.div>

          {GEMS.map((g) => (
            <motion.div key={g.id} {...fadeUp} className="gd-gem">
              <span className="gd-gem-badge">
                <Crown className="size-3.5" />
                {g.badge}
              </span>
              <h3 className="gd-gem-title">{g.title}</h3>
              {g.desc.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
              <div className="gd-gem-shots">
                {g.shots.map((s) => (
                  <Shot key={s.src} src={s.src} cap={s.cap} alt={s.cap} />
                ))}
              </div>
            </motion.div>
          ))}
        </section>

        {/* ═══════════ الجولة العملية ═══════════ */}
        <section id="tour" className="ab-section" style={{ scrollMarginTop: 90 }}>
          <motion.div {...fadeUp} className="ab-section-header">
            <span className="lp-eyebrow ab-section-eyebrow">
              <BookOpen className="size-3" />
              جولة حقيقية بالصور — من أول صفحة لآخر صفحة
            </span>
            <h2 className="ab-section-title">
              الجولة الكاملة: <span className="lg-grad-text">من لوحة المعلومات للإعدادات</span>
            </h2>
            <p className="ab-section-desc">
              كل الصور دي من نظام شغال فعلاً بمحل تجريبي فيه 46 منتج (موبايلات، لابتوبات، ملابس،
              أحذية) وعملاء وموردين وفواتير حقيقية. امشِ معاك الصفحة صفحة — ولو مستعجل،
              الصور لوحدها كفاية تفهم الشكل.
            </p>
          </motion.div>

          <div className="gd-steps">
            {TOUR_STEPS.map((step, i) => (
              <motion.div key={step.id} {...fadeUp} className="gd-step">
                <div className="gd-step-num">{i + 1}</div>
                <div>
                  <h3 className="gd-step-title">{step.title}</h3>
                  {step.desc.map((d, j) => (
                    <p key={j}>{d}</p>
                  ))}
                  {(step.img || step.img2) && (
                    <div className="gd-step-shots">
                      {step.img ? <Shot src={step.img} cap={step.cap} alt={step.cap ?? step.title} /> : null}
                      {step.img2 ? <Shot src={step.img2} cap={step.cap2} alt={step.cap2 ?? step.title} /> : null}
                    </div>
                  )}
                  {step.tip ? (
                    <div className="gd-tip">
                      <Lightbulb className="size-4" />
                      <span>
                        <b>خد بالك:</b> {step.tip}
                      </span>
                    </div>
                  ) : null}
                </div>
              </motion.div>
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

          {FASHION_STORY.intro.map((d, i) => (
            <motion.p
              key={i}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              style={{
                marginTop: i === 0 ? 18 : 8,
                maxWidth: 860,
                fontSize: 14.2,
                lineHeight: 2.05,
                color: 'rgba(203,213,225,0.82)',
              }}
            >
              {d}
            </motion.p>
          ))}

          <div className="gd-fashion-shots">
            {FASHION_STORY.shots.map((s) => (
              <Shot key={s.src} src={s.src} cap={s.cap} alt={s.cap} />
            ))}
          </div>
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
