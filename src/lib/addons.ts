/**
 * 🧩 2026-11-04 (التحديث 25): الإضافات المدفوعة (Add-ons) — CLIENT-SAFE.
 *
 * الملف ده مصدر واحد لكتالوج الإضافات: المفاتيح، الأسماء، الوصف، الأسعار
 * الافتراضية، وقواعد التوفر. زي plan-constants.ts بالظبط — ممنوع يستورد
 * أي كود سيرفر (no db / no Prisma / no pg) عشان يشتغل في الـ client bundle.
 *
 * الفكرة التجارية:
 *   - الباقة الأساسية بتتباع بحدها (مستخدم واحد، فرع واحد، من غير HR).
 *   - بدل ما تجبر صاحب المحل على الترقية للاحترافية كلها، يقدر يشتري
 *     الإضافة اللي محتاجها بس بمقابل:
 *       hr            → الموارد البشرية (حضور وإجازات ورواتب) — للأساسية والغذائية.
 *       extra_branch  → فرع إضافي (يتراكم فوق حد الباقة).
 *       extra_users   → مستخدم إضافي (يتراكم فوق حد الباقة).
 *   - الإضافة ليها تاريخ انتهاء مستقل عن الاشتراك، بتتدفع وتتجدد من
 *     الإعدادات → «إضافات الباقة» بنفس بوابة Paymob.
 *
 * 🧩 2026-11-04 (التحديث 26): قرار تجاري — HR بقت متاحة للغذائية:
 *   - food-basic: تشتري إضافة HR بمقابل زي الأساسية بالظبط.
 *   - food-pro (مخفية): فيها HR مشمولة أصلاً — planIncludesHr() بترجع true
 *     فكارت الإعدادات يقول «مشمولة في باقتك» والشراء مرفوض (حماية من الشراء المكرر).
 *
 * الأسعار: الافتراضي هنا — والأدمن يقدر يعدّلهم من جدول PlatformSetting
 * (مفاتيح addonHrPriceMonthly ... انظر src/lib/addon-settings.ts) من غير deploy.
 */

// ─── مفاتيح الإضافات ───────────────────────────────────────────────
export const ADDON_KEYS = ['hr', 'extra_branch', 'extra_users'] as const

export type AddOnKey = (typeof ADDON_KEYS)[number]

export function isAddOnKey(v: unknown): v is AddOnKey {
  return typeof v === 'string' && (ADDON_KEYS as readonly string[]).includes(v)
}

export type AddOnDef = {
  key: AddOnKey
  /** الاسم القصير في الكروت والقوائم */
  name: string
  /** سطر وصف واحد */
  desc: string
  /** وحدة الكمية (للإضافات القابلة للتكميم) */
  unitLabel: string
  /** هل تُباع بكمية (فروع/مستخدمين) أم مرة واحدة (HR) */
  quantifiable: boolean
  /** أقصى كمية في عملية شراء واحدة */
  maxQuantity: number
  /** السعر الافتراضي — قابل للتجاوز من PlatformSetting */
  defaultPriceMonthly: number
  defaultPriceYearly: number
  /** مفاتيح تجاوز السعر في PlatformSetting */
  priceKeyMonthly: string
  priceKeyYearly: string
  /** نقاط تظهر في صفحة الدفع تحت «الإضافة تشمل» */
  bullets: string[]
}

export const ADDON_CATALOG: Record<AddOnKey, AddOnDef> = {
  hr: {
    key: 'hr',
    name: 'الموارد البشرية',
    desc: 'حضور وانصراف، إجازات، وكشف رواتب مع الدفعات المقدمة — لباقات الأساسية والغذائية.',
    unitLabel: 'إضافة',
    quantifiable: false,
    maxQuantity: 1,
    defaultPriceMonthly: 149,
    defaultPriceYearly: 1490,
    priceKeyMonthly: 'addonHrPriceMonthly',
    priceKeyYearly: 'addonHrPriceYearly',
    bullets: [
      'حضور وانصراف الموظفين (Kiosk + كلمة مرور)',
      'طلبات الإجازات والاعتماد',
      'كشف رواتب شهري + الدفعات المقدمة',
      'كل ميزات الموارد البشرية في الباقة الاحترافية',
    ],
  },
  extra_branch: {
    key: 'extra_branch',
    name: 'فرع إضافي',
    desc: 'زوّد عدد فروع باقتك بمتجر إضافي — بيتراكم فوق الحد الحالي.',
    unitLabel: 'فرع',
    quantifiable: true,
    maxQuantity: 10,
    defaultPriceMonthly: 99,
    defaultPriceYearly: 990,
    priceKeyMonthly: 'addonBranchPriceMonthly',
    priceKeyYearly: 'addonBranchPriceYearly',
    bullets: [
      'فرع كامل بمخزون ودرج خزنة وورديات مستقلة',
      'تحويلات مخزون بين الفروع',
      'تقارير الفروع وتصاريح المستخدمين عليه',
      'بيتراكم فوق حد فروع باقتك الحالية',
    ],
  },
  extra_users: {
    key: 'extra_users',
    name: 'مستخدم إضافي',
    desc: 'حسابات كاشير/موظفين زيادة على حد باقتك — بصلاحيات كاملة التحكم.',
    unitLabel: 'مستخدم',
    quantifiable: true,
    maxQuantity: 20,
    defaultPriceMonthly: 49,
    defaultPriceYearly: 490,
    priceKeyMonthly: 'addonUserPriceMonthly',
    priceKeyYearly: 'addonUserPriceYearly',
    bullets: [
      'حساب كاشير أو موظف إضافي',
      'صلاحيات لكل مستخدم على حدة',
      'بيتراكم فوق حد مستخدمي باقتك الحالية',
      'ينفع للموسم — اشترِ شهر واحد وألغِ',
    ],
  },
}

/** ترتيب العرض الثابت في الإعدادات وصفحة الأسعار */
export const ADDON_ORDER: AddOnKey[] = ['hr', 'extra_branch', 'extra_users']

/** سعر فعال بفترة معينة (قبل أي تجاوز من PlatformSetting) */
export function addOnDefaultPrice(key: AddOnKey, period: 'monthly' | 'yearly'): number {
  const def = ADDON_CATALOG[key]
  return period === 'yearly' ? def.defaultPriceYearly : def.defaultPriceMonthly
}

/** إجمالي عملية شراء: السعر × الكمية */
export function addOnTotalPrice(key: AddOnKey, period: 'monthly' | 'yearly', quantity: number): number {
  return Math.round(addOnDefaultPrice(key, period) * Math.max(1, quantity) * 100) / 100
}

/**
 * هل الإضافة دي معروضة للبيع للمحل ده؟
 *   - hr: متاحة لكل الباقات (التحديث 26 — شيلنا استثناء الغذائية).
 *     باقة فيها HR أصلاً (احترافية/food-pro) الكارت بيظهر «مشمولة في باقتك»
 *     مش زر شراء — عبر planIncludesHr() والـ checkout بيرفض الشراء المكرر.
 *   - فروع/مستخدمين: متاحة لكل الباقات (الحدود بتتراكم فوق حد الباقة).
 * ملاحظة: القاعدة هنا للعرض فقط — الفعلي بيتم في getPlanContext:
 * الإضافة تشترى، موديول hr بيتضاف فوق أي قواعد vertical (شامل الغذائية).
 */
export function addOnAvailableForPlan(key: AddOnKey, planCode: string | null | undefined, businessType: string | null | undefined): boolean {
  void planCode
  void businessType
  return true
}

/** هل الباقة فيها الموديول أصلاً (احترافية / food-pro) — عشان الكارت يقول «مشمولة»؟ */
export function planIncludesHr(planCode: string | null | undefined): boolean {
  return (
    planCode === 'electronics-pro' ||
    planCode === 'fashion-pro' ||
    planCode === 'food-pro'
  )
}

/** تنسيق السعر للعرض: 149 → «149» */
export function formatAddOnPrice(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * وصف حالة الإضافة للمحل — بتستخدم في كارت الإعدادات وصفحة الأسعار.
 * status: 'included' (موجودة في الباقة أصلاً) | 'active' | 'none'
 */
export type AddOnStatus = 'included' | 'active' | 'none'
