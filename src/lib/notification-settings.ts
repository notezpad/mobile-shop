/**
 * 🔔 إعدادات الإشعارات (من لوحة الأدمن → جدول PlatformSetting):
 *   - notificationRetentionDays : مدة الاحتفاظ بالإشعارات بالأيام (الأقدم بيتمسح تلقائيًا).
 *     الافتراضي 30، الحد الأدنى 7، الأقصى 365 (نفس حدود حقل لوحة الأدمن).
 *
 * ⚠️ الملف ده اتكتب من استخدامه في notifications.ts وAdminSettingsView وsettings/route.ts
 * (مكنش مرفق في zip الإيميل). لو عندك نسخة أصلية منه من زميلك استخدمها بدله.
 * دوال نقية من غير imports تقيلة (على نمط subscription-settings.ts).
 */
export const RETENTION_KEY = 'notificationRetentionDays'
export const DEFAULT_RETENTION_DAYS = 30
export const MIN_RETENTION_DAYS = 7
export const MAX_RETENTION_DAYS = 365

/** أي قيمة مش صالحة → الافتراضي 30؛ الأرقام بره الحدود بتتقصّ لأقرب حد. */
export function parseRetentionDays(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS
  return Math.min(Math.max(n, MIN_RETENTION_DAYS), MAX_RETENTION_DAYS)
}

/** صالح للحفظ؟ (يرجّع رسالة خطأ أو null) — بيستخدمها route الإعدادات. */
export function validateNotificationSetting(key: string, v: string): string | null {
  if (key === RETENTION_KEY) {
    return /^\d{1,3}$/.test(v) && Number(v) >= MIN_RETENTION_DAYS && Number(v) <= MAX_RETENTION_DAYS
      ? null
      : `مدة الاحتفاظ بالإشعارات: رقم من ${MIN_RETENTION_DAYS} إلى ${MAX_RETENTION_DAYS} يوم`
  }
  return null
}
