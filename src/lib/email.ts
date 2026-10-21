/**
 * إرسال الإيميل عبر Resend (REST — بدون مكتبات).
 * - المفتاح: Secret باسم RESEND_API_KEY (مش في الكود ولا الداتابيز). لو مش موجود → بيتخطى بهدوء.
 * - المرسل: EMAIL_FROM (اختياري) وإلا "Nezam POS <noreply@mail.nezampos.com>".
 * - حد يومي أقصى (EmailLog) عشان ما نعديش حد الخطة المجانية. الإرسال ما بيرميش أخطاء أبدًا.
 */
import type { Sql } from './sql'
import { readEnv } from './env'
import {
  EMAIL_ENABLED_KEY, TEMPLATE_DEFAULTS, tplKey, renderTemplate, type TemplateKind,
} from './message-templates'
import { SITE_URL, SITE_NAME, SITE_NAME_AR, SUPPORT_EMAIL, WHATSAPP } from './site'

const DEFAULT_FROM = 'Nezam POS <noreply@mail.nezampos.com>'
const DAILY_CAP = 90 // الخطة المجانية = 100/يوم (هامش أمان 10)
// 🛡️ حجز حصة: الترحيب والتجارب ماينفعش يستهلكوا الحد كله، فتذكيرات التجديد/الانتهاء (اللي بتحمي الإيراد)
// ليها آخر (DAILY_CAP - LOW_PRIORITY_CAP) = 30 إيميل محجوزين. أي نوع تاني بيقف عند LOW_PRIORITY_CAP.
const LOW_PRIORITY_CAP = 60
const HIGH_PRIORITY_KINDS = new Set(['renewal', 'expired'])
const SEND_TIMEOUT_MS = 10_000
const REPLY_TO_FALLBACK = SUPPORT_EMAIL

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function sha256(v: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v.trim().toLowerCase()))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 🎨 تصميم الإيميلات — هوية بصرية احترافية موحّدة لكل رسائل Resend.
 * تصميم بـ جداول (table-based) عشان يتوافق مع Outlook/Gmail/Apple Mail،
 * ألوان محسوبة حسب نوع الرسالة (ترحيب/تجديد/انتهاء)، وزرار دعوة لإجراء (CTA)
 * يودّي المستخدم على المكان الصح في الموقع.
 */
type EmailKind = TemplateKind | 'admin-test' | string

const KIND_STYLE: Record<
  string,
  { icon: string; title: string; from: string; to: string; solid: string; soft: string; cta: string; path: string }
> = {
  welcome: {
    icon: '🎉', title: 'أهلاً بك في نظام المحل',
    from: '#10b981', to: '#047857', solid: '#059669', soft: '#ecfdf5',
    cta: 'ابدأ الاستخدام الآن', path: '/login',
  },
  renewal: {
    icon: '⏰', title: 'تذكير بتجديد الاشتراك',
    from: '#f59e0b', to: '#d97706', solid: '#d97706', soft: '#fffbeb',
    cta: 'جدّد الاشتراك الآن', path: '/settings',
  },
  expired: {
    icon: '⚠️', title: 'انتهى اشتراكك',
    from: '#ef4444', to: '#dc2626', solid: '#dc2626', soft: '#fef2f2',
    cta: 'جدّد الآن', path: '/settings',
  },
}
const DEFAULT_STYLE = {
  icon: '📩', title: `رسالة من ${SITE_NAME_AR}`,
  from: '#10b981', to: '#047857', solid: '#059669', soft: '#ecfdf5',
  cta: 'فتح الموقع', path: '/',
}

function toHtml(body: string, kind: EmailKind, subject: string): string {
  const style = KIND_STYLE[kind as string] ?? DEFAULT_STYLE
  const paras = esc(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  const preheader = body.replace(/\s+/g, ' ').trim().slice(0, 110)
  const ctaUrl = `${SITE_URL}${style.path}`
  const year = new Date().getFullYear()

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f4;font-family:Tahoma,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f4;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

  <tr><td style="height:6px;line-height:6px;font-size:0;background-color:${style.solid};background-image:linear-gradient(90deg,${style.from},${style.to});">&nbsp;</td></tr>

  <tr><td style="padding:28px 32px 0 32px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px auto;">
      <tr><td bgcolor="#059669" style="width:54px;height:54px;border-radius:14px;background-color:#059669;background-image:linear-gradient(135deg,#10b981,#047857);text-align:center;vertical-align:middle;">
        <span style="font-family:Arial,sans-serif;font-size:26px;font-weight:bold;color:#ffffff;">N</span>
      </td></tr>
    </table>
    <div style="font-size:13px;color:#6b7280;">${SITE_NAME}<span style="margin:0 6px;color:#d1d5db;">•</span>${SITE_NAME_AR}</div>
  </td></tr>

  <tr><td style="padding:22px 32px 4px 32px;text-align:center;">
    <div style="font-size:36px;line-height:1;margin-bottom:12px;">${style.icon}</div>
    <div style="font-size:21px;font-weight:bold;color:#111827;">${esc(style.title)}</div>
  </td></tr>

  <tr><td style="padding:16px 32px 6px 32px;">
    <div style="font-size:15px;line-height:1.9;color:#374151;text-align:right;direction:rtl;">${paras}</div>
  </td></tr>

  <tr><td style="padding:10px 32px 6px 32px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr><td bgcolor="${style.solid}" style="border-radius:10px;background-color:${style.solid};">
        <a href="${ctaUrl}" style="display:inline-block;padding:13px 36px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(style.cta)}</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 32px 0 32px;">
    <div style="border-top:1px solid #e5e7eb;line-height:0;font-size:0;">&nbsp;</div>
  </td></tr>

  <tr><td style="padding:18px 32px 28px 32px;text-align:center;">
    <div style="font-size:12.5px;color:#9ca3af;line-height:1.9;">
      لأي استفسار راسلنا على
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>
      ${WHATSAPP ? `أو واتساب <span dir="ltr">${esc(WHATSAPP)}</span>` : ''}
      <br>© ${year} ${SITE_NAME} — جميع الحقوق محفوظة
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

export type SendResult = { ok: boolean; skipped?: string; error?: string }

/** سطر في EmailLog (الفشل ما بيرميش). الحالة: sent | failed. */
async function logEmail(
  sql: Sql, tenantId: string | null | undefined, to: string, kind: string, status: 'sent' | 'failed', error: string | null,
): Promise<void> {
  try {
    await sql`
      INSERT INTO "EmailLog" ("tenantId", "toHash", "kind", "status", "error")
      VALUES (${tenantId ?? null}, ${await sha256(to)}, ${kind}, ${status}, ${error})`
  } catch { /* ignore */ }
}

export async function sendEmail(
  sql: Sql,
  opts: { to: string; subject: string; text: string; kind: string; tenantId?: string | null; replyTo?: string },
): Promise<SendResult> {
  try {
    const key = readEnv('RESEND_API_KEY')
    if (!key) return { ok: false, skipped: 'no_api_key' }
    const to = opts.to.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      // بنسجّله كمحاولة فاشلة عشان إعادة المحاولة (ensureOwnerEmail) توقف بعد ٣ مرات بدل ما تكرر للأبد
      await logEmail(sql, opts.tenantId, to, opts.kind, 'failed', 'bad_address')
      return { ok: false, skipped: 'bad_address' }
    }

    // الحد اليومي: آخر ٢٤ ساعة (fail-open لو الجدول لسه مش موجود — Resend نفسه بيرفض لو عدّينا)
    const cap = HIGH_PRIORITY_KINDS.has(opts.kind) ? DAILY_CAP : LOW_PRIORITY_CAP
    try {
      const c = await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "EmailLog"
        WHERE "createdAt" > now() - interval '24 hours' AND "status" = 'sent'`
      if ((c[0]?.n ?? 0) >= cap) return { ok: false, skipped: 'daily_cap' }
    } catch { /* table missing */ }

    let ok = false
    let error: string | null = null
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        body: JSON.stringify({
          from: readEnv('EMAIL_FROM') || DEFAULT_FROM,
          to: [to],
          // سطر واحد دايمًا (اسم المحل جاي من المستخدم)
          subject: opts.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200),
          text: opts.text,
          html: toHtml(opts.text, opts.kind, opts.subject),
          reply_to: opts.replyTo || REPLY_TO_FALLBACK,
        }),
      })
      ok = res.ok
      if (!ok) error = `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`
    } catch (e) {
      // timeout / شبكة: بنسجّلها فاشلة عشان تتحسب في حد المحاولات (مش بتتكرر للأبد)
      error = `network: ${e instanceof Error ? e.message : 'fetch failed'}`.slice(0, 200)
    }
    await logEmail(sql, opts.tenantId, to, opts.kind, ok ? 'sent' : 'failed', error)
    if (!ok) console.error('[email] send failed:', error)
    return ok ? { ok: true } : { ok: false, error: error ?? 'failed' }
  } catch (e) {
    console.error('[email] unexpected:', e)
    return { ok: false, error: 'exception' }
  }
}

export async function loadTemplateConfig(sql: Sql): Promise<Record<string, string>> {
  const map: Record<string, string> = { ...TEMPLATE_DEFAULTS, [EMAIL_ENABLED_KEY]: 'true', platformName: 'نظام المحل', supportEmail: REPLY_TO_FALLBACK }
  try {
    const rows = await sql<{ key: string; value: string }[]>`
      SELECT "key", "value" FROM "PlatformSetting"
      WHERE "key" LIKE 'tpl\\_%' OR "key" IN (${EMAIL_ENABLED_KEY}, 'platformName', 'supportEmail')`
    for (const r of rows) if (r.value !== '' || !(r.key in TEMPLATE_DEFAULTS)) map[r.key] = r.value
  } catch (e) {
    console.error('[email] config read failed (defaults):', e)
  }
  return map
}

/** يبني الرسالة من القالب ويبعتها. المتغيرات: shopName/ownerName/planName/daysLeft/endDate */
export async function sendTemplatedEmail(
  sql: Sql,
  kind: TemplateKind,
  to: string | null | undefined,
  tenantId: string,
  vars: Record<string, string | number | undefined>,
): Promise<SendResult> {
  if (!to) return { ok: false, skipped: 'no_recipient' }
  const cfg = await loadTemplateConfig(sql)
  if (cfg[EMAIL_ENABLED_KEY] === 'false') return { ok: false, skipped: 'disabled' }
  const all = { platformName: cfg.platformName, supportEmail: cfg.supportEmail, ...vars }
  return sendEmail(sql, {
    to,
    kind,
    tenantId,
    subject: renderTemplate(cfg[tplKey(kind, 'subject')], all),
    text: renderTemplate(cfg[tplKey(kind, 'body')], all),
    replyTo: cfg.supportEmail,
  })
}

export const fmtArDate = (d: Date) =>
  d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo' })
