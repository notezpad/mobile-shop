/**
 * قوالب الرسائل (إيميل / إشعارات) — قابلة للتعديل من لوحة الأدمن (PlatformSetting).
 * دوال نقية بدون imports. القيمة الفاضية = استخدم النص الافتراضي المدمج.
 *
 * المتغيرات: {shopName} {ownerName} {planName} {daysLeft} {endDate} {platformName} {supportEmail}
 */
export type TemplateKind = 'welcome' | 'renewal' | 'expired'

export const TEMPLATE_KINDS: TemplateKind[] = ['welcome', 'renewal', 'expired']
export const TEMPLATE_VARS = ['shopName', 'ownerName', 'planName', 'daysLeft', 'endDate', 'platformName', 'supportEmail'] as const
export const EMAIL_ENABLED_KEY = 'emailNotificationsEnabled'
export const MAX_SUBJECT = 150
export const MAX_BODY = 2000

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  welcome: 'رسالة الترحيب (عند التسجيل)',
  renewal: 'تذكير التجديد (قبل الانتهاء)',
  expired: 'انتهاء الاشتراك',
}

export const TEMPLATE_DEFAULTS: Record<string, string> = {
  tpl_welcome_subject: 'أهلاً بك في {platformName} 🎉',
  tpl_welcome_body:
    'أهلاً {ownerName}،\n\nتم إنشاء حساب محل "{shopName}" بنجاح، وتجربتك المجانية بدأت على باقة "{planName}" وتنتهي في {endDate}.\n\nلو احتجت أي مساعدة تواصل معنا على {supportEmail}.\n\nبالتوفيق،\nفريق {platformName}',
  tpl_renewal_subject: 'اشتراكك ينتهي خلال {daysLeft} يوم — {shopName}',
  tpl_renewal_body:
    'أهلاً {ownerName}،\n\nاشتراك محل "{shopName}" في باقة "{planName}" ينتهي بتاريخ {endDate} (متبقي {daysLeft} يوم).\n\nجدّد الآن لتجنب انقطاع الخدمة. لأي استفسار: {supportEmail}\n\nفريق {platformName}',
  tpl_expired_subject: 'انتهى اشتراك محل {shopName}',
  tpl_expired_body:
    'أهلاً {ownerName}،\n\nانتهى اشتراك محل "{shopName}" في باقة "{planName}" بتاريخ {endDate}.\n\nتقدر تجدد باستخدام كود تفعيل أو بالتواصل معنا على {supportEmail}.\n\nفريق {platformName}',
}

export const tplKey = (kind: TemplateKind, part: 'subject' | 'body') => `tpl_${kind}_${part}`

export function isTemplateKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_DEFAULTS, key)
}

export function validateTemplateSetting(key: string, v: string): string | null {
  if (key === EMAIL_ENABLED_KEY) return v === 'true' || v === 'false' ? null : 'قيمة غير صالحة'
  if (!isTemplateKey(key)) return null
  const max = key.endsWith('_subject') ? MAX_SUBJECT : MAX_BODY
  if (v.length > max) return `النص طويل جدًا (الحد ${max} حرف)`
  if (/[\r\n]/.test(v) && key.endsWith('_subject')) return 'عنوان الرسالة لازم يكون سطر واحد'
  return null
}

/** يستبدل {var} بقيمها. المتغيرات المجهولة بتفضل زي ما هي. */
export function renderTemplate(tpl: string, vars: Record<string, string | number | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])))
}
