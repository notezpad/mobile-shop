'use client'

import * as React from 'react'
import {
  Smartphone,
  Shirt,
  Wrench,
  Wallet,
  Layers,
  Boxes,
  Users,
  ShoppingBag,
  Percent,
  Truck,
} from 'lucide-react'

export type Vertical = 'electronics' | 'fashion'

interface VerticalCtx {
  vertical: Vertical
  setVertical: (v: Vertical) => void
}

const Ctx = React.createContext<VerticalCtx | null>(null)

export function VerticalProvider({ children }: { children: React.ReactNode }) {
  const [vertical, setVertical] = React.useState<Vertical>('electronics')
  const value = React.useMemo(() => ({ vertical, setVertical }), [vertical])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useVertical() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error('useVertical must be used within VerticalProvider')
  return ctx
}

/* ---------------------------------------------------------------
   Content per vertical — single source of truth for the landing
   page copy. Mirrors the real business logic in
   prisma/seed-plans.ts (businessType, enabledModules, capabilities).
--------------------------------------------------------------- */

export const VERTICAL_META: Record<
  Vertical,
  {
    label: string
    shortLabel: string
    icon: React.ElementType
    tagline: string
    heroTitle: React.ReactNode
    heroSubtitle: string
    heroBullets: string[]
    mockShopName: string
    mockStats: { label: string; value: string; icon: React.ElementType }[]
    mockTableTitle: string
    mockTableRows: { n: string; q: number; p: string }[]
    features: { icon: React.ElementType; title: string; desc: string; tag: string }[]
    personas: { title: string; problem: string; solution: string }[]
  }
> = {
  electronics: {
    label: 'محلات الموبايل والكمبيوتر',
    shortLabel: 'موبايل وكمبيوتر',
    icon: Smartphone,
    tagline: 'صيانة · نقطة بيع · فودافون كاش وفوري',
    heroTitle: (
      <>
        أدِر محل الموبايل والكمبيوتر
        <br />
        <span className="lg-grad-text">من مكان واحد</span>
      </>
    ),
    heroSubtitle:
      'نقطة بيع، مخزون، متابعة الصيانة أول بأول، وكل المعاملات المالية (فودافون كاش، فوري، إنستاباي) في نظام واحد مصمم لسوق مصر.',
    heroBullets: [
      'متابعة أجهزة الصيانة بحالتها لحظة بلحظة',
      'خزنة ومعاملات فودافون كاش وفوري بدون دفاتر',
      'نقطة بيع بالباركود وطباعة فاتورة فورية',
    ],
    mockShopName: 'محل الاتصالات',
    mockStats: [
      { label: 'مبيعات اليوم', value: '5,420', icon: Wallet },
      { label: 'أجهزة صيانة', value: '7', icon: Wrench },
      { label: 'المنتجات', value: '247', icon: Boxes },
      { label: 'العملاء', value: '156', icon: Users },
    ],
    mockTableTitle: 'أجهزة قيد الصيانة',
    mockTableRows: [
      { n: 'آيفون 13 - تغيير شاشة', q: 1, p: '650' },
      { n: 'سامسونج A54 - بطارية', q: 1, p: '280' },
      { n: 'لابتوب ديل - فورمات', q: 1, p: '150' },
    ],
    features: [
      {
        icon: Wrench,
        title: 'متابعة الصيانة',
        desc: 'سجّل كل جهاز بحالته (مستلم، قيد الفحص، جاهز للتسليم) وأرسل تحديث للعميل تلقائياً.',
        tag: 'صفر أجهزة ضائعة',
      },
      {
        icon: Wallet,
        title: 'الخزنة والمعاملات المالية',
        desc: 'فودافون كاش، فوري، إنستاباي — كل معاملة مسجّلة بعمولتها وصافي المكسب لحظياً.',
        tag: 'تسوية يومية تلقائية',
      },
      {
        icon: ShoppingBag,
        title: 'نقطة بيع بالباركود',
        desc: 'بيع سريع بالباركود أو البحث، فاتورة حرارية فورية، ودعم البيع النقدي والآجل.',
        tag: 'بيع في ثوانٍ',
      },
      {
        icon: Boxes,
        title: 'مخزون واكسسوارات',
        desc: 'تنبيهات قبل نفاد المخزون، تصنيفات غير محدودة، وتتبع دقيق لكل قطعة غيار.',
        tag: 'تحكم كامل',
      },
      {
        icon: Truck,
        title: 'بيع بالجملة والقطاعي',
        desc: 'وحدات بيع متعددة لتجار الجملة — قطاعة، كرتونة، دستة — بأسعار مختلفة لكل وحدة.',
        tag: 'باقة الاحترافية',
      },
      {
        icon: Percent,
        title: 'تقارير وأرباح لحظية',
        desc: 'اعرف أكتر منتج مبيعاً، هامش الربح الحقيقي بعد تكلفة الصيانة، وأداء كل فرع.',
        tag: 'تقارير فورية',
      },
    ],
    personas: [
      {
        title: 'صاحب محل موبايل وإكسسوارات',
        problem: 'مبيعات ودفاتر صيانة منفصلة، وصعوبة معرفة صافي الربح الحقيقي كل يوم.',
        solution: 'نقطة بيع وصيانة وخزنة في شاشة واحدة، مع تقرير ربح يومي دقيق.',
      },
      {
        title: 'فني الصيانة وصاحب الورشة',
        problem: 'أجهزة كتير بتدخل الورشة، وسهل تتلخبط الحالة أو ينسى العميل ميعاد الاستلام.',
        solution: 'حالة كل جهاز محدّثة لحظياً، وتنبيه تلقائي للعميل لما الجهاز يجهز.',
      },
      {
        title: 'تاجر جملة إكسسوارات',
        problem: 'بيع بالكرتونة والدستة لعملاء مختلفين، وصعوبة ضبط سعر الجملة عن القطاعي.',
        solution: 'وحدات بيع متعددة بسعر مختلف لكل وحدة، وفاتورة جملة منفصلة عن القطاعي.',
      },
      {
        title: 'سلسلة فروع موبايل',
        problem: 'أكتر من فرع، وصعب تقارن أداء كل فرع أو تدير المخزون بينهم.',
        solution: 'إدارة كل الفروع من حساب واحد، مع تقارير مقارنة وتحويل مخزون بين الفروع.',
      },
    ],
  },
  fashion: {
    label: 'محلات الملابس والأحذية',
    shortLabel: 'ملابس وأحذية',
    icon: Shirt,
    tagline: 'جملة ونصف جملة · كوليكشنات · مقاسات وألوان',
    heroTitle: (
      <>
        أدِر محل الملابس والأحذية
        <br />
        <span className="lg-grad-text">جملة وقطاعي</span>
      </>
    ),
    heroSubtitle:
      'نقطة بيع، مخزون بالمقاس واللون، وبيع بالجملة (دستة أو نص دستة) بسعر مختلف عن القطاعي — كل ده من نظام واحد.',
    heroBullets: [
      'بيع بالقطعة أو بالدستة ونص الدستة بسعر مختلف لكل وحدة',
      'تنظيم المنتجات في كوليكشنات مع خصم خاص لكل كوليكشن',
      'مخزون دقيق لكل مقاس ولون على حدة',
    ],
    mockShopName: 'بوتيك الأناقة',
    mockStats: [
      { label: 'مبيعات اليوم', value: '8,150', icon: Wallet },
      { label: 'طلبات جملة', value: '4', icon: Truck },
      { label: 'المنتجات', value: '412', icon: Boxes },
      { label: 'العملاء', value: '203', icon: Users },
    ],
    mockTableTitle: 'الكوليكشنات الأعلى مبيعاً',
    mockTableRows: [
      { n: 'كوليكشن الصيف - قمصان', q: 24, p: '3,600' },
      { n: 'أحذية رياضية - جملة', q: 12, p: '4,200' },
      { n: 'جواكت شتوي', q: 8, p: '2,800' },
    ],
    features: [
      {
        icon: Truck,
        title: 'بيع بالجملة ونص الجملة',
        desc: 'وحدات بيع مرنة — قطعة، نص دستة، دستة كاملة — بسعر مختلف تلقائياً لكل وحدة.',
        tag: 'باقة الاحترافية',
      },
      {
        icon: Layers,
        title: 'كوليكشنات وخصومات',
        desc: 'نظّم منتجاتك في كوليكشنات (صيفي، شتوي، مناسبات) وطبّق خصم موحّد على الكوليكشن كله.',
        tag: 'إدارة كوليكشن',
      },
      {
        icon: ShoppingBag,
        title: 'مقاسات وألوان',
        desc: 'كل منتج بمقاساته وألوانه كمتغيرات مستقلة، مع مخزون دقيق لكل متغير على حدة.',
        tag: 'دقة كاملة',
      },
      {
        icon: Boxes,
        title: 'مخزون وتنبيهات نفاد',
        desc: 'تنبيه فوري قبل نفاد أي مقاس أو لون، حتى لا تخسر بيعة بسبب نقص المخزون.',
        tag: 'صفر نواقص',
      },
      {
        icon: ShoppingBag,
        title: 'نقطة بيع سريعة',
        desc: 'بيع بالباركود أو البحث السريع، فاتورة فورية، ودعم الدفع النقدي والآجل.',
        tag: 'بيع في ثوانٍ',
      },
      {
        icon: Percent,
        title: 'تقارير مبيعات وأرباح',
        desc: 'اعرف أكتر موديل وأكتر مقاس مبيعاً، وهامش الربح الحقيقي لكل قطعة وكل كوليكشن.',
        tag: 'تقارير فورية',
      },
    ],
    personas: [
      {
        title: 'تاجر ملابس بالقطاعي',
        problem: 'مقاسات وألوان كتير لكل موديل، وصعب تعرف أي مقاس قرب يخلص.',
        solution: 'مخزون دقيق لكل مقاس ولون، مع تنبيه فوري قبل النفاد.',
      },
      {
        title: 'تاجر جملة ملابس وأحذية',
        problem: 'عملاء بيشتروا بالدستة أو نص الدستة بسعر مختلف عن القطاعي، وصعب تتابعهم يدوياً.',
        solution: 'وحدات بيع متعددة بسعر مختلف تلقائياً لكل وحدة — قطعة أو دستة أو نص دستة.',
      },
      {
        title: 'صاحب بوتيك وكوليكشنات موسمية',
        problem: 'كل موسم كوليكشن جديد، وصعب تطبّق خصم موحّد أو تتابع أداء كل كوليكشن لوحده.',
        solution: 'نظّم منتجاتك في كوليكشنات، وطبّق خصم أو عرض على الكوليكشن كله بضغطة.',
      },
      {
        title: 'محل أحذية متعدد الفروع',
        problem: 'مقاسات مختلفة موزّعة على فروع مختلفة، وصعب تعرف المقاس المطلوب موجود فين.',
        solution: 'إدارة المخزون والمقاسات عبر كل الفروع من مكان واحد، مع تحويل بينهم بسهولة.',
      },
    ],
  },
}

/* ---------------------------------------------------------------
   Real subscription plans — mirrors prisma/seed-plans.ts exactly.
   Used as the guaranteed-good fallback if the API is empty, and
   to filter/label the live API response by vertical.
--------------------------------------------------------------- */

export interface LandingPlan {
  code: string
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  maxUsers: number
  maxProducts: number
  maxBranches: number
  businessType: Vertical
  isPro: boolean
  features: string[]
}

export const FALLBACK_PLANS: LandingPlan[] = [
  {
    code: 'electronics-basic',
    name: 'أساسية',
    description: 'إدارة كاملة لمحل الموبايل والكمبيوتر',
    priceMonthly: 299,
    priceYearly: 2990,
    maxUsers: 3,
    maxProducts: 500,
    maxBranches: 1,
    businessType: 'electronics',
    isPro: false,
    features: [
      'نقطة بيع (POS) كاملة',
      'متابعة الصيانة أول بأول',
      'الخزنة وفودافون كاش وفوري',
      'مخزون وتنبيهات نفاد',
      'حتى 500 منتج و3 مستخدمين',
    ],
  },
  {
    code: 'electronics-pro',
    name: 'احترافية',
    description: 'كل مزايا الأساسية + تقارير متقدمة وبيع بالجملة',
    priceMonthly: 599,
    priceYearly: 5990,
    maxUsers: 10,
    maxProducts: 5000,
    maxBranches: 5,
    businessType: 'electronics',
    isPro: true,
    features: [
      'كل مزايا الباقة الأساسية',
      'بيع بالجملة (وحدات بيع متعددة)',
      'تقارير متقدمة وحتى 5 فروع',
      'حتى 5,000 منتج و10 مستخدمين',
      'دعم أولوية',
    ],
  },
  {
    code: 'fashion-basic',
    name: 'أساسية',
    description: 'إدارة محل الملابس والأحذية بالقطاعي',
    priceMonthly: 349,
    priceYearly: 3490,
    maxUsers: 3,
    maxProducts: 1000,
    maxBranches: 1,
    businessType: 'fashion',
    isPro: false,
    features: [
      'نقطة بيع (POS) كاملة',
      'مقاسات وألوان لكل منتج',
      'مخزون وتنبيهات نفاد',
      'الخزنة والمصروفات',
      'حتى 1,000 منتج و3 مستخدمين',
    ],
  },
  {
    code: 'fashion-pro',
    name: 'احترافية',
    description: 'كل مزايا الأساسية + كوليكشنات وبيع بالجملة',
    priceMonthly: 699,
    priceYearly: 6990,
    maxUsers: 10,
    maxProducts: 10000,
    maxBranches: 5,
    businessType: 'fashion',
    isPro: true,
    features: [
      'كل مزايا الباقة الأساسية',
      'كوليكشنات وخصم موحّد لكل كوليكشن',
      'بيع بالجملة (دستة / نص دستة)',
      'تقارير متقدمة وحتى 5 فروع',
      'حتى 10,000 منتج و10 مستخدمين',
    ],
  },
]
