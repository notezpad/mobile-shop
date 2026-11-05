/**
 * 📱 التحديث 30 (2026-11-04): أنواع منتجات الإلكترونيات + أسماء الخانات + الاختيارات السريعة.
 *
 * الموبايل والكمبيوتر نفس الـ businessType ('electronics') — فالنوع بيتحدد على مستوى المنتج
 * (تلقائي من الاسم، وتقدر تغيّره) ومش بيتخزن في الداتابيز: هو بس بيغيّر «أسماء» الخانتين.
 * التخزين نفسه ثابت: opt1 = عمود color (اللي بيتجمع عليه في نقطة البيع) و opt2 = عمود size.
 */
export type ElectronicsKind = 'phone' | 'laptop' | 'other'

export interface KindMeta {
  key: ElectronicsKind
  tab: string
  /** المواصفة 1 (عمود color — اللي بيحدد السعر وبيتجمع عليه) */
  opt1: string
  opt1Placeholder: string
  /** المواصفة 2 (عمود size) */
  opt2: string
  opt2Placeholder: string
  /** «بدون ...» لما opt1 فاضية */
  noOpt1: string
  /** جمع opt2 لعدّاد المجموعة («3 لون») */
  opt2Unit: string
  smartPlaceholder: string
}

export const KIND_META: Record<ElectronicsKind, KindMeta> = {
  phone: {
    key: 'phone',
    tab: 'موبايل / تابلت',
    opt1: 'السعة',
    opt1Placeholder: '256GB أو 8GB / 256GB',
    opt2: 'اللون',
    opt2Placeholder: 'أسود',
    noOpt1: 'بدون سعة',
    opt2Unit: 'لون',
    smartPlaceholder: 'مثال: ايفون 15 برو اسود وتيتانيوم سعة 128 و256 و512 جديد عدد 3',
  },
  laptop: {
    key: 'laptop',
    tab: 'لابتوب / كمبيوتر',
    opt1: 'الكونفيج',
    opt1Placeholder: 'i7 · 16GB · 512GB SSD',
    opt2: 'اللون',
    opt2Placeholder: 'اختياري',
    noOpt1: 'بدون كونفيج',
    opt2Unit: 'خيار',
    smartPlaceholder: 'مثال: لابتوب i5 و i7 رام 8 و16 هارد 256 و512 SSD مستعمل عدد 2',
  },
  other: {
    key: 'other',
    tab: 'إكسسوار / أخرى',
    opt1: 'الموديل / النوع',
    opt1Placeholder: 'مثال: 20W',
    opt2: 'اللون',
    opt2Placeholder: 'أسود',
    noOpt1: 'بدون نوع',
    opt2Unit: 'خيار',
    smartPlaceholder: 'مثال: شاحن سريع أسود وأبيض عدد 5',
  },
}

const PHONE_WORDS = [
  'موبايل', 'موبيل', 'تليفون', 'هاتف', 'ايفون', 'آيفون', 'iphone', 'سامسونج', 'samsung', 'galaxy', 'جالكسي',
  'شاومي', 'xiaomi', 'redmi', 'ريدمي', 'poco', 'بوكو', 'اوبو', 'oppo', 'ريلمي', 'realme', 'فيفو', 'vivo',
  'هواوي', 'huawei', 'honor', 'هونر', 'انفينيكس', 'infinix', 'تكنو', 'tecno', 'نوكيا', 'nokia', 'موتورولا',
  'motorola', 'ون بلس', 'oneplus', 'pixel', 'بيكسل', 'ايباد', 'آيباد', 'ipad', 'تابلت', 'tablet',
]
const LAPTOP_WORDS = [
  'لابتوب', 'لاب توب', 'laptop', 'كمبيوتر', 'كمبيورتر', 'كومبيوتر', 'ماك بوك', 'macbook', 'ديل', 'dell',
  'اتش بي', 'لينوفو', 'lenovo', 'اسوس', 'asus', 'ايسر', 'acer', 'thinkpad', 'ثينك باد', 'surface', 'pc',
  'ديسكتوب', 'desktop', 'كيسة', 'شاشة', 'مونيتور',
]

/** تحديد النوع تلقائيًا من اسم المنتج (الافتراضي: موبايل) */
export function detectElectronicsKind(productName?: string | null): ElectronicsKind {
  const n = (productName ?? '').toLowerCase()
  if (!n) return 'phone'
  if (LAPTOP_WORDS.some((w) => n.includes(w))) return 'laptop'
  if (PHONE_WORDS.some((w) => n.includes(w))) return 'phone'
  return 'other'
}

// ── اختيارات سريعة (chips) ──
export const STORAGE_CHIPS = ['64GB', '128GB', '256GB', '512GB', '1TB']
export const RAM_CHIPS = ['4GB', '6GB', '8GB', '12GB', '16GB', '32GB']
export const PHONE_COLOR_CHIPS = ['أسود', 'أبيض', 'أزرق', 'رمادي', 'ذهبي', 'فضي', 'بنفسجي', 'أخضر', 'وردي', 'تيتانيوم']
export const LAPTOP_CPU_CHIPS = ['i3', 'i5', 'i7', 'i9', 'Ryzen 5', 'Ryzen 7', 'M1', 'M2', 'M3']
export const LAPTOP_STORAGE_CHIPS = ['256GB SSD', '512GB SSD', '1TB SSD', '1TB HDD']

/** يركّب نص الكونفيج للابتوب من 3 خانات: «i7 · 16GB · 512GB SSD» */
export function composeLaptopConfig(cpu: string, ram: string, storage: string): string {
  return [cpu, ram, storage].map((x) => x.trim()).filter(Boolean).join(' · ')
}
/** يركّب سعة الموبايل: «8GB / 256GB» أو «256GB» */
export function composePhoneSpec(ram: string, storage: string): string {
  return [ram, storage].map((x) => x.trim()).filter(Boolean).join(' / ')
}
