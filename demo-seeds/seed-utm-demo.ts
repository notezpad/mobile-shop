/**
 * DEMO ONLY (بيئة المعاينة) — بذرة بيانات لصفحة «روابط الحملات»:
 *  - 12 بوليصة UTM واقعية (10 نشطة + 2 مؤرشفة) عبر المنصات الأربع،
 *    بُنيت بنفس دالة الإنتاج buildUtmUrl + urlHash (SHA-256) لمنع التكرار.
 *  - إسنادات مستخدمين حقيقية (First/Last Touch) مربوطة بالحملات.
 *  - أحداث تسجيل/تجربة/دفع/شراء حقيقية خلال آخر 30 يوماً على اشتراكات
 *    موجودة فعلاً → عمود «أداء 30 يوم» في المكتبة يعرض أرقاماً صحيحة.
 */
import { PrismaClient } from "@prisma/client";
import { buildUtmUrl, sha256Hex, UtmPlatform } from "../src/lib/tracking/utm";

const db = new PrismaClient();

interface Spec {
  name: string;
  platform: UtmPlatform;
  destinationUrl: string;
  campaign: string;
  content?: string;
  term?: string;
  utmId?: string;
  source?: string;
  medium?: string;
  archived?: boolean;
  daysAgo: number;
}

/* ─── 1) بوالص الإرسالية (الحملات) ──────────────────────────────────── */
const SPECS: Spec[] = [
  // Meta — أداء مباشر (تسجيل + شراء من إيفولوشن تك)
  {
    name: "رمضان 2026 — مشاهير", platform: "meta",
    destinationUrl: "https://nezampos.com/register",
    campaign: "ramadan2026_creators",
    content: "{{adset.name}}", term: "{{placement}}", utmId: "{{campaign.name}}",
    daysAgo: 41,
  },
  // Meta — إعادة استهداف (مدفوعة بلا تسجيل داخل النافذة — واقعي تماماً)
  {
    name: "الجمعة البيضاء — إعادة استهداف", platform: "meta",
    destinationUrl: "https://nezampos.com/register",
    campaign: "bf2026_retarget", content: "{{ad.name}}",
    daysAgo: 9,
  },
  // Meta — حملة ليدز قيد التشغيل بلا تحويلات بعد
  {
    name: "ليدز — عرض التسجيل المجاني", platform: "meta",
    destinationUrl: "https://nezampos.com/register",
    campaign: "signup_leadoffer", content: "story_a",
    source: "instagram", medium: "paid_social_story",
    daysAgo: 5,
  },
  // Google — أفضل حملة أداءً (تك سنتر 5,990)
  {
    name: "بحث — نظام نقاط بيع", platform: "google",
    destinationUrl: "https://nezampos.com/pricing",
    campaign: "search_pos_brand", term: "{keyword}", utmId: "{campaignid}",
    daysAgo: 37,
  },
  // Google — يوتيوب بلا تحويلات
  {
    name: "يوتيوب — الفيلم التعريفي", platform: "google",
    destinationUrl: "https://nezampos.com/",
    campaign: "yt_brandfilm_oct", content: "{creative}",
    medium: "youtube",
    daysAgo: 21,
  },
  // Google — شبكة إعلانية
  {
    name: "شبكة إعلانية — بنرات Q4", platform: "google",
    destinationUrl: "https://nezampos.com/features",
    campaign: "display_q4_banners", content: "banner_300x600",
    medium: "display",
    daysAgo: 16,
  },
  // TikTok — شراء بلا تسجيل داخل النافذة (الرحمة موبايل)
  {
    name: "تيك توك — إطلاق أكتوبر", platform: "tiktok",
    destinationUrl: "https://nezampos.com/register",
    campaign: "tt_launch_oct",
    content: "__AID_NAME__", term: "__PLACEMENT__", utmId: "__AID__",
    daysAgo: 28,
  },
  // TikTok — تسجيل تجربة (سمارت لاين) بلا شراء
  {
    name: "تيك توك — تجارب عملاء", platform: "tiktok",
    destinationUrl: "https://nezampos.com/register",
    campaign: "tt_testimonials", content: "video_b",
    medium: "paid_social_video",
    daysAgo: 11,
  },
  // مخصص — واتساب
  {
    name: "واتساب — بث قوائم العملاء", platform: "custom",
    destinationUrl: "https://nezampos.com/pricing",
    campaign: "wa_broadcast_oct", content: "list_a",
    source: "whatsapp", medium: "referral",
    daysAgo: 7,
  },
  // مخصص — نشرة بريدية
  {
    name: "النشرة البريدية — أكتوبر", platform: "custom",
    destinationUrl: "https://nezampos.com/",
    campaign: "nl_october",
    source: "newsletter", medium: "email",
    daysAgo: 14,
  },
  // مؤرشفة
  {
    name: "تجربة A/B — سبتمبر", platform: "meta",
    destinationUrl: "https://nezampos.com/register",
    campaign: "abtest_sep", content: "variant_b",
    archived: true, daysAgo: 55,
  },
  {
    name: "تليجرام — القناة الرسمية", platform: "custom",
    destinationUrl: "https://nezampos.com/",
    campaign: "tg_channel",
    source: "telegram", medium: "social",
    archived: true, daysAgo: 62,
  },
];

/* ─── 2) إسنادات First/Last Touch لمستخدمين حقيقيين ─────────────────── */
const ATTRS: Array<{
  userId: string;
  first: [string, string, string];
  last: [string, string, string];
  click: "gclid" | "fbclid" | "ttclid";
  daysAgo: number;
}> = [
  // تك سنتر — قاد من بحث جوجل واشترى الباقة السنوية (5,990)
  {
    userId: "cmuzuw0nv001boesbb1sgg1ci",
    first: ["google", "cpc", "search_pos_brand"],
    last: ["google", "cpc", "search_pos_brand"],
    click: "gclid", daysAgo: 2,
  },
  // إيفولوشن تك — حملة مشاهير رمضان (599)
  {
    userId: "cmuzuw0yq001zoesbw1vkzqqh",
    first: ["facebook", "paid_social", "ramadan2026_creators"],
    last: ["facebook", "paid_social", "ramadan2026_creators"],
    click: "fbclid", daysAgo: 15,
  },
  // مودرن شوز — أول لمس إعادة استهداف ثم بحث جوجل (349)
  {
    userId: "cmuzuw0mq0018oesbj58g9z2j",
    first: ["facebook", "paid_social", "bf2026_retarget"],
    last: ["google", "cpc", "search_pos_brand"],
    click: "fbclid", daysAgo: 0,
  },
  // الرحمة موبايل — إطلاق تيك توك (299)
  {
    userId: "cmuzuw0gx000goesbfixrohro",
    first: ["tiktok", "paid_social", "tt_launch_oct"],
    last: ["tiktok", "paid_social", "tt_launch_oct"],
    click: "ttclid", daysAgo: 0,
  },
  // سمارت لاين — سجّل عبر تجارب عملاء تيك توك وبدأ تجربة
  {
    userId: "cmuzuw0pa001eoesbo2lraf4o",
    first: ["tiktok", "paid_social_video", "tt_testimonials"],
    last: ["tiktok", "paid_social_video", "tt_testimonials"],
    click: "ttclid", daysAgo: 1,
  },
  // أناقة للأزياء — بنرات الشبكة الإعلانية (بلا أحداث داخل النافذة)
  {
    userId: "cmuzuw0jv000uoesbpxb4qvc5",
    first: ["google", "display", "display_q4_banners"],
    last: ["google", "display", "display_q4_banners"],
    click: "gbraid", daysAgo: 16,
  },
  // براند أوريجينال — النشرة البريدية (بلا أحداث داخل النافذة)
  {
    userId: "cmuzuw0l50013oesbc6zeio3x",
    first: ["newsletter", "email", "nl_october"],
    last: ["newsletter", "email", "nl_october"],
    click: "gclid", daysAgo: 14,
  },
];

/* ─── 3) أحداث حقيقية خلال 30 يوماً (تغذّي عمود الأداء) ─────────────── */
const H = 3600_000;
const EVENTS: Array<{
  eventId: string; eventName: string; provider: string;
  source: string; status?: string; error?: string;
  subscriptionId?: number; hoursAgo: number;
}> = [
  // تك سنتر — تسجيل + دفع + شراء (sub 15 · 5,990)
  { eventId: "signup-cmuzuw0nv001boesbb1sgg1ci", eventName: "CompleteRegistration", provider: "ga4", source: "browser", hoursAgo: 52 },
  { eventId: "signup-cmuzuw0nv001boesbb1sgg1ci", eventName: "CompleteRegistration", provider: "meta", source: "browser", hoursAgo: 52 },
  { eventId: "checkout-sub-15", eventName: "InitiateCheckout", provider: "meta", source: "server", hoursAgo: 30 },
  { eventId: "purchase-sub-15", eventName: "Purchase", provider: "meta", source: "server", subscriptionId: 15, hoursAgo: 29 },
  { eventId: "purchase-sub-15", eventName: "Purchase", provider: "ga4", source: "server", subscriptionId: 15, hoursAgo: 29 },
  // إيفولوشن تك — تسجيل + شراء (sub 27 · 599)
  { eventId: "signup-cmuzuw0yq001zoesbw1vkzqqh", eventName: "CompleteRegistration", provider: "meta", source: "browser", hoursAgo: 372 },
  { eventId: "signup-cmuzuw0yq001zoesbw1vkzqqh", eventName: "CompleteRegistration", provider: "ga4", source: "browser", hoursAgo: 372 },
  { eventId: "purchase-sub-27", eventName: "Purchase", provider: "meta", source: "server", subscriptionId: 27, hoursAgo: 360 },
  { eventId: "purchase-sub-27", eventName: "Purchase", provider: "ga4", source: "server", subscriptionId: 27, hoursAgo: 360 },
  // سمارت لاين — تسجيل + تجربة مجانية (sub 16)
  { eventId: "signup-cmuzuw0pa001eoesbo2lraf4o", eventName: "CompleteRegistration", provider: "meta", source: "browser", hoursAgo: 26 },
  { eventId: "signup-cmuzuw0pa001eoesbo2lraf4o", eventName: "CompleteRegistration", provider: "ga4", source: "browser", hoursAgo: 26 },
  { eventId: "trial-sub-16", eventName: "StartTrial", provider: "meta", source: "server", subscriptionId: 16, hoursAgo: 25 },
  // مودرن شوز — تجديد اليوم (sub 30 · 349)
  { eventId: "checkout-sub-30", eventName: "InitiateCheckout", provider: "meta", source: "server", hoursAgo: 5 },
  { eventId: "purchase-sub-30", eventName: "Purchase", provider: "meta", source: "server", subscriptionId: 30, hoursAgo: 4 },
  { eventId: "purchase-sub-30", eventName: "Purchase", provider: "ga4", source: "server", subscriptionId: 30, hoursAgo: 4 },
  { eventId: "purchase-sub-30", eventName: "Purchase", provider: "google_ads", source: "server", subscriptionId: 30, hoursAgo: 4 },
  // الرحمة موبايل — تجديد اليوم (sub 31 · 299) + فشل تيك توك (توكن غير مضبوط)
  { eventId: "checkout-sub-31", eventName: "InitiateCheckout", provider: "meta", source: "server", hoursAgo: 2 },
  { eventId: "purchase-sub-31", eventName: "Purchase", provider: "meta", source: "server", subscriptionId: 31, hoursAgo: 1 },
  { eventId: "purchase-sub-31", eventName: "Purchase", provider: "ga4", source: "server", subscriptionId: 31, hoursAgo: 1 },
  { eventId: "purchase-sub-31", eventName: "Purchase", provider: "tiktok", source: "server", status: "failed", error: "401 Unauthorized — Events API token مفقود", subscriptionId: 31, hoursAgo: 1 },
];

async function main() {
  // 1) البوالص
  await db.utmCampaign.deleteMany({});
  for (const s of SPECS) {
    const built = buildUtmUrl({
      destinationUrl: s.destinationUrl, platform: s.platform,
      campaign: s.campaign, content: s.content, term: s.term,
      utmId: s.utmId, source: s.source, medium: s.medium,
    });
    if (!built.ok) throw new Error(`فشل بناء ${s.name}: ${built.errors.join("، ")}`);
    const urlHash = await sha256Hex(built.fullUrl);
    await db.utmCampaign.create({
      data: {
        name: s.name, platform: s.platform,
        destinationUrl: built.destinationUrl,
        utmSource: built.source, utmMedium: built.medium,
        utmCampaign: built.campaign,
        utmContent: built.content || null, utmTerm: built.term || null,
        utmId: built.utmId || null,
        fullUrl: built.fullUrl, urlHash,
        archived: !!s.archived,
        createdAt: new Date(Date.now() - s.daysAgo * 864e5),
      },
    });
  }
  console.log("seeded campaigns:", SPECS.length);

  // 2) الإسنادات
  for (const a of ATTRS) {
    const at = new Date(Date.now() - a.daysAgo * 864e5 - 6 * H);
    await db.userAttribution.upsert({
      where: { userId: a.userId },
      update: {},
      create: {
        userId: a.userId,
        firstTouchSource: a.first[0], firstTouchMedium: a.first[1],
        firstTouchCampaign: a.first[2],
        firstTouchAt: at,
        lastTouchSource: a.last[0], lastTouchMedium: a.last[1],
        lastTouchCampaign: a.last[2],
        lastTouchAt: new Date(Date.now() - a.daysAgo * 864e5),
        [a.click]: `${a.click === "fbclid" ? "IwAR" : "Cj"}${a.userId.slice(-10)}`,
        landingPage: "https://nezampos.com/register?utm_campaign=" + a.first[2],
        referrer: a.first[0] === "google" ? "https://www.google.com/" : null,
        createdAt: at,
      },
    });
  }
  console.log("seeded attributions:", ATTRS.length);

  // 3) الأحداث — لا تُمس الأحداث الأخرى (سجل البث يكبر واقعياً)
  let added = 0;
  for (const e of EVENTS) {
    const exists = await db.trackingEvent.findFirst({
      where: { provider: e.provider, eventId: e.eventId },
      select: { id: true },
    });
    if (exists) continue;
    await db.trackingEvent.create({
      data: {
        eventId: e.eventId, eventName: e.eventName, provider: e.provider,
        source: e.source, status: e.status ?? "sent", error: e.error ?? null,
        subscriptionId: e.subscriptionId ?? null,
        createdAt: new Date(Date.now() - e.hoursAgo * H),
      },
    });
    added++;
  }
  console.log("seeded events (new):", added);
}

main().finally(() => db.$disconnect());
