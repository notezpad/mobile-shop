'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Store,
  RefreshCw,
  CreditCard,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Mail,
  ArrowLeft,
  FileText,
  Calendar,
  Wallet,
  Receipt,
  Building2,
  HelpCircle,
} from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { inline, numbered, isSubhead, subheadText } from '@/components/policy/policy-text'

/**
 * صفحة "سياسة الاسترجاع" — Refund Policy
 *
 * 🛡️ 2026-09-14: Premium dark glassmorphic design مطابق لباقي الصفحات.
 * مهمة جداً لأي SaaS بيقبل مدفوعات — خصوصاً مع Paymob والاشتراكات.
 * محتوى يغطي:
 * - حق الاسترجاع خلال 14 يوم
 * - أنواع الاشتراكات (شهري/سنوي) واسترجاع كل نوع
 * - حالات لا يوجد استرجاع
 * - كيفية طلب الاسترجاع
 * - المدة الزمنية للاسترجاع
 * - حدود المسؤولية
 */

const WHATSAPP_NUMBER = '201010328471'

// ─── Refund scenarios summary ──────────────────────────
const REFUND_SCENARIOS = [
  {
    icon: CheckCircle2,
    title: 'استرجاع كامل',
    desc: 'خلال 14 يوم من تاريخ الاشتراك',
    color: 'green',
  },
  {
    icon: RefreshCw,
    title: 'استرجاع نسبي',
    desc: 'اشتراك سنوي بعد 14 يوم — بنسبة الأشهر المتبقية',
    color: 'amber',
  },
  {
    icon: XCircle,
    title: 'لا يوجد استرجاع',
    desc: 'اشتراك شهري بعد 14 يوم أو مخالفة الشروط',
    color: 'red',
  },
]

// ─── Refund process timeline ───────────────────────────
const PROCESS_STEPS = [
  {
    step: 1,
    icon: Mail,
    title: 'تواصل معنا',
    desc: 'ابعتلنا طلب استرجاع عبر واتساب أو البريد الإلكتروني مع ذكر سبب الاسترجاع',
  },
  {
    step: 2,
    icon: FileText,
    title: 'مراجعة الطلب',
    desc: 'مراجعة طلبك خلال 1-2 يوم عمل والتأكد من مطابقتك لشروط الاسترجاع',
  },
  {
    step: 3,
    icon: ShieldCheck,
    title: 'تأكيد الاسترجاع',
    desc: 'بنرسلك تأكيد بقبول الطلب وتفاصيل المبلغ المسترجع',
  },
  {
    step: 4,
    icon: Wallet,
    title: 'استلام المبلغ',
    desc: 'المبلغ بيرجع على نفس وسيلة الدفع خلال 7-14 يوم عمل',
  },
]

// ─── Sections ───────────────────────────────────────────
const SECTIONS = [
  {
    id: 'introduction',
    icon: ShieldCheck,
    title: '1. مقدمة',
    content: [
      'في "نظام المحل" نحترم حقك في تجربة المنصة واتخاذ القرار المناسب لك. سياسة الاسترجاع دي توضح متى وكيف تقدر تسترجع أموالك بعد الاشتراك في إحدى باقاتنا.',
      'نؤمن إن رضا العملاء هو أساس نجاحنا. لو المنصة مش مناسبة ليك، تقدر تطلب استرجاع المبلغ وفقاً للشروط الموضحة في هذه السياسة.',
      'هذه السياسة تتوافق مع حقوق المستهلك العربي وتضمن لك تجربة آمنة عند الاشتراك معنا.',
    ],
  },
  {
    id: '14-day-guarantee',
    icon: CheckCircle2,
    title: '2. ضمان 14 يوم — استرجاع كامل',
    content: [
      'نقدم لك ضمان استرجاع كامل خلال 14 يوماً من تاريخ الاشتراك في أي من باقاتنا (الأساسية أو الاحترافية، الشهرية أو السنوية).',
      '',
      '**شروط الاسترجاع الكامل:**',
      '• أن يكون الطلب خلال 14 يوم من تاريخ نجاح عملية الدفع',
      '• أن يكون الحساب في وضع طبيعي (مش موقوف بسبب مخالفة الشروط)',
      '• أن لا يكون هناك استخدام احتيالي للمنصة',
      '• تقديم طلب الاسترجاع عبر القنوات الرسمية (واتساب أو بريد إلكتروني)',
      '',
      '**المبلغ المسترجع:**',
      '• 100% من قيمة الاشتراك المدفوع',
      '• بدون أي رسوم إدارية',
      '• يرجع على نفس وسيلة الدفع الأصلية (بطاقة/محافظ إلكترونية)',
    ],
  },
  {
    id: 'monthly-subscription',
    icon: Calendar,
    title: '3. اشتراك شهري — بعد 14 يوم',
    content: [
      'بعد انتهاء فترة الـ 14 يوماً للاسترجاع الكامل، الاشتراك الشهري يخضع للسياسة التالية:',
      '',
      '**الحالة 1: تجديد تلقائي**',
      '• لو تم تجديد الاشتراك تلقائياً وانت مش عاوزه، تقدر تطلب استرجاع خلال 7 أيام من تاريخ التجديد',
      '• بنرجّع 100% من قيمة التجديد',
      '• الاشتراك الشهري القديم يستمر حتى نهايته',
      '',
      '**الحالة 2: إلغاء في منتصف الشهر**',
      '• لو رغبت في إلغاء الاشتراك في منتصف الشهر المدفوع، لا يوجد استرجاع',
      '• الاشتراك يستمر ساري المفعول حتى نهاية الشهر المدفوع',
      '• لن يتم تجديده بعد ذلك',
      '',
      '**الحالة 3: مشكلة تقنية كبيرة**',
      '• لو واجهت مشكلة تقنية منعتك من استخدام المنصة لأكثر من 7 أيام متواصلة',
      '• نقدر نرجّع نسبة من الاشتراك تتناسب مع مدة الانقطاع',
      '• يجب الإبلاغ عن المشكلة كتابياً خلال 48 ساعة من حدوثها',
    ],
  },
  {
    id: 'yearly-subscription',
    icon: Receipt,
    title: '4. اشتراك سنوي — استرجاع نسبي',
    content: [
      'الاشتراك السنوي يوفر لك خصم 17% مقارنة بالشهري. لكن لو طلبت الاسترجاع بعد فترة الـ 14 يوماً، بنطبق سياسة الاسترجاع النسبي:',
      '',
      '**المعادلة:**',
      'المبلغ المسترجع = (قيمة الاشتراك السنوي - خصم 10% رسوم إدارية) × (الأشهر المتبقية / 12)',
      '',
      '**مثال تطبيقي:**',
      '• اشتركت في باقة سنوية بـ 2990 ',
      '• استخدمت 3 أشهر ثم طلبت استرجاع',
      '• المبلغ المسترجع = (2990 - 299) × (9/12) = 2691 × 0.75 = 2018.25 ',
      '',
      '**ملاحظات:**',
      '• الخصم 10% يغطي رسوم المعالجة والتكاليف الإدارية',
      '• الأشهر المتبقية تُحسب من تاريخ طلب الاسترجاع',
      '• الأشهر غير مكتملة (أقل من 15 يوم) لا تُحسب',
      '• الأشهر المكتملة (15 يوم أو أكثر) تُحسب كشهر كامل',
    ],
  },
  {
    id: 'no-refund-cases',
    icon: XCircle,
    title: '5. حالات لا يوجد فيها استرجاع',
    content: [
      'في الحالات التالية لا يتم استرجاع المبلغ:',
      '',
      '**أ. مخالفة الشروط والأحكام:**',
      '• استخدام المنصة لأنشطة غير قانونية',
      '• محاولة اختراق أو إساءة استخدام النظام',
      '• إعادة بيع أو تأجير الخدمة لأطراف ثالثة',
      '• نشر محتوى مسيء أو مخالف',
      '',
      '**ب. الاستخدام غير المشروع:**',
      '• إنشاء حسابات متعددة للاستفادة من التجربة المجانية أكثر من مرة',
      '• استخدام بيانات بطاقة ائتمان مسروقة',
      '• الاحتيال في عمليات الدفع',
      '',
      '**ج. التخلي عن الحساب:**',
      '• عدم استخدام الحساب لمدة تتجاوز 12 شهراً متواصلة',
      '• عدم التحديث من باقة قديمة لـ باقة جديدة بعد إشعارات متكررة',
      '',
      '**د. حالات أخرى:**',
      '• الاشتراك الشهري بعد فترة الـ 14 يوماً (إلا في حالة تجديد تلقائي غير مرغوب)',
      '• طلب الاسترجاع بعد انتهاء مدة الاشتراك',
      '• طلب استرجاع لأشتراكات سابقة (كل اشتراك يعتبر منفصل)',
    ],
  },
  {
    id: 'how-to-request',
    icon: Mail,
    title: '6. كيفية طلب الاسترجاع',
    content: [
      'لطلب استرجاع، اتبع الخطوات التالية:',
      '',
      '**1. تجهيز المعلومات المطلوبة:**',
      '• اسم المحل والبريد الإلكتروني المسجل',
      '• رقم الاشتراك (تجده في صفحة الإعدادات → الاشتراك)',
      '• تاريخ عملية الدفع',
      '• سبب طلب الاسترجاع',
      '',
      '**2. التواصل عبر إحدى القنوات:**',
      '• **واتساب:** 201010328471 (الأسرع)',
      '• **البريد الإلكتروني:** nezampos@gmail.com',
      '• يفضل إرفاق صورة من إيصال الدفع إن أمكن',
      '',
      '**3. الانتظار للمراجعة:**',
      '• سنراجع طلبك خلال 1-2 يوم عمل',
      '• قد نطلب معلومات إضافية لو لزم الأمر',
      '• هنرسلك تأكيد بقبول أو رفض الطلب مع التفاصيل',
      '',
      '**4. استلام المبلغ:**',
      '• في حالة القبول، المبلغ بيرجع على نفس وسيلة الدفع الأصلية',
      '• المدة المتوقعة: 7-14 يوم عمل',
      '• ستصل لك رسالة تأكيد من Paymob بعملية الاسترجاع',
    ],
  },
  {
    id: 'processing-time',
    icon: Clock,
    title: '7. المدة الزمنية للاسترجاع',
    content: [
      'مدة الاسترجاع تعتمد على وسيلة الدفع الأصلية:',
      '',
      '**أ. بطاقات Visa/Mastercard:**',
      '• مدة المعالجة: 3-7 أيام عمل',
      '• قد تستغرق البنوك العربية حتى 14 يوم لعرض المبلغ في حسابك',
      '• سيصل إشعار من بنكك عند استلام المبلغ',
      '',
      '**ب. المحافظ الإلكترونية (محافظ إلكترونية متعددة):**',
      '• مدة المعالجة: 1-3 أيام عمل',
      '• يظهر المبلغ فوراً في المحفظة بعد المعالجة',
      '',
      '**ج. تأخيرات محتملة:**',
      '• في حالات نادرة، قد يستغرق الاسترجاع حتى 30 يوم',
      '• لو لم تستلم المبلغ بعد 30 يوم، تواصل معنا فوراً',
      '• نتعامل مع تأخيرات الاسترجاع كأولوية قصوى',
      '',
      '**ملاحظة:** الاسترجاع يتم بعملتك المحلية بنفس قيمة الدفع الأصلي. لا نتدخل في رسوم البنوك أو المحافظ التي قد تخصمها من المبلغ.',
    ],
  },
  {
    id: 'limitations',
    icon: AlertCircle,
    title: '8. حدود سياسة الاسترجاع',
    content: [
      'هذه السياسة تخضع للحدود التالية:',
      '',
      '**أ. الحد الأقصى:**',
      '• لا يتم استرجاع أكثر من المبلغ الفعلي المدفوع',
      '• لا يتم تعويض عن الأرباح المفقودة أو الأضرار غير المباشرة',
      '• لا يتم تعويض عن الوقت المستثمر في إدخال البيانات',
      '',
      '**ب. عمليات الاسترجاع المتكررة:**',
      '• لو قمت بطلب استرجاع أكثر من مرة، نحتفظ بالحق في رفض أي اشتراك مستقبلي',
      '• نهدف لحماية المنصة من الاستخدام الاحتيالي للتجارب المجانية',
      '',
      '**ج. الاسترجاع الجزئي:**',
      '• لا يمكن طلب استرجاع جزئي للاشتراك (مثلاً، استرجاع نصف الاشتراك)',
      '• الاسترجاع either كامل (خلال 14 يوم) أو نسبي (سنوي بعد 14 يوم)',
      '',
      '**د. الضرائب والرسوم:**',
      '• ضريبة القيمة المضافة (لو مطبقة) يتم استرجاعها ضمن المبلغ',
      '• رسوم Paymob تتحملها "نظام المحل" ولا تخصم من المبلغ المسترجع',
    ],
  },
  {
    id: 'changes',
    icon: RefreshCw,
    title: '9. التعديلات على السياسة',
    content: [
      'نحتفظ بالحق في تعديل سياسة الاسترجاع من وقت لآخر. أي تعديلات:',
      '',
      '• تسري على الاشتراكات الجديدة فقط (ما عدا الحالات القانونية)',
      '• يتم إشعارك قبل 30 يوم من تاريخ سريانها',
      '• لا تؤثر على طلبات الاسترجاع المقدمة قبل تاريخ التعديل',
      '',
      'استمرارك في الاشتراك بعد تاريخ سريان التعديلات يعتبر موافقة على السياسة المعدلة.',
    ],
  },
  {
    id: 'contact',
    icon: Mail,
    title: '10. تواصل معنا',
    content: [
      'لطلب استرجاع أو لأي استفسار حول سياسة الاسترجاع:',
      '',
      '• **واتساب:** 201010328471',
      '• **البريد الإلكتروني:** nezampos@gmail.com',
      '• **ساعات العمل:** السبت - الخميس من 9:00 صباحاً حتى 11:00 مساءً',
      '• **الدعم الفني للطوارئ:** متاح 24/7',
      '',
      'فريقنا جاهز لمساعدتك في أي وقت — نرد على كل طلبات الاسترجاع خلال 1-2 يوم عمل.',
    ],
  },
]


export default function RefundPage() {
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

      <main className="co-container rf-content">
        {/* ════════════ Hero ════════════ */}
        <section className="rf-hero">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="lp-eyebrow rf-hero-eyebrow">
              <RefreshCw className="size-3" />
              سياسة الاسترجاع
            </span>
            <h1 className="rf-hero-title">
              أموالك <span className="lg-grad-text">آمنة</span> معنا
            </h1>
            <p className="rf-hero-subtitle">
              لو المنصة مش مناسبة ليك، تقدر تسترجع أموالك وفقاً لسياسة واضحة وعادلة.
              ضمان 14 يوم استرجاع كامل، واسترجاع نسبي للاشتراكات السنوية.
            </p>

            {/* Meta cards */}
            <div className="rf-meta-grid">
              <div className="rf-meta-card">
                <Calendar className="size-4" />
                <div>
                  <p className="rf-meta-label">آخر تحديث</p>
                  <p className="rf-meta-value">14 سبتمبر 2026</p>
                </div>
              </div>
              <div className="rf-meta-card">
                <CheckCircle2 className="size-4" />
                <div>
                  <p className="rf-meta-label">ضمان الاسترجاع</p>
                  <p className="rf-meta-value">14 يوم كامل</p>
                </div>
              </div>
              <div className="rf-meta-card">
                <Clock className="size-4" />
                <div>
                  <p className="rf-meta-label">مدة التنفيذ</p>
                  <p className="rf-meta-value">7-14 يوم عمل</p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ════════════ Refund scenarios summary ════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rf-scenarios"
        >
          <div className="rf-scenarios-grid">
            {REFUND_SCENARIOS.map((s, idx) => {
              const Icon = s.icon
              return (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.1 }}
                  className={`rf-scenario-card rf-scenario-${s.color}`}
                >
                  <div className={`rf-scenario-icon rf-scenario-icon-${s.color}`}>
                    <Icon className="size-6" />
                  </div>
                  <h3 className="rf-scenario-title">{s.title}</h3>
                  <p className="rf-scenario-desc">{s.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </motion.section>

        {/* ════════════ Refund process timeline ════════════ */}
        <section className="rf-section">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rf-section-header"
          >
            <span className="lp-eyebrow rf-section-eyebrow">
              <RefreshCw className="size-3" />
              عملية الاسترجاع
            </span>
            <h2 className="rf-section-title">
              4 خطوات <span className="lg-grad-text">بسيطة</span>
            </h2>
            <p className="rf-section-desc">من طلب الاسترجاع لحد استلام المبلغ.</p>
          </motion.div>

          <div className="rf-process-grid">
            {PROCESS_STEPS.map((step, idx) => {
              const Icon = step.icon
              return (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.1 }}
                  className="rf-process-card"
                >
                  <div className="rf-process-step-num">{step.step}</div>
                  <div className="rf-process-icon">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="rf-process-title">{step.title}</h3>
                  <p className="rf-process-desc">{step.desc}</p>
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
          className="rf-toc"
        >
          <div className="rf-toc-header">
            <FileText className="size-4" />
            <h2>محتويات السياسة</h2>
          </div>
          <div className="rf-toc-grid">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <a key={s.id} href={`#${s.id}`} className="rf-toc-item">
                  <Icon className="size-4" />
                  <span>{s.title}</span>
                </a>
              )
            })}
          </div>
        </motion.section>

        {/* ════════════ Sections ════════════ */}
        <div className="rf-sections">
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
                className="rf-section-card"
              >
                <div className="rf-section-card-header">
                  <div className="rf-section-card-icon">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="rf-section-card-title">{numbered(section.title)}</h2>
                </div>
                <div className="rf-section-card-body">
                  {section.content.map((para, i) => {
                    if (para === '') return <div key={i} className="rf-spacer" />
                    if (isSubhead(para)) {
                      return <p key={i} className="rf-subhead">{numbered(subheadText(para))}</p>
                    }
                    if (para.startsWith('•')) {
                      return <p key={i} className="rf-bullet">{inline(para)}</p>
                    }
                    return <p key={i} className="rf-para">{inline(para)}</p>
                  })}
                </div>
              </motion.section>
            )
          })}
        </div>

        {/* ════════════ Quick refund CTA ════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rf-cta-banner"
        >
          <div className="rf-cta-icon">
            <Wallet className="size-6" />
          </div>
          <div className="rf-cta-content">
            <h2 className="rf-cta-title">عندك طلب استرجاع؟</h2>
            <p className="rf-cta-desc">
              تواصل معنا الآن عبر واتساب وهنرد عليك خلال 1-2 يوم عمل. كل طلبات الاسترجاع بتتاخذ بجدية تامة.
            </p>
          </div>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ab-btn-whatsapp"
          >
            <Mail className="size-4" />
            <span>اطلب استرجاع</span>
          </a>
        </motion.section>

        {/* ════════════ Quick links CTA ════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rf-cta"
        >
          <div className="rf-cta-grid">
            <Link href="/terms-and-conditions" className="rf-cta-card">
              <FileText className="size-5" />
              <div>
                <h3>الشروط والأحكام</h3>
                <p>شروط استخدام المنصة الكاملة</p>
              </div>
              <ArrowLeft className="size-4 rf-cta-arrow" />
            </Link>
            <Link href="/pricing" className="rf-cta-card">
              <CreditCard className="size-5" />
              <div>
                <h3>الأسعار والباقات</h3>
                <p>ابدأ تجربتك المجانية 14 يوم</p>
              </div>
              <ArrowLeft className="size-4 rf-cta-arrow" />
            </Link>
            <Link href="/contact-us" className="rf-cta-card">
              <HelpCircle className="size-5" />
              <div>
                <h3>تواصل معنا</h3>
                <p>فريق الدعم جاهز لمساعدتك</p>
              </div>
              <ArrowLeft className="size-4 rf-cta-arrow" />
            </Link>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  )
}
