'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Store,
  Sparkles,
  MessageCircle,
  Mail,
  Phone,
  Clock,
  Send,
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  Zap,
  ShieldCheck,
  Headset,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { LandingFooter } from '@/components/landing/LandingFooter'

/**
 * صفحة "تواصل معنا" — Contact Page
 *
 * 🛡️ 2026-09-14: Premium dark glassmorphic design مطابق للـ landing page + about page.
 * محتوى مخصص بناءً على المعلومات:
 * - التواصل: واتساب 201010328471
 * - النموذج: يجمع البيانات ويفتح واتساب برسالة جاهزة
 * - FAQ: أسئلة شائعة عن النظام
 * - ساعات العمل: من 9ص لـ 11م يومياً
 */

const WHATSAPP_NUMBER = '201010328471'

const CONTACT_METHODS = [
  {
    icon: MessageCircle,
    title: 'واتساب',
    value: '201010328471',
    desc: 'الأسرع للرد — خلال دقائق في ساعات العمل',
    href: `https://wa.me/${WHATSAPP_NUMBER}`,
    color: 'from-emerald-500/20 to-emerald-700/10',
    iconColor: 'text-emerald-300',
    badge: 'موصى به',
  },
  {
    icon: Mail,
    title: 'بريد إلكتروني',
    value: 'nezampos@gmail.com',
    desc: 'للاستفسارات التفصيلية والاقتراحات',
    href: 'mailto:nezampos@gmail.com',
    color: 'from-blue-500/20 to-blue-700/10',
    iconColor: 'text-blue-300',
  },
  {
    icon: Headset,
    title: 'الدعم الفني',
    value: 'دعم بالعربي 24/7',
    desc: 'فريق عربي بيفهم احتياجاتك',
    href: `https://wa.me/${WHATSAPP_NUMBER}`,
    color: 'from-purple-500/20 to-purple-700/10',
    iconColor: 'text-purple-300',
  },
]

const FAQ_ITEMS = [
  {
    q: 'كيف أبدأ استخدام نظام المحل؟',
    a: 'سجّل حساب جديد من الصفحة الرئيسية، هتحصل على تجربة مجانية 14 يوم بكل المميزات. بدون بطاقة ائتمان وبدون التزام — بعد التجربة اختار الباقة اللي تناسبك.',
  },
  {
    q: 'هل النظام بيشتغل بدون إنترنت؟',
    a: 'نعم، النظام PWA متقدم بيشتغل offline بالكامل. تقدر تبيع وتعدّل المخزون وتمسح الباركود حتى لو النت مقطوع. لما النت يرجع، كل العمليات بتتزامن أوتوماتيك مع السيرفر.',
  },
  {
    q: 'إيه طرق الدفع المتاحة؟',
    a: 'بنقبل الدفع عبر Paymob — بطاقات Visa/Mastercard والمحافظ الإلكترونية. كل المعاملات بعملتك المحلية وآمنة بتشفير SSL 256-bit.',
  },
  {
    q: 'هل أقدر أغير باقتي في أي وقت؟',
    a: 'أه، تقدر ترقي أو تنزل باقتك في أي وقت من صفحة الأسعار. الفرق في السعر هيتحسب تلقائياً حسب المدة المتبقية.',
  },
  {
    q: 'بياناتي آمنة؟',
    a: 'بالتأكيد. بنستخدم Supabase (PostgreSQL) مع نسخ احتياطي يومي تلقائي. كل البيانات مشفرة بـ SSL 256-bit، وما بنبيعش بياناتك لأي طرف ثالث.',
  },
  {
    q: 'هل النظام يدعم أكثر من فرع؟',
    a: 'نعم، الباقات الاحترافية تدعم حتى 5 فروع. تقدر تدير المخزون والتحويلات والتقارير لكل فروعك من حساب واحد.',
  },
]

const WORK_HOURS = [
  { day: 'السبت - الخميس', hours: '9:00 ص - 11:00 م' },
  { day: 'الجمعة', hours: '2:00 م - 11:00 م' },
]

const RESPONSE_TIMES = [
  { icon: Zap, label: 'واتساب', value: 'خلال دقائق' },
  { icon: Mail, label: 'بريد إلكتروني', value: 'خلال 24 ساعة' },
  { icon: Headset, label: 'دعم فني', value: '24/7' },
]

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

export default function ContactPage() {
  const [form, setForm] = React.useState({
    name: '',
    phone: '',
    email: '',
    subject: 'استفسار عام',
    message: '',
  })
  const [sending, setSending] = React.useState(false)
  const [openFaq, setOpenFaq] = React.useState<number | null>(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      toast.error('الاسم مطلوب')
      return
    }
    if (!form.message.trim() || form.message.trim().length < 10) {
      toast.error('الرسالة قصيرة جداً (10 أحرف على الأقل)')
      return
    }

    setSending(true)

    // Build WhatsApp message
    const lines = [
      'مرحباً، عندي استفسار عن نظام المحل 👋',
      '',
      `👤 الاسم: ${form.name}`,
      form.phone ? `📞 الهاتف: ${form.phone}` : '',
      form.email ? `📧 البريد: ${form.email}` : '',
      `📝 الموضوع: ${form.subject}`,
      '',
      'الرسالة:',
      form.message,
    ].filter(Boolean)

    const message = encodeURIComponent(lines.join('\n'))
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`

    // Small delay to show loading state
    await new Promise((r) => setTimeout(r, 600))

    setSending(false)
    toast.success('جاري فتح واتساب...')

    // Open WhatsApp in new tab
    window.open(whatsappUrl, '_blank')
  }

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

      <main className="co-container ct-content">
        {/* ════════════ Hero ════════════ */}
        <section className="ct-hero">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="lp-eyebrow ct-hero-eyebrow">
              <MessageCircle className="size-3" />
              تواصل معنا
            </span>
            <h1 className="ct-hero-title">
              احنا <span className="lg-grad-text">هنسمعك</span>
              <br />
              ونساعدك في أي وقت
            </h1>
            <p className="ct-hero-subtitle">
              فريق عربي جاهز يساعدك في أي استفسار، مشكلة تقنية، أو اقتراح.
              تواصل معنا بالطريقة اللي تناسبك — الرد سريع وواضح.
            </p>
          </motion.div>

          {/* Response times */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="ct-response-grid"
          >
            {RESPONSE_TIMES.map((r) => {
              const Icon = r.icon
              return (
                <div key={r.label} className="ct-response-card">
                  <div className="ct-response-icon">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="ct-response-label">{r.label}</p>
                    <p className="ct-response-value">{r.value}</p>
                  </div>
                </div>
              )
            })}
          </motion.div>
        </section>

        {/* ════════════ Contact methods + Form ════════════ */}
        <section className="ct-section ct-contact-grid">
          {/* Contact methods (left) */}
          <motion.div {...fadeUp} className="ct-methods-col">
            <h2 className="ct-col-title">طرق التواصل</h2>
            <p className="ct-col-desc">اختر الطريقة اللي تناسبك — كلها بتوصلنا.</p>

            <div className="ct-methods-list">
              {CONTACT_METHODS.map((m, i) => {
                const Icon = m.icon
                return (
                  <motion.a
                    key={m.title}
                    href={m.href}
                    target={m.href.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    variants={{ initial: { opacity: 0, x: 20 }, whileInView: { opacity: 1, x: 0 } }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                    initial="initial"
                    whileInView="whileInView"
                    viewport={{ once: true }}
                    className="ct-method-card"
                  >
                    <div className={`ct-method-icon bg-gradient-to-br ${m.color}`}>
                      <Icon className={`size-5 ${m.iconColor}`} />
                    </div>
                    <div className="ct-method-content">
                      <div className="ct-method-title-row">
                        <h3 className="ct-method-title">{m.title}</h3>
                        {m.badge && <span className="ct-method-badge">{m.badge}</span>}
                      </div>
                      <p className="ct-method-value" dir="ltr">{m.value}</p>
                      <p className="ct-method-desc">{m.desc}</p>
                    </div>
                    <ArrowLeft className="ct-method-arrow size-4" />
                  </motion.a>
                )
              })}
            </div>

            {/* Work hours */}
            <div className="ct-hours-card">
              <div className="ct-hours-header">
                <Clock className="size-4" />
                <h3>ساعات العمل</h3>
              </div>
              <div className="ct-hours-list">
                {WORK_HOURS.map((w) => (
                  <div key={w.day} className="ct-hours-row">
                    <span className="ct-hours-day">{w.day}</span>
                    <span className="ct-hours-time" dir="ltr">{w.hours}</span>
                  </div>
                ))}
              </div>
              <div className="ct-hours-note">
                <ShieldCheck className="size-3.5" />
                <span>الدعم الفني متاح 24/7 للطوارئ</span>
              </div>
            </div>
          </motion.div>

          {/* Contact form (right) */}
          <motion.div {...fadeUp} transition={{ duration: 0.5, delay: 0.2 }} className="ct-form-col">
            <div className="ct-form-card">
              <div className="ct-form-header">
                <span className="lp-eyebrow ct-form-eyebrow">
                  <Send className="size-3" />
                  نموذج سريع
                </span>
                <h2 className="ct-form-title">ابعتلنا رسالة</h2>
                <p className="ct-form-desc">
                  املأ النموذج وهنفتح لك واتساب برسالة جاهزة — تقدر تعدلها وتبعتها في ثواني.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="ct-form">
                <div className="ct-form-row">
                  <div className="ct-field">
                    <Label htmlFor="ct-name" className="ct-field-label">
                      الاسم بالكامل <span className="ct-required">*</span>
                    </Label>
                    <Input
                      id="ct-name"
                      type="text"
                      placeholder="اكتب اسمك"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      className="ct-field-input"
                    />
                  </div>
                  <div className="ct-field">
                    <Label htmlFor="ct-phone" className="ct-field-label">
                      رقم الهاتف
                    </Label>
                    <Input
                      id="ct-phone"
                      type="tel"
                      placeholder="01X XXXX XXXX"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      dir="ltr"
                      className="ct-field-input"
                    />
                  </div>
                </div>

                <div className="ct-form-row">
                  <div className="ct-field">
                    <Label htmlFor="ct-email" className="ct-field-label">
                      البريد الإلكتروني
                    </Label>
                    <Input
                      id="ct-email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      dir="ltr"
                      className="ct-field-input"
                    />
                  </div>
                  <div className="ct-field">
                    <Label htmlFor="ct-subject" className="ct-field-label">
                      الموضوع
                    </Label>
                    <select
                      id="ct-subject"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="ct-field-select"
                    >
                      <option value="استفسار عام">استفسار عام</option>
                      <option value="استفسار عن الأسعار">استفسار عن الأسعار</option>
                      <option value="مشكلة تقنية">مشكلة تقنية</option>
                      <option value="اقتراح أو ملاحظة">اقتراح أو ملاحظة</option>
                      <option value="الشراكات">الشراكات</option>
                    </select>
                  </div>
                </div>

                <div className="ct-field">
                  <Label htmlFor="ct-message" className="ct-field-label">
                    الرسالة <span className="ct-required">*</span>
                  </Label>
                  <Textarea
                    id="ct-message"
                    placeholder="اكتب رسالتك هنا (10 أحرف على الأقل)..."
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    required
                    rows={5}
                    className="ct-field-textarea"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="ct-submit-btn"
                >
                  {sending ? (
                    <>
                      <span className="ct-spinner" />
                      جاري التجهيز...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="size-4" />
                      إرسال عبر واتساب
                    </>
                  )}
                </button>

                <p className="ct-form-footnote">
                  بالضغط على "إرسال" هتتحول لواتساب برسالة جاهزة — تقدر تعدلها قبل الإرسال.
                </p>
              </form>
            </div>
          </motion.div>
        </section>

        {/* ════════════ FAQ ════════════ */}
        <section className="ct-section">
          <motion.div {...fadeUp} className="ct-section-header">
            <span className="lp-eyebrow ct-section-eyebrow">
              <HelpCircle className="size-3" />
              الأسئلة الشائعة
            </span>
            <h2 className="ct-section-title">
              أسئلة <span className="lg-grad-text">متكررة</span>
            </h2>
            <p className="ct-section-desc">
              لو سؤالك مش هنا، تواصل معنا مباشرة وهنرد عليك في أسرع وقت.
            </p>
          </motion.div>

          <motion.div {...stagger} className="ct-faq-list">
            {FAQ_ITEMS.map((item, i) => {
              const isOpen = openFaq === i
              return (
                <motion.div
                  key={i}
                  variants={{ initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 } }}
                  className={`ct-faq-item ${isOpen ? 'ct-faq-item-open' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="ct-faq-question"
                  >
                    <span>{item.q}</span>
                    <ChevronDown className={`ct-faq-chevron size-4 ${isOpen ? 'ct-faq-chevron-open' : ''}`} />
                  </button>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      transition={{ duration: 0.25 }}
                      className="ct-faq-answer-wrap"
                    >
                      <p className="ct-faq-answer">{item.a}</p>
                    </motion.div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        </section>

        {/* ════════════ Quick CTA ════════════ */}
        <motion.section {...fadeUp} className="ct-cta">
          <div className="ct-cta-inner">
            <div className="ct-cta-icon">
              <Sparkles className="size-6" />
            </div>
            <h2 className="ct-cta-title">
              لسه مش متأكد؟ <span className="lg-grad-text">جرّب النظام بنفسك</span>
            </h2>
            <p className="ct-cta-desc">
              تجربة مجانية 14 يوم بكل المميزات — بدون بطاقة ائتمان، بدون التزام.
            </p>
            <div className="ct-cta-buttons">
              <Link href="/pricing" className="ab-btn-primary ab-btn-lg">
                <Sparkles className="size-5" />
                ابدأ التجربة المجانية
              </Link>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ab-btn-whatsapp"
              >
                <MessageCircle className="size-5" />
                <span>اسأل على واتساب</span>
              </a>
            </div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  )
}
