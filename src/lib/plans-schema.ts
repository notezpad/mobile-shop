import {
  SITE_URL,
  SITE_NAME,
  SITE_NAME_AR,
  SITE_DESCRIPTION,
  SUPPORT_EMAIL,
} from "@/lib/site";

/**
 * مصدر واحد لبيانات الباقات في الـ JSON-LD (الرئيسية + الأسعار).
 * ⚠️ لازم تطابق جدول Plan في قاعدة البيانات (prisma/seed-plans.ts) وصفحة /pricing —
 * جوجل ومحركات الـ AI بتقارن السعر في الـ Schema بالسعر الظاهر للزائر. عند تغيير أي سعر
 * من لوحة الأدمن حدّثه هنا أيضاً (أو اربطه بالـ DB لاحقاً).
 *
 * ملاحظة: schema.org مفيهوش نوع اسمه "PricingPlan". المعيار الصحيح لوصف باقات الاشتراك هو
 * Offer + UnitPriceSpecification (billingDuration = P1M / P1Y) داخل AggregateOffer.
 */
export const PLAN_SCHEMA = [
  { code: "electronics-basic", name: "باقة أساسية - موبايل وكمبيوتر", monthly: 299, yearly: 2990, users: 3, products: 500, branches: 1,
    description: "إدارة كاملة لمحل الموبايل والكمبيوتر: نقطة بيع، مخزون، صيانة، ومعاملات مالية." },
  { code: "electronics-pro", name: "باقة احترافية - موبايل وكمبيوتر", monthly: 599, yearly: 5990, users: 10, products: 5000, branches: 5,
    description: "كل مزايا الأساسية + تقارير متقدمة، فروع متعددة، مستخدمون أكثر، وبيع بالجملة بوحدات متعددة." },
  { code: "fashion-basic", name: "باقة أساسية - ملابس وأحذية", monthly: 349, yearly: 3490, users: 3, products: 1000, branches: 1,
    description: "إدارة محل الملابس والأحذية: نقطة بيع، مخزون، مقاسات وألوان، مصروفات، وخزنة." },
  { code: "fashion-pro", name: "باقة احترافية - ملابس وأحذية", monthly: 699, yearly: 6990, users: 10, products: 10000, branches: 5,
    description: "لسلاسل المحلات وتجار الجملة: فروع متعددة، بيع بالكرتونة والدستة، وخصم الكوليكشن، مع المقاسات والألوان." },
] as const;

const CURRENCY = "EGP";
const TRIAL_DAYS = 14;

function planOffer(p: (typeof PLAN_SCHEMA)[number]) {
  return {
    "@type": "Offer",
    "@id": `${SITE_URL}/pricing#${p.code}`,
    name: p.name,
    description: `${p.description} حتى ${p.users} مستخدمين و${p.products.toLocaleString("en-US")} منتج و${p.branches} فرع. تجربة مجانية ${TRIAL_DAYS} يوم.`,
    url: `${SITE_URL}/signup?plan=${p.code}`,
    category: "SaaS subscription",
    price: String(p.monthly),
    priceCurrency: CURRENCY,
    availability: "https://schema.org/InStock",
    priceSpecification: [
      {
        "@type": "UnitPriceSpecification",
        name: "اشتراك شهري",
        price: p.monthly,
        priceCurrency: CURRENCY,
        billingDuration: "P1M",
        billingIncrement: 1,
        unitCode: "MON",
        priceType: "https://schema.org/ListPrice",
      },
      {
        "@type": "UnitPriceSpecification",
        name: "اشتراك سنوي",
        price: p.yearly,
        priceCurrency: CURRENCY,
        billingDuration: "P1Y",
        billingIncrement: 1,
        unitCode: "ANN",
        priceType: "https://schema.org/ListPrice",
      },
    ],
    eligibleDuration: {
      "@type": "QuantitativeValue",
      value: TRIAL_DAYS,
      unitCode: "DAY",
      unitText: "تجربة مجانية",
    },
  };
}

/** عقدة SoftwareApplication الكاملة (بباقاتها الأربع) — تُستخدم في / و /pricing بنفس الـ @id */
export function buildSoftwareApplicationJsonLd() {
  const prices = PLAN_SCHEMA.map((p) => p.monthly);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    alternateName: SITE_NAME_AR,
    url: SITE_URL,
    inLanguage: "ar",
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Point of Sale (POS), Inventory & Invoicing",
    operatingSystem: "Web, iOS, Android, Windows, macOS",
    browserRequirements: "يتطلب متصفح حديث (Chrome / Safari / Edge)",
    softwareHelp: { "@type": "CreativeWork", url: `${SITE_URL}/guide`, name: "دليل استخدام Nezam POS" },
    image: `${SITE_URL}/og-image.png`,
    provider: { "@id": `${SITE_URL}/#organization` },
    audience: {
      "@type": "BusinessAudience",
      audienceType: "أصحاب محلات الموبايل والكمبيوتر والملابس والأحذية (قطاعي وجملة)",
      geographicArea: { "@type": "Country", name: "Egypt" },
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: CURRENCY,
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offerCount: PLAN_SCHEMA.length,
      offers: PLAN_SCHEMA.map(planOffer),
    },
    featureList: [
      "نقطة بيع (POS) كاملة بالباركود وطباعة الفواتير",
      "إدارة مخزون ذكية مع تنبيهات النفاد والجرد والتحويل بين الفروع",
      "متابعة أجهزة الصيانة (باقات الموبايل والكمبيوتر)",
      "معاملات مالية ومحافظ إلكترونية متعددة (باقات الموبايل والكمبيوتر)",
      "تقارير وأرباح لحظية",
      "بيع بالجملة والقطاعي بوحدات بيع متعددة (الباقات الاحترافية)",
      "مقاسات وألوان وكوليكشنات (باقات الملابس والأحذية)",
      "مرتجع واستبدال في كل الباقات",
      "يعمل بدون إنترنت (PWA)",
    ],
    potentialAction: {
      "@type": "RegisterAction",
      name: "ابدأ تجربة مجانية 14 يوم",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/signup{?plan}`, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] },
    },
    // ⚠️ aggregateRating غير مضاف عمداً: ممنوع إلا بتقييمات حقيقية ظاهرة للزائر.
  };
}

/** Organization + contact — مرجع @id موحّد لباقي العقد */
export function buildOrganizationJsonLd(phone: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: SITE_NAME_AR,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: SITE_DESCRIPTION,
    email: SUPPORT_EMAIL,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: phone,
      email: SUPPORT_EMAIL,
      contactType: "customer support",
      availableLanguage: ["Arabic"],
      areaServed: "EG",
    },
  };
}
