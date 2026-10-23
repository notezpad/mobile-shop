'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Store,
  ShieldCheck,
  Lock,
  Database,
  Eye,
  Share2,
  Trash2,
  Cookie,
  Mail,
  ArrowLeft,
  FileText,
  Scale,
  Calendar,
  KeyRound,
  Server,
  AlertCircle,
  CheckCircle2,
  Clock,
  UserCheck,
} from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { inline, numbered, isSubhead, subheadText } from '@/components/policy/policy-text'

/**
 * صفحة "سياسة الخصوصية" — Privacy Policy
 *
 * 🛡️ 2026-09-14: Premium dark glassmorphic design مطابق لباقي الصفحات.
 * محتوى قانوني احترافي يغطي:
 * - البيانات التي نجمعها
 * - كيفية استخدامها
 * - مشاركة البيانات
 * - ملفات تعريف الارتباط (Cookies)
 * - أمان البيانات
 * - حقوق المستخدم
 * - الاحتفاظ والحذف
 * - خصوصية الأطفال
 * - الروابط الخارجية
 * - التعديلات
 * - القانون الحاكم
 */

const SECTIONS = [
  {
    id: 'introduction',
    icon: ShieldCheck,
    title: '1. مقدمة',
    content: [
      'في "نظام المحل"، خصوصيتك وأمان بياناتك أولويتنا القصوى. توضح هذه السياسة كيف نجمع بياناتك، ونستخدمها، ونحميها، ونحذفها عند طلبك.',
      'باستخدامك للمنصة، فإنك توافق على ممارسات جمع البيانات واستخدامها كما هو موضح في هذه السياسة. إذا كنت لا توافق على أي جزء منها، يرجى عدم استخدام المنصة.',
      'هذه السياسة مكملة لـ "الشروط والأحكام" الخاصة بنا، وليست بديلة عنها. أي مصطلح غير معرّف هنا يحمل نفس المعنى الموضح في الشروط والأحكام.',
    ],
  },
  {
    id: 'data-collected',
    icon: Database,
    title: '2. البيانات التي نجمعها',
    content: [
      'نجمع نوعين رئيسيين من البيانات:',
      '',
      '**أ. البيانات التي تقدمها مباشرة:**',
      '• اسم المحل واسم المسؤول',
      '• البريد الإلكتروني ورقم الهاتف',
      '• كلمة المرور (مشفرة بـ bcrypt)',
      '• بيانات المنتجات (الاسم، الباركود، السعر، الكمية، إلخ)',
      '• بيانات العملاء (الاسم، الهاتف، الرصيد)',
      '• بيانات الموردين والفروع',
      '• المعاملات المالية (مبيعات، المعاملات المالية، تحويلات)',
      '• ملاحظات ومحتويات الرسائل التي ترسلها لنا',
      '',
      '**ب. البيانات التي نجمعها تلقائياً:**',
      '• عنوان IP ونوع المتصفح ونظام التشغيل',
      '• الصفحات التي تزورها ومدة الزيارة',
      '• توقيت عمليات تسجيل الدخول والخروج',
      '• بيانات الاستخدام العامة (لتحسين الخدمة)',
      '• ملفات تعريف الارتباط (Cookies) — انظر القسم 6',
    ],
  },
  {
    id: 'data-usage',
    icon: Eye,
    title: '3. كيفية استخدام بياناتك',
    content: [
      'نستخدم بياناتك للأغراض التالية فقط:',
      '',
      '• **تقديم الخدمة:** تشغيل المنصة، إنشاء حسابك، عرض بياناتك، وتنفيذ العمليات المطلوبة (مبيعات، مخزون، تقارير)',
      '• **إدارة الاشتراك:** معالجة المدفوعات، تجديد الاشتراكات، إرسال إشعارات الدفع',
      '• **الدعم الفني:** الرد على استفساراتك، حل المشاكل التقنية، تحسين تجربتك',
      '• **التحسينات:** تحليل استخدام المنصة لتطوير ميزات جديدة وتحسين الأداء',
      '• **الأمان:** كشف ومنع الاحتيال، حماية حسابك من الوصول غير الالدول العربيةح به',
      '• **الامتثال القانوني:** الالتزام بالقوانين المحلية والاستجابة للطلبات القانونية الرسمية',
      '',
      'لا نستخدم بياناتك لأي من الأغراض التالية:',
      '• بيع بياناتك لأي طرف ثالث',
      '• إرسال رسائل تسويقية دون موافقتك الصريحة',
      '• مشاركة بياناتك مع شركاء إعلانات',
      '• استخدام بياناتك لأبحاث لا علاقة لها بالخدمة',
    ],
  },
  {
    id: 'legal-basis',
    icon: Scale,
    title: '4. الأساس القانوني لمعالجة البيانات',
    content: [
      'نعالج بياناتك وفقاً للأسباب القانونية التالية:',
      '',
      '• **تنفيذ العقد:** معالجة بياناتك ضرورية لتقديم الخدمة المتفق عليها في اشتراكك',
      '• **الالتزامات القانونية:** قد نحتاج لمعالجة بعض البيانات للامتثال للقوانين العربية (مثل الفواتير الضريبية)',
      '• **المصالح المشروعة:** تحسين الخدمة، منع الاحتيال، ضمان أمان المنصة',
      '• **الموافقة:** نحصل على موافقتك الصريحة قبل معالجة بيانات لـ أغراض إضافية (مثل النشرات البريدية)',
      '',
      'يمكنك سحب موافقتك في أي وقت عبر التواصل معنا. سحب الموافقة لا يؤثر على المعالجة السابقة.',
    ],
  },
  {
    id: 'data-sharing',
    icon: Share2,
    title: '5. مشاركة البيانات مع الأطراف الثالثة',
    content: [
      'لا نبيع بياناتك. قد نشاركها فقط في الحالات التالية:',
      '',
      '**أ. مزودي الخدمات المعتمدين:**',
      '• **Supabase** — استضافة قاعدة البيانات (PostgreSQL) على خوادم آمنة',
      '• **Cloudflare Workers** — استضافة التطبيق على شبكة CDN عالمية',
      '• **Paymob** — معالجة المدفوعات (لا نخزن بيانات البطاقات)',
      '',
      'هؤلاء المزودون ملزمون باتفاقيات سرية صارمة ولا يستخدمون بياناتك لأي غرض آخر.',
      '',
      '**ب. الالتزامات القانونية:**',
      '• الرد على أوامر المحاكم العربية أو طلبات النيابة العامة',
      '• التعاون مع الجهات الرسمية في حالات الاشتباه بأنشطة غير قانونية',
      '• حماية حقوقنا القانونية أو ملكيتنا الفكرية',
      '',
      '**ج. عمليات الاندماج أو الاستحواذ:**',
      'في حال اندماجنا أو استحواذنا من قبل كيان آخر، قد يتم نقل البيانات كأصل تجاري، مع الالتزام بنفس مستوى الحماية.',
    ],
  },
  {
    id: 'cookies',
    icon: Cookie,
    title: '6. ملفات تعريف الارتباط (Cookies)',
    content: [
      'نستخدم ملفات تعريف الارتباط (Cookies) و Local Storage لتحسين تجربتك:',
      '',
      '**أ. الكوكيز الأساسية (ضرورية):**',
      '• جلسة تسجيل الدخول (session token) — لا غنى عنها لعمل المنصة',
      '• تفضيلات الواجهة (الوضع الليلي، اللغة) — تُحفظ محلياً',
      '• حماية CSRF — لمنع الهجمات الأمنية',
      '',
      '**ب. الكوكيز التحليلية (اختيارية):**',
      '• إحصائيات الاستخدام لتحسين الخدمة',
      '• لا نستخدم Google Analytics أو أي أدوات تتبع تابعة لأطراف ثالثة',
      '',
      '**ج. الكوكيز التسويقية:**',
      'لا نستخدم أي كوكيز تسويقية أو إعلانية. لا نشارك بياناتك مع Facebook Pixel أو Google Ads أو أي منصة إعلانات.',
      '',
      'يمكنك التحكم في الكوكيز من إعدادات متصفحك. حظر الكوكيز الأساسية قد يؤثر على عمل المنصة.',
    ],
  },
  {
    id: 'data-security',
    icon: Lock,
    title: '7. أمان البيانات',
    content: [
      'نتخذ تدابير أمنية صارمة لحماية بياناتك:',
      '',
      '**أ. التشفير:**',
      '• جميع الاتصالات مشفرة بـ SSL/TLS 256-bit',
      '• كلمات المرور مشفرة بـ bcrypt (لا يمكن فك تشفيرها)',
      '• بيانات حسالة مثل بيانات البطاقات الائتمانية لا تصلنا (تتم معالجتها مباشرة عبر Paymob)',
      '',
      '**ب. البنية التحتية:**',
      '• قاعدة البيانات مستضافة على Supabase مع حماية DDoS',
      '• Cloudflare Workers يوفر حماية WAF (Web Application Firewall)',
      '• نسخ احتياطي يومي تلقائي مع استبقاء 30 يوم',
      '',
      '**ج. الوصول:**',
      '• صلاحيات الوصول محدودة (Role-Based Access Control)',
      '• فقط الموظفون الالدول العربيةح لهم يمكنهم الوصول للبيانات (للدعم الفني)',
      '• تسجيل كامل لعمليات الوصول للمراجعة الأمنية',
      '',
      '**د. الاختبار والمراجعة:**',
      '• فحص أمني دوري للثغرات (Vulnerability Scanning)',
      '• مراجعة الكود قبل النشر (Code Review)',
      '',
      'على الرغم من جهودنا، لا يمكن ضمان أمان 100% على الإنترنت. في حالة حدوث اختراق، سنشعرك خلال 72 ساعة كحد أقصى وفقاً للقانون العربي.',
    ],
  },
  {
    id: 'data-retention',
    icon: Clock,
    title: '8. الاحتفاظ بالبيانات',
    content: [
      'نحتفظ ببياناتك للمدة اللازمة لتقديم الخدمة والامتثال للالتزامات القانونية:',
      '',
      '**أ. حسابات نشطة:**',
      '• جميع بياناتك محفوظة طوال فترة اشتراكك النشط',
      '• يتم تحديثها وتعديلها حسب استخدامك',
      '',
      '**ب. حسابات ملغاة:**',
      '• بعد طلب حذف الحساب، نحتفظ بالبيانات لمدة 30 يوماً (لحالة التراجع)',
      '• بعد انتهاء الـ 30 يوماً، يتم حذف جميع البيانات نهائياً',
      '• بعض السجلات المالية قد تُحتفظ لمدة 5 سنوات للامتثال الضريبي',
      '',
      '**ج. سجلات الأمان:**',
      '• سجلات الوصول والأنشطة الأمنية تُحتفظ لمدة سنة واحدة',
      '• سجلات الدفع تُحتفظ لمدة 7 سنوات للامتثال المالي',
      '',
      'بعد انتهاء فترة الاحتفاظ، يتم حذف البيانات نهائياً أو إخفاؤها (anonymization) بحيث لا يمكن ربطها بك.',
    ],
  },
  {
    id: 'user-rights',
    icon: UserCheck,
    title: '9. حقوقك',
    content: [
      'لك كامل الحقوق التالية على بياناتك:',
      '',
      '**أ. حق الوصول:**',
      'يمكنك طلب نسخة من جميع بياناتك المخزنة لدينا في أي وقت.',
      '',
      '**ب. حق التصحيح:**',
      'يمكنك تعديل بياناتك مباشرة من إعدادات الحساب، أو طلب تعديلها من الدعم الفني.',
      '',
      '**ج. حق الحذف:**',
      'يمكنك طلب حذف حسابك وجميع بياناتك في أي وقت. سيتم الحذف خلال 30 يوماً من الطلب.',
      '',
      '**د. حق تصدير البيانات:**',
      'يمكنك تصدير جميع بياناتك (المنتجات، العملاء، المبيعات) بصيغة Excel قبل حذف الحساب.',
      '',
      '**هـ. حق الاعتراض:**',
      'يمكنك الاعتراض على معالجة بياناتك لأغراض التسويق (لن نرسل لك أي رسائل تسويقية بدون موافقتك أصلاً).',
      '',
      '**و. حق تقييد المعالجة:**',
      'في حالات معينة، يمكنك طلب تقييد معالجة بياناتك (مثلاً أثناء النزاع على صحة البيانات).',
      '',
      'لممارسة أي من هذه الحقوق، تواصل معنا عبر واتساب أو البريد الإلكتروني. سنرد خلال 30 يوماً كحد أقصى.',
    ],
  },
  {
    id: 'children-privacy',
    icon: AlertCircle,
    title: '10. خصوصية الأطفال',
    content: [
      'المنصة موجهة لأصحاب الأعمال والبالغين. لا نقصد جمع بيانات من الأطفال تحت سن 18 عاماً.',
      'إذا اكتشفنا أننا جمعنا بيانات من طفل دون موافقة ولي الأمر، سنحذفها فوراً دون تأخير.',
      'إذا كنت ولي أمر واكتشفت أن طفلك قدم لنا بيانات، يرجى التواصل معنا فوراً لحذفها.',
      'هذه السياسة لا تنطبق على مواقع أو خدمات أخرى قد ترتبط بنا عبر روابط. نحن غير مسؤولين عن ممارسات الخصوصية الخاصة بأي طرف ثالث.',
    ],
  },
  {
    id: 'third-party-links',
    icon: Share2,
    title: '11. الروابط الخارجية',
    content: [
      'قد تحتوي المنصة على روابط لمواقع خارجية (مثل Paymob، Supabase، Cloudflare).',
      'نحن غير مسؤولين عن سياسات الخصوصية الخاصة بهذه المواقع. ننصحك بقراءة سياساتها قبل تقديم أي بيانات.',
      'عند الضغط على رابط خارجي، ستفتح في تبويب جديد. لا نشارك أي بيانات مع المواقع الخارجية دون موافقتك الصريحة.',
    ],
  },
  {
    id: 'international-transfers',
    icon: Server,
    title: '12. النقل الدولي للبيانات',
    content: [
      'بياناتك مخزنة على خوادم Supabase و Cloudflare، والتي قد تقع خارج الدول العربية.',
      'في حال نقل بياناتك خارج الدول العربية، نضمن:',
      '• تطبيق نفس مستوى الحماية الموضح في هذه السياسة',
      '• الالتزام باتفاقيات نقل البيانات الدولية (مثل Standard Contractual Clauses)',
      '• عدم مشاركة بياناتك مع حكومات أجنبية إلا بأمر قضائي عربي',
      '',
      'Supabase و Cloudflare معتمدان وفق معايير دولية (ISO 27001، SOC 2 Type II).',
    ],
  },
  {
    id: 'modifications',
    icon: RefreshCw,
    title: '13. التعديلات على السياسة',
    content: [
      'نحتفظ بالحق في تعديل سياسة الخصوصية في أي وقت. سنشعرك بأي تعديلات جوهرية عبر:',
      '• البريد الإلكتروني المسجل لدينا',
      '• إشعار بارز داخل المنصة',
      '• تحديث تاريخ "آخر تحديث" في أعلى هذه الصفحة',
      '',
      'التعديلات تسري بعد 30 يوماً من الإشعار. استمرارك في استخدام المنصة بعد ذلك يعتبر موافقة على السياسة المعدلة.',
      'إذا لم توافق على التعديلات، يمكنك إلغاء حسابك وحذف بياناتك قبل تاريخ سريانها.',
    ],
  },
  {
    id: 'contact',
    icon: Mail,
    title: '14. تواصل معنا',
    content: [
      'لأي استفسار حول سياسة الخصوصية أو بياناتك، تواصل معنا:',
      '',
      '• **واتساب:** 201010328471',
      '• **البريد الإلكتروني:** nezampos@gmail.com',
      '• **ساعات العمل:** السبت - الخميس من 9:00 صباحاً حتى 11:00 مساءً بتوقيت القاهرة',
      '• **الدعم الفني للطوارئ:** متاح 24/7',
      '',
      'سنتعامل مع جميع الاستفسارات المتعلقة بالخصوصية بجدية تامة ونرد خلال 30 يوماً كحد أقصى.',
    ],
  },
]

// Quick reference: what we DO and DON'T do with your data
const DO_DONT = [
  {
    type: 'do',
    title: 'ما نفعله ببياناتك',
    items: [
      'تخزينها بأمان على Supabase مع تشفير SSL 256-bit',
      'نسخ احتياطي يومي تلقائي مع استبقاء 30 يوم',
      'استخدامها فقط لتشغيل المنصة وتقديم الدعم',
      'السماح لك بتصديرها أو حذفها في أي وقت',
    ],
  },
  {
    type: 'dont',
    title: 'ما لا نفعله أبداً',
    items: [
      'بيع بياناتك لأي طرف ثالث',
      'مشاركتها مع شركاء إعلانات',
      'استخدام Facebook Pixel أو Google Ads',
      'إرسال رسائل تسويقية دون موافقتك',
    ],
  },
]

export default function PrivacyPage() {
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

      <main className="co-container pr-content">
        {/* ════════════ Hero ════════════ */}
        <section className="pr-hero">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="lp-eyebrow pr-hero-eyebrow">
              <ShieldCheck className="size-3" />
              سياسة الخصوصية
            </span>
            <h1 className="pr-hero-title">
              خصوصيتك <span className="lg-grad-text">أمانة</span> عندنا
            </h1>
            <p className="pr-hero-subtitle">
              نوضح لك بكل شفافية كيف نجمع بياناتك، ونستخدمها، ونحميها.
              بياناتك ملكك — تحكم فيها متى ما أردت.
            </p>

            {/* Meta cards */}
            <div className="pr-meta-grid">
              <div className="pr-meta-card">
                <Calendar className="size-4" />
                <div>
                  <p className="pr-meta-label">آخر تحديث</p>
                  <p className="pr-meta-value">14 سبتمبر 2026</p>
                </div>
              </div>
              <div className="pr-meta-card">
                <FileText className="size-4" />
                <div>
                  <p className="pr-meta-label">عدد الأقسام</p>
                  <p className="pr-meta-value">14 قسم</p>
                </div>
              </div>
              <div className="pr-meta-card">
                <Lock className="size-4" />
                <div>
                  <p className="pr-meta-label">التشفير</p>
                  <p className="pr-meta-value">SSL 256-bit</p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ════════════ Quick summary (Do / Don't) ════════════ */}
        <motion.section
          {...{
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true },
            transition: { duration: 0.5 },
          }}
          className="pr-summary"
        >
          <div className="pr-summary-grid">
            {DO_DONT.map((card) => (
              <div key={card.type} className={`pr-summary-card pr-summary-${card.type}`}>
                <div className="pr-summary-header">
                  {card.type === 'do' ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <AlertCircle className="size-5" />
                  )}
                  <h3>{card.title}</h3>
                </div>
                <ul>
                  {card.items.map((item, i) => (
                    <li key={i}>
                      <span className={`pr-summary-bullet pr-summary-bullet-${card.type}`}>
                        {card.type === 'do' ? '✓' : '✗'}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ════════════ Table of contents ════════════ */}
        <motion.section
          {...{
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true },
            transition: { duration: 0.5 },
          }}
          className="pr-toc"
        >
          <div className="pr-toc-header">
            <FileText className="size-4" />
            <h2>محتويات السياسة</h2>
          </div>
          <div className="pr-toc-grid">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <a key={s.id} href={`#${s.id}`} className="pr-toc-item">
                  <Icon className="size-4" />
                  <span>{s.title}</span>
                </a>
              )
            })}
          </div>
        </motion.section>

        {/* ════════════ Sections ════════════ */}
        <div className="pr-sections">
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
                className="pr-section"
              >
                <div className="pr-section-header">
                  <div className="pr-section-icon">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="pr-section-title">{numbered(section.title)}</h2>
                </div>
                <div className="pr-section-body">
                  {section.content.map((para, i) => {
                    if (para === '') return <div key={i} className="pr-spacer" />
                    if (isSubhead(para)) {
                      return <p key={i} className="pr-subhead">{numbered(subheadText(para))}</p>
                    }
                    if (para.startsWith('•')) {
                      return <p key={i} className="pr-bullet">{inline(para)}</p>
                    }
                    return <p key={i} className="pr-para">{inline(para)}</p>
                  })}
                </div>
              </motion.section>
            )
          })}
        </div>

        {/* ════════════ Contact banner ════════════ */}
        <motion.section
          {...{
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true },
            transition: { duration: 0.5 },
          }}
          className="pr-contact-banner"
        >
          <div className="pr-contact-icon">
            <KeyRound className="size-6" />
          </div>
          <div className="pr-contact-content">
            <h2 className="pr-contact-title">لديك سؤال عن بياناتك؟</h2>
            <p className="pr-contact-desc">
              لك كامل الحق في الوصول لبياناتك، تصحيحها، أو حذفها. تواصل معنا وسنرد خلال 30 يوماً.
            </p>
          </div>
          <a
            href="https://wa.me/201010328471"
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
          {...{
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true },
            transition: { duration: 0.5 },
          }}
          className="pr-cta"
        >
          <div className="pr-cta-grid">
            <Link href="/terms-and-conditions" className="pr-cta-card">
              <FileText className="size-5" />
              <div>
                <h3>الشروط والأحكام</h3>
                <p>الشروط الكاملة لاستخدام المنصة</p>
              </div>
              <ArrowLeft className="size-4 pr-cta-arrow" />
            </Link>
            <Link href="/contact-us" className="pr-cta-card">
              <Mail className="size-5" />
              <div>
                <h3>تواصل معنا</h3>
                <p>فريق الدعم جاهز لمساعدتك</p>
              </div>
              <ArrowLeft className="size-4 pr-cta-arrow" />
            </Link>
            <Link href="/about-us" className="pr-cta-card">
              <ShieldCheck className="size-5" />
              <div>
                <h3>من نحن</h3>
                <p>تعرّف على فريقنا ورسالتنا</p>
              </div>
              <ArrowLeft className="size-4 pr-cta-arrow" />
            </Link>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  )
}

// Quick refresh icon import (avoids duplicate)
function RefreshCw({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}
