/**
 * صلح القيم قبل التحقق/الحفظ — بدل ما نرفض التعديل كله.
 * - رقم واتساب لوحده (010... / +20 10... / 2010...) → https://wa.me/20...
 * - رابط من غير https:// → بيتضاف له https://
 * - أرقام عربية (٠١٢) → أرقام لاتينية (012)
 * الأرقام اللي تبدأ بصفر = مصر (كود 20). رقم من دولة تانية؟ اكتبه بكود الدولة.
 * ملف نقي (من غير imports) عشان يتعمله اختبار مباشر.
 */
export const URL_KEYS = new Set(['websiteUrl', 'facebookUrl', 'twitterUrl', 'instagramUrl', 'whatsappUrl'])
export const NUMERIC_KEYS = new Set(['supportPhone', 'subscriptionGraceDays', 'renewalReminderDays', 'notificationRetentionDays'])
const EGYPT_CODE = '20'

/** أرقام عربية/فارسية → لاتينية */
export function toLatinDigits(v: string): string {
  return v
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** رقم تليفون → رابط wa.me. null لو مش رقم واضح. */
export function phoneToWaLink(raw: string): string | null {
  const t = raw.trim()
  // فيه / أو : → ده رابط مش رقم، سيبيه لمسار الروابط
  if (/[/:]/.test(t)) return null
  const digits = toLatinDigits(t).replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!/^\d{6,15}$/.test(digits)) return null
  let d = digits
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = EGYPT_CODE + d.slice(1)
  return `https://wa.me/${d}`
}

/** يرجّع القيمة مصحّحة. لو مش قادرة تتصلح، بيرجّعها زي ما هي والرسالة اللي بعدها تشرح المطلوب. */
export function normalizeSetting(key: string, raw: unknown): string {
  let v = toLatinDigits(String(raw ?? '')).trim()
  if (NUMERIC_KEYS.has(key)) return v.replace(/\s+/g, ' ')
  if (!URL_KEYS.has(key) || v === '') return v
  if (key === 'whatsappUrl') {
    const wa = phoneToWaLink(v)
    if (wa) return wa
    // wa.me/010... (برقم محلي أو من غير بروتوكول) → wa.me/2010...
    v = v.replace(/^(?:https?:\/\/)?(?:www\.)?wa\.me\//i, 'https://wa.me/')
    v = v.replace(/^(https:\/\/wa\.me\/)0+(\d)/, `$1${EGYPT_CODE}$2`)
  }
  if (/^\/\//.test(v)) v = 'https:' + v
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v.replace(/^\/+/, '')
  return v
}

/** الرسالة اللي تظهر للأدمن لو القيمة لسه غلط بعد التصليح */
export function urlHint(key: string): string {
  return key === 'whatsappUrl'
    ? 'رابط واتساب غير صالح — اكتب رقم كامل مثل 01010328471 أو رابط كامل مثل https://wa.me/201010328471'
    : `الرابط غير صالح — اكتبه كامل مثل https://example.com (${key})`
}
