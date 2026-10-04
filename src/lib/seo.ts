import type { Metadata } from "next";
import { SITE_NAME, OG_IMAGE } from "@/lib/site";

/**
 * مصدر واحد لبيانات SEO الخاصة بكل صفحة عامة.
 *
 * - title و description: تُستخدم حرفيًا كما وردت في ملف الـ SEO (لا تعدّلها هنا إلا بقرار SEO).
 * - primaryKeyword و secondaryKeywords: مرجع داخلي للفريق فقط — لا تُطبع في الـ HTML
 *   (مفيش meta keywords عمدًا، جوجل بتتجاهلها أصلاً).
 *
 * البراند الرسمي: Nezam POS — والاسم العربي الوصفي: نظام المحل.
 */
export type SeoPage = {
  path: string;
  title: string;
  description: string;
  ogType: "website" | "article";
  primaryKeyword: string;
  secondaryKeywords: readonly string[];
};

export const SEO_PAGES = {
  "/": {
    path: "/",
    title: "Nezam POS | نظام المحل لإدارة المحلات ونقاط البيع",
    description:
      "Nezam POS هو نظام المحل لإدارة المبيعات والمخزون ونقاط البيع POS للموبايل والكمبيوتر والملابس والأحذية، مع الصيانة والخزنة والتقارير وأتمتة العمليات.",
    ogType: "website",
    primaryKeyword: "برنامج إدارة المحلات",
    secondaryKeywords: [
      "نظام إدارة المحلات",
      "برنامج كاشير للمحلات",
      "برنامج نقاط البيع POS",
      "برنامج POS عربي",
      "برنامج إدارة المبيعات والمخزون",
      "برنامج إدارة محلات الموبايل والكمبيوتر",
      "برنامج إدارة محلات الملابس والأحذية",
      "برنامج إدارة الجملة والقطاعي",
      "أتمتة إدارة المحلات",
    ],
  },
  "/pricing": {
    path: "/pricing",
    title: "أسعار Nezam POS | باقات نظام المحل لإدارة المحلات",
    description:
      "تعرف على أسعار وباقات Nezam POS لإدارة المحلات، مع باقات للموبايل والكمبيوتر والملابس والأحذية للبيع القطاعي والجملة، حسب احتياجات نشاطك.",
    ogType: "website",
    primaryKeyword: "أسعار برامج POS",
    secondaryKeywords: [
      "أسعار برنامج إدارة المحلات",
      "أسعار برنامج كاشير",
      "أسعار نظام نقاط البيع",
      "باقات POS",
      "باقات نظام المحل",
      "برنامج محلات قطاعي",
      "برنامج محلات جملة وقطاعي",
      "برنامج إدارة محلات الملابس والأحذية",
      "برنامج إدارة محلات الموبايل والكمبيوتر",
    ],
  },
  "/about-us": {
    path: "/about-us",
    title: "من نحن | Nezam POS نظام المحل لإدارة المحلات",
    description:
      "تعرف على Nezam POS، نظام المحل لإدارة المبيعات والمخزون ونقاط البيع للموبايل والكمبيوتر والملابس والأحذية، مع أتمتة العديد من العمليات اليومية.",
    ogType: "website",
    primaryKeyword: "نظام إدارة المحلات",
    secondaryKeywords: [
      "Nezam POS",
      "نظام المحل",
      "برنامج إدارة المحلات",
      "منصة إدارة المحلات",
      "برنامج POS عربي",
      "برنامج إدارة المبيعات والمخزون",
      "أتمتة إدارة المحلات",
    ],
  },
  "/guide": {
    path: "/guide",
    title: "دليل الاستخدام الكامل | Nezam POS نظام المحل",
    description:
      "دليل استخدام Nezam POS خطوة بخطوة بالصور: من لوحة المعلومات لحد آخر صفحة إعدادات — شرح كل باقة (موبايل وكمبيوتر / ملابس وأحذية، أساسية واحترافية) والميزات الذكية: الدستة التلقائي، تسعير القطعة، والمساعد الذكي للمقاسات والألوان.",
    ogType: "article",
    primaryKeyword: "دليل استخدام نظام المحل",
    secondaryKeywords: [
      "شرح برنامج Nezam POS",
      "طريقة استخدام نظام المحل",
      "شرح نظام نقاط البيع بالصور",
      "دليل باقات Nezam POS",
      "برنامج محلات الموبايل والكمبيوتر شرح",
      "برنامج محلات الملابس والأحذية شرح",
      "شرح الدستة والبيع بالجملة",
    ],
  },
  "/contact-us": {
    path: "/contact-us",
    title: "تواصل معنا | دعم Nezam POS ونظام المحل",
    description:
      "تواصل مع فريق Nezam POS للحصول على الدعم والإجابة عن استفساراتك حول نظام المحل وإدارة المحلات ونقاط البيع والمبيعات والمخزون والصيانة.",
    ogType: "website",
    primaryKeyword: "دعم Nezam POS",
    secondaryKeywords: [
      "تواصل مع Nezam POS",
      "دعم نظام المحل",
      "دعم برنامج POS",
      "دعم برنامج الكاشير",
      "دعم نظام نقاط البيع",
      "خدمة عملاء Nezam POS",
    ],
  },
  "/terms-and-conditions": {
    path: "/terms-and-conditions",
    title: "الشروط والأحكام | Nezam POS نظام المحل",
    description:
      "اطلع على الشروط والأحكام الخاصة باستخدام Nezam POS، بما يشمل الاشتراكات والتجربة المجانية والدفع والإلغاء والاسترداد وحقوق المستخدم وواجباته.",
    ogType: "article",
    primaryKeyword: "شروط وأحكام Nezam POS",
    secondaryKeywords: [
      "شروط استخدام نظام المحل",
      "شروط الاشتراك",
      "شروط برنامج POS",
      "شروط استخدام برنامج الكاشير",
    ],
  },
  "/privacy-policy": {
    path: "/privacy-policy",
    title: "سياسة الخصوصية | Nezam POS نظام المحل",
    description:
      "تعرف على سياسة الخصوصية في Nezam POS وكيفية جمع واستخدام وحماية بيانات الحساب والعملاء والمعاملات وحقوق المستخدم المتعلقة ببياناته وخصوصيته.",
    ogType: "article",
    primaryKeyword: "سياسة الخصوصية Nezam POS",
    secondaryKeywords: [
      "سياسة الخصوصية نظام المحل",
      "سياسة خصوصية برنامج POS",
      "حماية بيانات العملاء",
      "حماية بيانات المستخدمين",
      "خصوصية البيانات",
      "أمان البيانات",
    ],
  },
  "/cookies-policy": {
    path: "/cookies-policy",
    title: "سياسة ملفات تعريف الارتباط | Nezam POS نظام المحل",
    description:
      "تعرف على كيفية استخدام Nezam POS لملفات تعريف الارتباط Cookies، وأنواعها وأغراض استخدامها، وكيف يمكنك التحكم في إعدادات ملفات الارتباط على الموقع.",
    ogType: "article",
    primaryKeyword: "سياسة ملفات تعريف الارتباط",
    secondaryKeywords: [
      "سياسة الكوكيز",
      "Cookies Policy",
      "ملفات تعريف الارتباط",
      "إدارة ملفات الارتباط",
      "Nezam POS Cookies",
    ],
  },
  "/refund-policy": {
    path: "/refund-policy",
    title: "سياسة الاسترجاع والاسترداد | Nezam POS",
    description:
      "تعرف على سياسة الاسترجاع والاسترداد في Nezam POS، وشروط إلغاء الاشتراك واسترداد المدفوعات والقواعد المتعلقة بطلبات الاسترداد وإلغاء الاشتراك.",
    ogType: "article",
    primaryKeyword: "سياسة الاسترجاع والاسترداد",
    secondaryKeywords: [
      "سياسة استرداد المبلغ",
      "استرداد اشتراك Nezam POS",
      "إلغاء اشتراك نظام المحل",
      "شروط الاسترداد",
      "Refund Policy",
    ],
  },
} as const satisfies Record<string, SeoPage>;

export type SeoPath = keyof typeof SEO_PAGES;

/**
 * يبني metadata الصفحة من SEO_PAGES.
 * - title مطلق (absolute) عشان template الـ root layout ما يضيفش لاحقة على العنوان.
 * - مفيش keywords.
 * - OG/Twitter بنفس الـ Title/Description عشان تتطابق مع اللي في نتايج البحث.
 * - openGraph في Next بيستبدل بتاع الـ root بالكامل، فبنعيد siteName/locale/images هنا.
 */
export function buildPageMetadata(path: SeoPath): Metadata {
  const page: SeoPage = SEO_PAGES[path];
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: page.ogType,
      url: page.path,
      siteName: SITE_NAME,
      locale: "ar_AR",
      title: page.title,
      description: page.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: page.title, type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [OG_IMAGE],
    },
  };
}
