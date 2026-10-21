import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import {
  requireSuperAdmin,
  authErrorResponse,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
} from '@/lib/auth'
import { extractRequestContext } from '@/lib/tracking/server'
import { validateSubscriptionSetting } from '@/lib/subscription-settings'
import { validateNotificationSetting } from '@/lib/notification-settings'
import { loginKeys, isLoginBlocked, recordLoginFailure, clearLoginFailures } from '@/lib/login-guard'
import { logAudit } from '@/lib/audit'
import { TEMPLATE_DEFAULTS, EMAIL_ENABLED_KEY, validateTemplateSetting, isTemplateKey } from '@/lib/message-templates'

export const dynamic = 'force-dynamic'

const DEFAULTS: Record<string, string> = {
  platformName: 'نظام المحل',
  supportEmail: 'nezampos@gmail.com',
  supportPhone: '+201010328471',
  websiteUrl: 'https://nezampos.com',
  logoUrl: '',
  facebookUrl: '',
  twitterUrl: '',
  instagramUrl: '',
  whatsappUrl: 'https://wa.me/201010328471',
  // بانر تثبيت التطبيق (PWA) — 'true' = ظاهر لغير المثبّتين، 'false' = مخفي
  pwaInstallBannerEnabled: 'true',
  // ⚙️ الاشتراك: أيام السماح بعد الانتهاء (0 = بدون) + أيام تذكير التجديد قبل الانتهاء
  subscriptionGraceDays: '0',
  renewalReminderDays: '7',
  // 🔔 مدة الاحتفاظ بالإشعارات (أيام) — الأقدم بيتمسح تلقائيًا
  notificationRetentionDays: '30',
  // ✉️ الإيميل (Resend): تشغيل/إيقاف + قوالب الرسائل
  [EMAIL_ENABLED_KEY]: 'true',
  ...TEMPLATE_DEFAULTS,
}

// ── تحقق من القيم قبل الحفظ (يمنع javascript:/data: URLs وقيم ضخمة) ──
const MAX_LEN = 300
function isHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
/** يرجّع رسالة خطأ أو null لو القيمة سليمة */
function validateSetting(key: string, v: string): string | null {
  if (key === EMAIL_ENABLED_KEY || isTemplateKey(key)) return validateTemplateSetting(key, v)
  if (v.length > MAX_LEN) return `القيمة طويلة جدًا (${key})`
  if (v === '') return null
  switch (key) {
    case 'supportEmail':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'بريد الدعم غير صالح'
    case 'supportPhone':
      return /^[+\d\s\-()]{5,25}$/.test(v) ? null : 'رقم الدعم غير صالح'
    case 'logoUrl':
      // رابط نسبي من نفس الموقع (/logo.svg) أو http(s) — مش data:/javascript:
      return (/^\/(?!\/)/.test(v) || isHttpsUrl(v)) ? null : 'رابط الشعار غير صالح'
    case 'websiteUrl':
    case 'facebookUrl':
    case 'twitterUrl':
    case 'instagramUrl':
    case 'whatsappUrl':
      return isHttpsUrl(v) ? null : `الرابط غير صالح (${key}) — لازم يبدأ بـ https://`
    case 'subscriptionGraceDays':
    case 'renewalReminderDays':
      return validateSubscriptionSetting(key, v)
    case 'notificationRetentionDays':
      return validateNotificationSetting(key, v)
    case 'pwaInstallBannerEnabled':
      return v === 'true' || v === 'false' ? null : 'قيمة غير صالحة'
    default:
      return null
  }
}

async function __GET() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const rows = await db.platformSetting.findMany()
  const map: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) map[r.key] = r.value
  return NextResponse.json(map)
}

async function __PUT(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  // Allow password change in the same endpoint
  if (body.changePassword) {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مسموح' }, { status: 401 })
    }
    const currentPassword = String(body.currentPassword ?? '')
    const newPassword = String(body.newPassword ?? '')
    if (!currentPassword) {
      return NextResponse.json({ error: 'أدخل كلمة المرور الحالية' }, { status: 400 })
    }
    if (newPassword.length < 10 || newPassword.length > 128) {
      return NextResponse.json(
        { error: 'كلمة المرور الجديدة يجب أن تكون 10 أحرف على الأقل' },
        { status: 400 }
      )
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return NextResponse.json(
        { error: 'كلمة المرور الجديدة لازم تحتوي على حروف وأرقام' },
        { status: 400 }
      )
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: 'كلمة المرور الجديدة لازم تختلف عن الحالية' }, { status: 400 })
    }

    // نفس حد محاولات الدخول — يمنع تخمين الباسورد الحالي من جلسة مسروقة
    const keys = await loginKeys(session.email.toLowerCase(), extractRequestContext(req.headers).clientIp)
    if (await isLoginBlocked(keys)) {
      return NextResponse.json({ error: 'محاولات كتيرة — حاول بعد 15 دقيقة' }, { status: 429 })
    }
    const user = await db.user.findUnique({ where: { id: session.userId } })
    if (!user || !(await verifyPassword(currentPassword, user.password))) {
      await recordLoginFailure(keys)
      return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 400 })
    }
    await clearLoginFailures(keys.emailKey)

    const hash = await hashPassword(newPassword)
    await db.user.update({
      where: { id: user.id },
      data: { password: hash, passwordChangedAt: new Date() },
    })
    // كل الجلسات القديمة للأدمن بقت باطلة — بنصدر جلسة جديدة للجهاز الحالي بس
    await createSession({
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
      email: user.email,
      branchId: user.branchId ?? null,
      permissions: null,
      canViewProfits: true,
    })
    await logAudit({ action: 'auth.password_change', targetType: 'user', targetId: user.id }, req)
    return NextResponse.json({ ok: true, changedPassword: true })
  }

  const allowedKeys = Object.keys(DEFAULTS)
  // تحقق من كل القيم الأول — لو فيه قيمة غلط ما نحفظش حاجة (كل-أو-لا-شيء)
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      const err = validateSetting(key, String(body[key]).trim())
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }
  }
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      const value = String(body[key]).trim()
      await db.platformSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }
  }

  const changed: Record<string, string> = {}
  for (const key of allowedKeys) if (body[key] !== undefined) changed[key] = String(body[key]).trim()
  await logAudit({ action: 'settings.update', targetType: 'settings', details: { changed } }, req)
  const rows = await db.platformSetting.findMany()
  const map: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) map[r.key] = r.value
  return NextResponse.json({ ok: true, settings: map })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
