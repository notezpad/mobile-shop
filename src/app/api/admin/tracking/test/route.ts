import { withDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { getTrackingConfig } from '@/lib/tracking/config'
import { trackServerEvent } from '@/lib/tracking/server'
import { TRACKING_EVENTS, TrackingEventParams } from '@/lib/tracking/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/tracking/test
 *
 * 🧪 أداة التشخيص المدمجة — تجيب على سؤال "ليه مفيش أحداث بتوصل؟"
 *
 * 1) تقرير بوابات: كل شرط لازم يتحقق قبل ما حدث يوصل لأي منصة
 *    (المفتاح الرئيسي / مفتاح المنصة / المعرفات / التوكنات / الاختبار).
 * 2) إرسال حدث اختباري حقيقي عبر نفس مسار trackServerEvent المُستخدم
 *    في الإنتاج — فالنتيجة (sent/failed/skipped + رسالة الخطأ الحرفية
 *    من Meta/TikTok/Google) هي نفس مصير أي حدث حقيقي.
 * 3) إرشادات عربية محددة حسب حالة الإعداد الحالية — مفيش تخمين.
 *
 * 🔒 Super Admin فقط. لا تُرجع أي أسرار — فقط "مضبوط/ناقص".
 * ملاحظة: الحدث الاختباري يتسجل في جدول TrackingEvent عادي (eventId
 * يبدأ بـ diag-) — يظهر في تبويب السجل كمثال حي للمسار الكامل.
 */
async function __POST() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const cfg = await getTrackingConfig()

  // حدث اختباري بمعرف فريد عبر المسار الحقيقي نفسه
  const eventId = `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const params: TrackingEventParams = {
    contentName: 'اختبار اتصال Nezam',
    contentType: 'diagnostic',
  }
  const result = await trackServerEvent({
    eventName: TRACKING_EVENTS.ViewContent,
    eventId,
    params,
  })

  // ── إرشادات مبنية على الحالة الفعلية (مرتبة حسب الأهمية) ──
  const hints: string[] = []

  if (!cfg.general.enabled) {
    hints.push('المفتاح الرئيسي «التتبع» مطفي — فعّله من تبويب الإعدادات واحفظ، ثم أعد الاختبار. وهو مطفي: لا يُرسل أي شيء لأي منصة إطلاقاً.')
  }
  if (cfg.general.consentManagement) {
    hints.push('إدارة الموافقة مفعّلة: بكسل Meta/TikTok لا يُحمَّل لأي زائر قبل أن يضغط «قبول التسويق» على بانر الكوكيز. للاختبار: افتح الموقع في متصفح جديد ووافق على الكوكيز التسويقية.')
  }
  if (cfg.general.testMode && cfg.meta.enabled && cfg.meta.capiToken && !cfg.meta.testEventCode) {
    hints.push('وضع الاختبار مفعّل بدون Test Event Code لـ Meta — أحداث السيرفر ستذهب لبيانات الإنتاج لا لتبويب Test Events. أدخل الكود أو أوقف وضع الاختبار.')
  }
  if (cfg.general.testMode && cfg.tiktok.enabled && cfg.tiktok.eventsApiToken && !cfg.tiktok.testEventCode) {
    hints.push('وضع الاختبار مفعّل بدون Test Event Code لـ TikTok — أحداث السيرفر ستذهب لبيانات الإنتاج. أدخل الكود من تبويب Test Events.')
  }

  if (cfg.meta.enabled) {
    if (!cfg.meta.pixelId) {
      hints.push('Meta: أدخل Pixel ID من Events Manager ← Data Sources (أرقام فقط).')
    } else if (!cfg.meta.capiToken) {
      hints.push('Meta: Conversions API Token ناقص — هذا أهم سبب لغياب الأحداث! بكسل المتصفح وحده لا يكفي؛ أحداث التسجيل/الدفع من السيرفر تتطلب التوكن. اجيبه من: Events Manager ← افتح البكسل ← Settings ← Conversions API ← Generate access token (ليس بريد/كلمة مرور).')
    }
  }
  if (cfg.tiktok.enabled) {
    if (!cfg.tiktok.pixelId) {
      hints.push('TikTok: أدخل Pixel ID من TikTok Events Manager ← Assets ← Events ← Web.')
    } else if (!cfg.tiktok.eventsApiToken) {
      hints.push('TikTok: Events API Token ناقص — أحداث السيرفر لن تصل. اجيبه من: TikTok Events Manager ← افتح مصدر الويب ← Settings ← Events API Tokens ← Generate.')
    }
  }
  if (cfg.google.enabled) {
    if (!cfg.google.ga4MeasurementId) {
      hints.push('Google: أدخل GA4 Measurement ID الذي يبدأ بـ G- من Analytics ← Admin ← Data Streams. ملاحظة: لا يوجد إيميل أو كلمة مرور في هذا النظام — كل المطلوب معرفات وتوكنات.')
    } else if (!cfg.google.ga4ApiSecret) {
      hints.push('Google: أحداث السيرفر لـ GA4 معطلة — أدخل API Secret من نفس صفحة الـ Data Stream ← Measurement Protocol API secrets ← Create (وهو ليس كلمة مرور حسابك).')
    }
  }

  const whereToLook: string[] = []
  if (cfg.general.testMode && cfg.meta.testEventCode) {
    whereToLook.push('Meta: افتح Events Manager ← Test Events — الحدث الاختباري يظهر هناك خلال ثوانٍ.')
  } else if (cfg.meta.enabled && cfg.meta.pixelId && cfg.meta.capiToken) {
    whereToLook.push('Meta: افتح Events Manager ← Overview/Events — الحدث يظهر خلال دقائق (Test Events لا يعرض أحداث الإنتاج العادية).')
  }
  if (cfg.general.testMode && cfg.tiktok.testEventCode) {
    whereToLook.push('TikTok: Events Manager ← Test Events.')
  }
  if (cfg.google.enabled && cfg.google.ga4MeasurementId && cfg.google.ga4ApiSecret) {
    whereToLook.push('GA4: Reports ← Realtime — الحدث (view_item) يظهر خلال ثوانٍ إلى دقيقة.')
  }

  return NextResponse.json({
    ok: true,
    eventId,
    checkedAt: new Date().toISOString(),
    config: {
      general: cfg.general,
      meta: {
        enabled: cfg.meta.enabled,
        pixelId: cfg.meta.pixelId,
        capiTokenSet: !!cfg.meta.capiToken,
        testEventCodeSet: !!cfg.meta.testEventCode,
      },
      tiktok: {
        enabled: cfg.tiktok.enabled,
        pixelId: cfg.tiktok.pixelId,
        eventsApiTokenSet: !!cfg.tiktok.eventsApiToken,
        testEventCodeSet: !!cfg.tiktok.testEventCode,
      },
      google: {
        enabled: cfg.google.enabled,
        ga4MeasurementId: cfg.google.ga4MeasurementId,
        ga4ApiSecretSet: !!cfg.google.ga4ApiSecret,
      },
    },
    results: result.results,
    hints,
    whereToLook,
  })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
