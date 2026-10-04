// مصدر واحد لكل بيانات السيو — غيّر هنا بس ويتطبق على الموقع كله
export const SITE_URL = "https://nezampos.com";
// البراند الرسمي: Nezam POS — و"نظام المحل" هو الاسم العربي الوصفي للمنتج.
export const SITE_NAME = "Nezam POS";
export const SITE_NAME_EN = SITE_NAME; // للتوافق مع الاستيرادات القديمة
export const SITE_NAME_AR = "نظام المحل";
// Title/Description الصفحة الرئيسية — مصدرهم src/lib/seo.ts (SEO_PAGES["/"])
export const SITE_TITLE = "Nezam POS | نظام المحل لإدارة المحلات ونقاط البيع";
export const SITE_DESCRIPTION =
  "Nezam POS هو نظام المحل لإدارة المبيعات والمخزون ونقاط البيع POS للموبايل والكمبيوتر والملابس والأحذية، مع الصيانة والخزنة والتقارير وأتمتة العمليات.";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const WHATSAPP = "+201010328471";
export const SUPPORT_PHONE = WHATSAPP;

export const PAGES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/guide", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about-us", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact-us", changeFrequency: "monthly", priority: 0.7 },
  { path: "/terms-and-conditions", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookies-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
] as const;
