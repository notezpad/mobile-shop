// مصدر واحد لكل بيانات السيو — غيّر هنا بس ويتطبق على الموقع كله
export const SITE_URL = "https://nezampos.com";
export const SITE_NAME = "نظام المحل";
export const SITE_NAME_EN = "Nezam POS";
export const SITE_TITLE = "نظام المحل | برنامج كاشير ونقطة بيع POS لإدارة المحلات";
export const SITE_DESCRIPTION =
  "برنامج كاشير ونقطة بيع (POS) لمحلات الموبايل والكمبيوتر والملابس والأحذية: فواتير بالباركود، مخزون، صيانة، عملاء وتقارير أرباح لحظية. جرّب مجاناً 14 يوم.";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const WHATSAPP = "+201010328471";
export const SUPPORT_PHONE = WHATSAPP;

export const PAGES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/about-us", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact-us", changeFrequency: "monthly", priority: 0.7 },
  { path: "/terms-and-conditions", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookies-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
] as const;
