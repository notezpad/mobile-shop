'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Store,
  Cookie,
  ShieldCheck,
  Settings,
  Trash2,
  Mail,
  ArrowLeft,
  FileText,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Eye,
  Ban,
  ExternalLink,
} from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'

/**
 * صفحة "سياسة الكوكيز" — Cookie Policy
 *
 * 🛡️ 2026-09-14: Premium dark glassmorphic design مطابق لباقي الصفحات.
 * محتوى يوضح بكل شفافية:
 * - إيه هي الكوكيز
 * - إيه الكوكيز اللي بنستخدمها (أساسية / تحليلية)
 * - الكوكيز اللي مبنستخدمهاش (تسويقية / تابعة لطرف ثالث)
 * - كيفية التحكم فيها من المتصفح
 * - روابط لإعدادات المتصفحات المشهورة
 */

const WHATSAPP_NUMBER = '201010328471'

// ─── Cookie categories ──────────────────────────────────
const COOKIE_TYPES = [
  {
    type: 'essential',
    icon: ShieldCheck,
    title: 'كوكيز أساسية (ضرورية)',
    color: 'green',
    desc: 'لا غنى عنها لتشغيل المنصة. بدونها ما تقدرش تسجل دخول أو تستخدم أي ميزة.',
    examples: [
      { name: 'shop_session', purpose: 'حفظ جلسة تسجيل الدخول', duration: '7 أيام' },
      { name: 'csrf_token', purpose: 'حماية من هجمات CSRF', duration: 'جلسة واحدة' },
      { name: 'theme', purpose: 'تذكر الوضع الليلي/النهاري', duration: 'سنة' },
      { name: 'lang', purpose: 'تذكر لغة العرض', duration: 'سنة' },
    ],
    canDisable: false,
  },
  {
    type: 'analytical',
    icon: Eye,
    title: 'كوكيز تحليلية (اختيارية)',
    color: 'green',
    desc: 'تساعدنا نفهم كيفية استخدام المنصة لنحسنها. لا تتبع هويتك الشخصية.',
    examples: [
      { name: 'last_visit', purpose: 'تاريخ آخر زيارة لعرض التحديثات الجديدة', duration: '30 يوم' },
      { name: 'feature_flags', purpose: 'تفعيل تدريجي للميزات الجديدة', duration: '14 يوم' },
    ],
    canDisable: true,
  },
  {
    type: 'marketing',
    icon: Ban,
    title: 'كوكيز تسويقية (لا نستخدمها)',
    color: 'red',
    desc: 'لا نستخدم أي كوكيز تسويقية أو إعلانية. لا نشارك بياناتك مع Facebook Pixel أو Google Ads.',
    examples: [],
    canDisable: true,
    notUsed: true,
  },
]

// ─── Sections ───────────────────────────────────────────
const SECTIONS = [
  {
    id: 'what-are-cookies',
    icon: Cookie,
    title: '1. إيه هي الكوكيز؟',
    content: [
      'الكوكيز (Cookies) هي ملفات نصية صغيرة جداً (بضعة كيلوبايت) بتتحفظ على جهازك لما تزور موقع على الإنترنت. بتساعد المواقع على "تذكّر" أنشطتك وتفضيلاتك بين الزيارات.',
      'المنصة بتستخدم نوعين من التخزين على جهازك:',
      '• **Cookies**: ملفات صغيرة بتتحفظ في المتصفح، ليها تاريخ انتهاء محدد',
      '• **Local Storage / IndexedDB**: مساحة تخزين أكبر بتفضل لحد ما تمسحها يدوياً، بنستخدمها لحفظ بيانات الـ offline (منتجاتك، مسودات الجرد، إلخ)',
      'الكل آمن — ما بتحتويش على فيروسات ولا بتنفذ كود على جهازك، هي بس بتحفظ بيانات نصية.',
    ],
  },
  {
    id: 'how-we-use',
    icon: Eye,
    title: '2. كيف نستخدم الكوكيز',
    content: [
      'نستخدم الكوكيز للأغراض التالية فقط:',
      '',
      '• **تشغيل المنصة:** حفظ جلسة تسجيل الدخول حتى لا تحتاج لتسجيل الدخول في كل مرة',
      '• **الأمان:** حماية من هجمات CSRF وهجمات إعادة التوجيه',
      '• **التفضيلات:** تذكر الوضع الليلي/النهاري، اللغة، وحجم الخط',
      '• **التحسينات:** فهم الميزات الأكثر استخداماً لتحسين التجربة',
      '• **العمل offline:** حفظ نسخة من بياناتك على جهازك (Local Storage) لتعمل المنصة بدون إنترنت',
      '',
      'لا نستخدم الكوكيز لأي من الأغراض التالية:',
      '• تتبعك عبر مواقع أخرى (cross-site tracking)',
      '• إعلانات مخصصة بناءً على اهتماماتك',
      '• بيع بياناتك لشركات إعلانات',
      '• تحليل سلوكك للتسويق',
    ],
  },
  {
    id: 'types-of-cookies',
    icon: Settings,
    title: '3. أنواع الكوكيز التي نستخدمها',
    content: [
      'نصنف الكوكيز اللي بنستخدمها لـ 3 أنواع — تفاصيل كل نوع في الجدول بالأسفل.',
      'مفيش أي كوكيز تسويقية أو إعلانية في المنصة. هذه من أهم التزاماتنا بالخصوصية.',
    ],
  },
  {
    id: 'third-party',
    icon: ExternalLink,
    title: '4. الكوكيز التابعة لأطراف ثالثة',
    content: [
      'بعض الكوكيز قد تُضعها خدمات خارجية نتعامل معها (لا نتحكم فيها مباشرة):',
      '',
      '**أ. Supabase** (قاعدة البيانات):',
      '• قد تضع كوكيز للمصادقة على خوادمها',
      '• لا تتبع نشاطك على المنصة',
      '',
      '**ب. Cloudflare** (شبكة التوزيع):',
      '• قد تضع كوكيز للحماية من DDoS والـ bots',
      '• `__cf_bm` — كوكيز أساسية للأمان، تنتهي خلال 30 دقيقة',
      '',
      '**ج. Paymob** (بوابة الدفع):',
      '• عند الدفع فقط، تضع كوكيز على موقعها (وليس على موقعنا)',
      '• تستخدم لمنع الاحتيال',
      '• لا نتحكم فيها — راجع سياسة الخصوصية الخاصة بـ Paymob',
      '',
      'هذه الخدمات ملزمة بسياسات خصوصية خاصة بها. نختار فقط خدمات موثوقة ومعتمدة دولياً.',
    ],
  },
  {
    id: 'manage-cookies',
    icon: Settings,
    title: '5. كيفية التحكم في الكوكيز',
    content: [
      'تقدر تتحكم في الكوكيز تماماً من إعدادات متصفحك. تقدر:',
      '',
      '• **عرض** كل الكوكيز المحفوظة',
      '• **حظر** كوكيز معينة أو كلها',
      '• **حذف** الكوكيز المحفوظة',
      '• **السماح** فقط لكوكيز معينة من مواقع محددة',
      '',
      '**تحذير:** حظر الكوكيز الأساسية قد يمنعك من تسجيل الدخول أو استخدام المنصة بشكل صحيح. ننصح بالسماح للكوكيز الأساسية دائماً.',
      '',
      'روابط لإعدادات الكوكيز في المتصفحات المشهورة:',
      '• [Google Chrome](https://support.google.com/chrome/answer/95647)',
      '• [Mozilla Firefox](https://support.mozilla.org/ar/kw/cookies-preferences-firefox)',
      '• [Safari](https://support.apple.com/ar-eg/guide/safari/sfri11471/mac)',
      '• [Microsoft Edge](https://support.microsoft.com/ar-eg/microsoft-edge/delete-cookies)',
    ],
  },
  {
    id: 'clearing-cookies',
    icon: Trash2,
    title: '6. حذف الكوكيز',
    content: [
      'عند حذف الكوكيز من متصفحك:',
      '',
      '• سيتم تسجيل خروجك من المنصة (تحتاج لتسجيل الدخول مرة أخرى)',
      '• سيتم نسيان تفضيلاتك (الوضع الليلي، اللغة، إلخ)',
      '• ستبقى بياناتك على السيرفر (المنتجات، المبيعات، العملاء) — لا تتأثر',
      '• قد تحتاج لإعادة تحميل البيانات لأول مرة بعد الدخول',
      '',
      'لحذف الكوكيز يدوياً في Chrome:',
      '1. اضغط على أيقونة القائمة (⋮) أعلى يمين المتصفح',
      '2. اختر "الإعدادات" → "الخصوصية والأمان"',
      '3. اضغط "ملفات تعريف الارتباط" → "عرض جميع ملفات تعريف الارتباط"',
      '4. ابحث عن "nizam-mahal" واحذفه',
      '',
      'أو استخدم الاختصار: `Ctrl + Shift + Delete` واختر "ملفات تعريف الارتباط".',
    ],
  },
  {
    id: 'changes',
    icon: RefreshCw,
    title: '7. التعديلات على السياسة',
    content: [
      'قد نحدّث سياسة الكوكيز من وقت لآخر. أي تعديلات جوهرية سنشعرك بها عبر:',
      '• إشعار بارز داخل المنصة عند تسجيل الدخول التالي',
      '• البريد الإلكتروني المسجل لدينا',
      '• تحديث تاريخ "آخر تحديث" في أعلى هذه الصفحة',
      '',
      'ننصحك بمراجعة هذه الصفحة دورياً. استمرارك في استخدام المنصة بعد التعديلات يعتبر موافقة على السياسة المعدلة.',
    ],
  },
  {
    id: 'contact',
    icon: Mail,
    title: '8. تواصل معنا',
    content: [
      'لأي استفسار حول سياسة الكوكيز أو كيفية التحكم في بياناتك:',
      '',
      '• **واتساب:** 201010328471',
      '• **البريد الإلكتروني:** nezampos@gmail.com',
      '• **ساعات العمل:** السبت - الخميس من 9:00 صباحاً حتى 11:00 مساءً',
      '• **الدعم الفني للطوارئ:** متاح 24/7',
    ],
  },
]

// Local RefreshCw to avoid duplicate import
function RefreshCw({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

export default function CookiesPage() {
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

      <main className="co-container ck-content">
        {/* ════════════ Hero ════════════ */}
        <section className="ck-hero">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="lp-eyebrow ck-hero-eyebrow">
              <Cookie className="size-3" />
              سياسة الكوكيز
            </span>
            <h1 className="ck-hero-title">
              شفافية كاملة حول <span className="lg-grad-text">الكوكيز</span>
            </h1>
            <p className="ck-hero-subtitle">
              نوضح لك بكل وضوح أنواع الكوكيز اللي بنستخدمها، اللي مبنستخدمهاش،
              وكيف تتحكم فيها تماماً من متصفحك.
            </p>

            {/* Meta cards */}
            <div className="ck-meta-grid">
              <div className="ck-meta-card">
                <Calendar className="size-4" />
                <div>
                  <p className="ck-meta-label">آخر تحديث</p>
                  <p className="ck-meta-value">14 سبتمبر 2026</p>
                </div>
              </div>
              <div className="ck-meta-card">
                <FileText className="size-4" />
                <div>
                  <p className="ck-meta-label">عدد الأقسام</p>
                  <p className="ck-meta-value">8 أقسام</p>
                </div>
              </div>
              <div className="ck-meta-card">
                <Ban className="size-4" />
                <div>
                  <p className="ck-meta-label">كوكيز تسويقية</p>
                  <p className="ck-meta-value">لا نستخدمها</p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ════════════ Quick summary ════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="ck-summary"
        >
          <div className="ck-summary-grid">
            <div className="ck-summary-card ck-summary-do">
              <div className="ck-summary-header">
                <CheckCircle2 className="size-5" />
                <h3>الكوكيز اللي بنستخدمها</h3>
              </div>
              <ul>
                <li><span className="ck-bullet-do">✓</span>كوكيز أساسية لتسجيل الدخول</li>
                <li><span className="ck-bullet-do">✓</span>كوكيز للأمان (CSRF protection)</li>
                <li><span className="ck-bullet-do">✓</span>كوكيز للتفضيلات (الوضع الليلي)</li>
                <li><span className="ck-bullet-do">✓</span>Local Storage للعمل offline</li>
              </ul>
            </div>
            <div className="ck-summary-card ck-summary-dont">
              <div className="ck-summary-header">
                <Ban className="size-5" />
                <h3>الكوكيز اللي مبنستخدمهاش</h3>
              </div>
              <ul>
                <li><span className="ck-bullet-dont">✗</span>كوكيز تسويقية أو إعلانية</li>
                <li><span className="ck-bullet-dont">✗</span>Facebook Pixel</li>
                <li><span className="ck-bullet-dont">✗</span>Google Ads / AdSense</li>
                <li><span className="ck-bullet-dont">✗</span>تتبع عبر المواقع (cross-site)</li>
              </ul>
            </div>
          </div>
        </motion.section>

        {/* ════════════ Cookie types table ════════════ */}
        <section className="ck-section">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="ck-section-header"
          >
            <span className="lp-eyebrow ck-section-eyebrow">
              <Settings className="size-3" />
              أنواع الكوكيز
            </span>
            <h2 className="ck-section-title">
              تفصيل <span className="lg-grad-text">كل نوع</span>
            </h2>
          </motion.div>

          <div className="ck-types-grid">
            {COOKIE_TYPES.map((cat, idx) => {
              const Icon = cat.icon
              return (
                <motion.div
                  key={cat.type}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.1 }}
                  className={`ck-type-card ck-type-${cat.color}`}
                >
                  <div className="ck-type-header">
                    <div className={`ck-type-icon ck-type-icon-${cat.color}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="ck-type-title-wrap">
                      <h3 className="ck-type-title">{cat.title}</h3>
                      {cat.notUsed && (
                        <span className="ck-type-badge ck-type-badge-red">غير مستخدم</span>
                      )}
                      {cat.canDisable && !cat.notUsed && (
                        <span className="ck-type-badge ck-type-badge-amber">اختياري</span>
                      )}
                      {!cat.canDisable && (
                        <span className="ck-type-badge ck-type-badge-green">ضروري</span>
                      )}
                    </div>
                  </div>
                  <p className="ck-type-desc">{cat.desc}</p>

                  {cat.examples.length > 0 && (
                    <div className="ck-type-examples">
                      <p className="ck-examples-title">الأمثلة:</p>
                      <div className="ck-examples-list">
                        {cat.examples.map((ex) => (
                          <div key={ex.name} className="ck-example-row">
                            <code className="ck-example-name" dir="ltr">{ex.name}</code>
                            <span className="ck-example-purpose">{ex.purpose}</span>
                            <span className="ck-example-duration" dir="ltr">{ex.duration}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* ════════════ Table of contents ════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="ck-toc"
        >
          <div className="ck-toc-header">
            <FileText className="size-4" />
            <h2>محتويات السياسة</h2>
          </div>
          <div className="ck-toc-grid">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <a key={s.id} href={`#${s.id}`} className="ck-toc-item">
                  <Icon className="size-4" />
                  <span>{s.title}</span>
                </a>
              )
            })}
          </div>
        </motion.section>

        {/* ════════════ Sections ════════════ */}
        <div className="ck-sections">
          {SECTIONS.map((section, idx) => {
            const Icon = section.icon
            return (
              <motion.section
                key={section.id}
                id={section.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: idx * 0.02 }}
                className="ck-section-card"
              >
                <div className="ck-section-card-header">
                  <div className="ck-section-card-icon">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="ck-section-card-title">{section.title}</h2>
                </div>
                <div className="ck-section-card-body">
                  {section.content.map((para, i) => {
                    if (para === '') return <div key={i} className="ck-spacer" />
                    if (para.startsWith('**')) {
                      const cleaned = para.replace(/\*\*/g, '')
                      return <p key={i} className="ck-subhead">{cleaned}</p>
                    }
                    if (para.startsWith('•')) {
                      // Check if it has a markdown link
                      const linkMatch = para.match(/\[([^\]]+)\]\(([^)]+)\)/)
                      if (linkMatch) {
                        const before = para.slice(0, linkMatch.index).replace(/^•\s*/, '')
                        const after = para.slice((linkMatch.index ?? 0) + linkMatch[0].length)
                        return (
                          <p key={i} className="ck-bullet">
                            {before}
                            <a href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="ck-link">
                              {linkMatch[1]}
                              <ExternalLink className="size-3" />
                            </a>
                            {after}
                          </p>
                        )
                      }
                      return <p key={i} className="ck-bullet">{para}</p>
                    }
                    return <p key={i} className="ck-para">{para}</p>
                  })}
                </div>
              </motion.section>
            )
          })}
        </div>

        {/* ════════════ Contact banner ════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="ck-contact-banner"
        >
          <div className="ck-contact-icon">
            <Cookie className="size-6" />
          </div>
          <div className="ck-contact-content">
            <h2 className="ck-contact-title">عندك سؤال عن الكوكيز؟</h2>
            <p className="ck-contact-desc">
              فريق الدعم جاهز يساعدك في أي استفسار حول كيفية التحكم في الكوكيز أو بياناتك.
            </p>
          </div>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ab-btn-whatsapp"
          >
            <Mail className="size-4" />
            <span>تواصل معنا</span>
          </a>
        </motion.section>

        {/* ════════════ Quick links CTA ════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="ck-cta"
        >
          <div className="ck-cta-grid">
            <Link href="/privacy-policy" className="ck-cta-card">
              <ShieldCheck className="size-5" />
              <div>
                <h3>سياسة الخصوصية</h3>
                <p>كل التفاصيل عن جمع وحماية بياناتك</p>
              </div>
              <ArrowLeft className="size-4 ck-cta-arrow" />
            </Link>
            <Link href="/terms-and-conditions" className="ck-cta-card">
              <FileText className="size-5" />
              <div>
                <h3>الشروط والأحكام</h3>
                <p>شروط استخدام المنصة</p>
              </div>
              <ArrowLeft className="size-4 ck-cta-arrow" />
            </Link>
            <Link href="/contact-us" className="ck-cta-card">
              <Mail className="size-5" />
              <div>
                <h3>تواصل معنا</h3>
                <p>فريق الدعم جاهز لمساعدتك</p>
              </div>
              <ArrowLeft className="size-4 ck-cta-arrow" />
            </Link>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  )
}
