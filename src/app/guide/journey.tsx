'use client'

/**
 * journey.tsx — «رحلة يوم كامل في محل موبايلات» (v13)
 * للزائر القادم من الإعلانات: مش شرح شاشات، دي قصة: أنت بتعمل حركة واحدة → النظام بيحدّث الباقي.
 * بيستخدم كلاسات guide.css الموجودة + طبقة jr- الصغيرة في آخر الملف.
 */

import * as React from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck,
  ScanBarcode,
  Users,
  Wrench,
  Wallet,
  BarChart3,
  Zap,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  WifiOff,
  Layers,
  Calculator,
  MessageCircle,
  ClipboardCheck,
} from 'lucide-react'

type Stage = {
  id: string
  icon: React.ComponentType<{ className?: string }>
  tab: string
  you: string
  effects: string[]
  img: string
  cap: string
}

const STAGES: Stage[] = [
  {
    id: 'buy',
    icon: Truck,
    tab: '١. اشتريت من المورد',
    you: 'سجّلت أمر شراء: 20 جهاز + اخترت المورد + دفعت نص المبلغ.',
    effects: ['الـ 20 جهاز دخلوا المخزون فوراً', 'نص الفلوس خرج من الخزنة', 'الباقي اتسجل «عليك» في حساب المورد', 'آخر سعر تكلفة اتحدّث لكل صنف'],
    img: '/guide-assets/t-14c-purchase-auto-cart.webp',
    cap: 'أمر الشراء: كل صنف بتكلفته وكميته — والحفظ بيحرّك المخزون والخزنة والمورد مرة واحدة',
  },
  {
    id: 'sell',
    icon: ScanBarcode,
    tab: '٢. بعت في الكاشير',
    you: 'مسحت الباركود، اخترت الوحدة (قطعة / دستة) ودوست F9.',
    effects: ['المخزون نقص بالكمية الصح (الدستة = 12 قطعة)', 'الفلوس دخلت الخزنة', 'ربحك في الفاتورة اتحسب من التكلفة', 'الفاتورة اتطبعت حرارية 58/80mm'],
    img: '/guide-assets/t-02-pos-dose.webp',
    cap: 'الكاشير: سعر القطعة تلقائي + دستة بتخصم 12 قطعة مرة واحدة',
  },
  {
    id: 'credit',
    icon: Users,
    tab: '٣. بعت آجل لعميل',
    you: 'اخترت العميل وكتبت المدفوع، والباقي آجل بميعاد تحصيل.',
    effects: ['الباقي اتسجل «عليه» في كشف حسابه', 'التقرير بيوريك إجمالي ديون السوق', 'لما يسدد: الدفعة تتقيد في الخزنة باسمه'],
    img: '/guide-assets/t-11-customer-detail.webp',
    cap: 'كشف حساب العميل: فواتيره ودفعاته ورصيده الحالي',
  },
  {
    id: 'repair',
    icon: Wrench,
    tab: '٤. استلمت جهاز صيانة',
    you: 'كتبت اسم العميل والجهاز والعطل والتكلفة.',
    effects: ['الجهاز بيمشي في مراحل: استلام ← شغل ← جاهز ← تسليم', 'زر واتساب جاهز يبلّغ العميل برسالة فيها جهازه وتكلفته', 'إيراد الصيانة داخل الخزنة والتقارير لوحده'],
    img: '/guide-assets/t-19-maintenance.webp',
    cap: 'الورشة جوه نفس النظام — مش دفتر تاني',
  },
  {
    id: 'wallet',
    icon: Wallet,
    tab: '٥. حوّلت فلوس لعميل',
    you: 'سجّلت إيداع أو سحب (فودافون كاش / انستاباي / فوري).',
    effects: ['عمولتك اتحسبت بالنسبة اللي انت حددتها', 'الخزنة زادت أو نقصت حسب العملية', 'ربح المحافظ ظاهر منفصل في التقرير'],
    img: '/guide-assets/t-20-finance.webp',
    cap: 'مكتب المحافظ: عمولة كل عملية محسوبة لوحدها',
  },
  {
    id: 'report',
    icon: BarChart3,
    tab: '٦. آخر اليوم',
    you: 'فتحت التقارير. مفيش حاجة تعملها.',
    effects: ['مبيعات اليوم وصافي الربح بعد المصروفات', 'إيه اللي قرب يخلص من المخزون', 'مين عليه فلوس واتأخر', 'تقرير PDF بضغطة'],
    img: '/guide-assets/t-23-reports.webp',
    cap: 'محلل المحل: كلام عربي واضح بدل جداول معقدة',
  },
]

const EDGES = [
  { icon: Layers, t: 'الدُستة تلقائي', d: 'احفظ المنتج وتطلع لك ربع/نص/دستة/ونص دستة بأسعارها. بيع جملة وقطاعي من نفس الصنف.' },
  { icon: Calculator, t: 'سعر القطعة بيحسب نفسه', d: 'تكلفة + هامش % = سعر القطعة. غيّرت التكلفة؟ الأسعار تتحدث.' },
  { icon: Wrench, t: 'صيانة + واتساب', d: 'ورشة كاملة بمراحل وإشعار جاهز للعميل. مش بتلاقيها في كاشير عادي.' },
  { icon: Wallet, t: 'محافظ إلكترونية بعمولاتها', d: 'ربح خدمات الكاش محسوب لكل عملية، منفصل عن ربح البضاعة.' },
  { icon: ClipboardCheck, t: 'جرد بالباركود', d: 'ورقة جرد تقارن النظام بالعدّ الفعلي، والاعتماد يصلّح الفرق.' },
  { icon: WifiOff, t: 'شغال والنت قاطع', d: 'بيع واطبع، وكل حاجة بتتزامن لما النت يرجع.' },
]

export function Journey() {
  const [i, setI] = React.useState(0)
  const s = STAGES[i]
  const next = () => setI((v) => (v + 1) % STAGES.length)

  return (
    <>
      {/* ═══ رحلة الحركة الواحدة ═══ */}
      <section id="journey" className="ab-section" style={{ scrollMarginTop: 90 }}>
        <div className="ab-section-header">
          <span className="lp-eyebrow ab-section-eyebrow">
            <Zap className="size-3" />
            يوم كامل في محل موبايلات
          </span>
          <h2 className="ab-section-title">
            أنت بتعمل <span className="lg-grad-text">حركة واحدة</span> — والنظام بيحدّث الباقي
          </h2>
          <p className="ab-section-desc">
            دوس على أي مرحلة من يومك وشوف: إيه اللي عملته، وإيه اللي حصل لوحده في المخزون والخزنة والحسابات.
          </p>
        </div>

        <div className="gd-chipbar" role="tablist" aria-label="مراحل اليوم">
          {STAGES.map((st, idx) => (
            <button
              key={st.id}
              type="button"
              role="tab"
              aria-selected={idx === i}
              className={`gd-chip${idx === i ? ' is-active' : ''}${idx < i ? ' is-done' : ''}`}
              onClick={() => setI(idx)}
            >
              <st.icon className="size-3.5" />
              {st.tab}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="gd-panel jr-grid"
          >
            <div className="jr-text">
              <div className="jr-you">
                <span>أنت عملت</span>
                <p>{s.you}</p>
              </div>
              <div className="jr-auto">
                <span>
                  <Sparkles className="size-3.5" /> والنظام عمل لوحده
                </span>
                <ul>
                  {s.effects.map((e, k) => (
                    <motion.li
                      key={e}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 * (k + 1) }}
                    >
                      <CheckCircle2 className="size-4" />
                      {e}
                    </motion.li>
                  ))}
                </ul>
              </div>
              <button type="button" className="gd-nav-btn is-primary" onClick={next}>
                {i === STAGES.length - 1 ? 'ارجع من الأول' : 'المرحلة اللي بعدها'}
                <ArrowLeft className="size-4" />
              </button>
            </div>
            <figure className="gd-shot">
              <div className="gd-shot-bar" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>Nezam POS — نظام المحل</span>
              </div>
              { }
              <img src={s.img} alt={s.cap} decoding="async" />
              <figcaption className="gd-shot-cap">{s.cap}</figcaption>
            </figure>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* ═══ اللي بيميزنا ═══ */}
      <section id="edge" className="ab-section" style={{ scrollMarginTop: 90 }}>
        <div className="ab-section-header">
          <span className="lp-eyebrow ab-section-eyebrow">
            <Sparkles className="size-3" />
            مش كاشير عادي
          </span>
          <h2 className="ab-section-title">
            6 حاجات <span className="lg-grad-text">هتلاقيها عندنا</span> وصعب تلاقيها مع بعض
          </h2>
        </div>
        <div className="gd-erp-grid">
          {EDGES.map((e) => (
            <div key={e.t} className="gd-erp-card">
              <div className="gd-erp-icon">
                <e.icon className="size-5" />
              </div>
              <h3>{e.t}</h3>
              <p>{e.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ البضاعة: طريقتين ═══ */}
      <section id="stock" className="ab-section" style={{ scrollMarginTop: 90 }}>
        <div className="ab-section-header">
          <span className="lp-eyebrow ab-section-eyebrow">
            <Truck className="size-3" />
            أول يوم عندك بضاعة؟
          </span>
          <h2 className="ab-section-title">
            البضاعة بتدخل <span className="lg-grad-text">بطريقتين</span> حسب حالتها
          </h2>
        </div>
        <div className="gd-erp-grid">
          <div className="gd-erp-card">
            <h3>بضاعة موجودة عندك فعلاً</h3>
            <p>اكتب الكمية في خانة «رصيد افتتاحي» وأنت بتضيف المنتج. بتدخل المخزون من غير ما تتسجل كشراء، فالخزنة وحسابات الموردين ما بتتأثرش.</p>
          </div>
          <div className="gd-erp-card is-accent">
            <h3>بضاعة جديدة جاية من مورد</h3>
            <p>سيب الكمية صفر، وبعدين من «أمر شراء» دوس «ضيف الكل للسلة» واكتب التكلفة والمورد. هنا بتتحرك الخزنة وحساب المورد.</p>
          </div>
        </div>
      </section>

      <div className="jr-cta">
        <Link href="/signup" className="gd-btn-primary">
          <Sparkles className="size-4" />
          جرّب 14 يوم مجاناً
        </Link>
        <a href="https://wa.me/201010328471" target="_blank" rel="noopener noreferrer" className="gd-btn-ghost">
          <MessageCircle className="size-4" />
          اسأل عن محلك على واتساب
        </a>
      </div>
    </>
  )
}
