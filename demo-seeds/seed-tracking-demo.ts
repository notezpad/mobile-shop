/**
 * DEMO ONLY (بيئة المعاينة) — بذرة بيانات واقعية لصفحة التتبع:
 *  - إعداد واقعي: GA4 متصل · Ads متصل · Meta ناقص التوكن (كهرماني) · TikTok غير مضبوط
 *  - 14 حدث بث حديث مختلط (مرسل/فاشل/متخطى × منصات × مصادر)
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  // 1) إعداد واقعي متعدد الحالات (بدون أي أسرار حقيقية)
  const cfg = {
    general: { enabled: true, debugMode: false, testMode: false, consentManagement: false },
    google: {
      enabled: true,
      ga4MeasurementId: "G-NEZ4MPOS01",
      ga4ApiSecret: "",
      adsConversionId: "AW-112233445",
      adsLabels: { registration: "reg2026", trial: "trial2026", purchase: "pur2026" },
      gtmId: "",
      useGtm: false,
      enhancedConversions: true,
      consentMode: true,
    },
    meta: {
      enabled: true,
      pixelId: "109876543210987",
      datasetId: "",
      capiToken: "",   // ناقص → بطاقة كهرمانية «ناقص الضبط»
      testEventCode: "",
    },
    tiktok: {
      enabled: false,
      pixelId: "",
      eventsApiToken: "",
      testEventCode: "",
    },
  };
  await db.platformSetting.upsert({
    where: { key: "tracking_config" },
    update: { value: JSON.stringify(cfg) },
    create: { key: "tracking_config", value: JSON.stringify(cfg) },
  });

  // 2) أحداث بث واقعية خلال اليومين الماضيين
  await db.trackingEvent.deleteMany({});
  const now = Date.now();
  const H = 3600_000;
  const rows: Array<[string, string, string, string, string, string | null, number | null, number]> = [
    ["purchase-sub-1027", "Purchase", "meta", "server", "sent", null, 1027, 2],
    ["purchase-sub-1027", "Purchase", "ga4", "server", "sent", null, 1027, 2],
    ["purchase-sub-1027", "Purchase", "google_ads", "server", "sent", null, 1027, 2],
    ["purchase-sub-1027-b", "Purchase", "meta", "browser", "sent", null, 1027, 2],
    ["trial-sub-1031", "StartTrial", "meta", "server", "sent", null, 1031, 9],
    ["trial-sub-1031", "StartTrial", "tiktok", "server", "failed", "401 Unauthorized — token مفقود", 1031, 9],
    ["signup-t1034", "CompleteRegistration", "ga4", "browser", "sent", null, null, 14],
    ["signup-t1034", "CompleteRegistration", "meta", "browser", "sent", null, null, 14],
    ["checkout-sub-1029", "InitiateCheckout", "meta", "server", "sent", null, 1029, 20],
    ["checkout-sub-1029", "InitiateCheckout", "google_ads", "server", "skipped", "معرّف التحويل فارغ", 1029, 20],
    ["pv-home-88213", "PageView", "meta", "browser", "sent", null, null, 26],
    ["pv-pricing-88214", "ViewContent", "ga4", "browser", "sent", null, null, 26],
    ["pv-home-88215", "PageView", "meta", "browser", "sent", null, null, 31],
    ["purchase-sub-1026", "Purchase", "ga4", "server", "failed", "MP validation: secret غير مضبوط", 1026, 47],
  ];
  for (const [eventId, eventName, provider, source, status, error, subscriptionId, hoursAgo] of rows) {
    await db.trackingEvent.create({
      data: {
        eventId, eventName, provider, source, status, error, subscriptionId,
        createdAt: new Date(now - hoursAgo * H),
      },
    });
  }
  console.log("seeded:", rows.length, "events");
}

main().finally(() => db.$disconnect());
