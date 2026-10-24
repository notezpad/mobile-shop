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
const LOW_PRIORITY_CAP = 60
const HIGH_PRIORITY_KINDS = new Set(['renewal', 'expired', 'password-reset'])
const SEND_TIMEOUT_MS = 10_000
const REPLY_TO_FALLBACK = SUPPORT_EMAIL

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function sha256(v: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v.trim().toLowerCase()))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

type EmailKind = TemplateKind | 'admin-test' | string
type EmailVars = Record<string, string | number | undefined>

const KIND_STYLE: Record<
  string,
  {
    icon: string; title: string; subtitle: string
    from: string; via: string; to: string; solid: string; dark: string
    cta: string; path: string
  }
> = {
  welcome: {
    icon: '🚀', title: 'أهلاً بيك معانا', subtitle: 'حسابك جاهز، وتجربتك المجانية بدأت',
    from: '#34d399', via: '#10b981', to: '#047857', solid: '#059669', dark: '#065f46',
    cta: 'ابدأ الاستخدام الآن', path: '/login',
  },
  renewal: {
    icon: '⏳', title: 'اشتراكك قرب يخلّص', subtitle: 'جدّد دلوقتي عشان متقفش الخدمة عنك',
    from: '#fbbf24', via: '#f59e0b', to: '#b45309', solid: '#d97706', dark: '#92400e',
    cta: 'جدّد الاشتراك الآن', path: '/settings',
  },
  'password-reset': {
    icon: '🔑', title: 'استعادة كلمة المرور', subtitle: 'اضغط على الزر وعيّن كلمة مرور جديدة',
    from: '#34d399', via: '#10b981', to: '#047857', solid: '#059669', dark: '#065f46',
    cta: 'تعيين كلمة مرور جديدة', path: '/forgot-password',
  },
  expired: {
    icon: '🚨', title: 'اشتراكك انتهى', subtitle: 'جدّد عشان ترجع تستخدم النظام فوراً',
    from: '#f87171', via: '#ef4444', to: '#b91c1c', solid: '#dc2626', dark: '#991b1b',
    cta: 'جدّد الآن', path: '/settings',
  },
}
const DEFAULT_STYLE = {
  icon: '📩', title: SITE_NAME_AR, subtitle: 'رسالة آلية من النظام',
  from: '#34d399', via: '#10b981', to: '#047857', solid: '#059669', dark: '#065f46',
  cta: 'فتح الموقع', path: '/',
}

function detailRows(vars: EmailVars | undefined): { label: string; value: string }[] {
  if (!vars) return []
  const rows: { label: string; value: string }[] = []
  if (vars.shopName) rows.push({ label: 'اسم المحل', value: String(vars.shopName) })
  if (vars.planName) rows.push({ label: 'الباقة الحالية', value: String(vars.planName) })
  if (vars.endDate) rows.push({ label: 'تاريخ الانتهاء', value: String(vars.endDate) })
  if (vars.daysLeft !== undefined && vars.daysLeft !== null && vars.daysLeft !== '') {
    const n = Number(vars.daysLeft)
    rows.push({ label: 'الأيام المتبقية', value: Number.isFinite(n) ? `${n} ${n === 1 ? 'يوم' : 'أيام'}` : String(vars.daysLeft) })
  }
  return rows
}

function toHtml(body: string, kind: EmailKind, subject: string, vars?: EmailVars, ctaUrlOverride?: string): string {
  const style = KIND_STYLE[kind as string] ?? DEFAULT_STYLE
  // زيادة حجم الخط، سماكة الخط، والمسافات بين السطور
  const paras = esc(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 22px 0;font-size:17px;line-height:1.9;color:#1e293b;font-weight:500;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  const preheader = body.replace(/\s+/g, ' ').trim().slice(0, 110)
  const ctaUrl = ctaUrlOverride ? esc(ctaUrlOverride) : `${SITE_URL}${style.path}`
  const year = new Date().getFullYear()
  const rows = detailRows(vars)

  const detailCard = rows.length
    ? `<tr><td style="padding:0 32px 28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="detail-card" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;border-right:5px solid ${style.solid};">
      <tr>
        <td colspan="2" style="padding:18px 22px 10px 22px;font-size:13px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">تفاصيل الحساب</td>
      </tr>
      ${rows.map((r, i) => `
      <tr>
        <td style="padding:12px 22px;font-size:15px;color:#475569;font-weight:600;" class="muted-text">${esc(r.label)}</td>
        <td align="left" style="padding:12px 22px;font-size:16px;font-weight:800;color:#0f172a;text-align:left;" class="body-text">${esc(r.value)}</td>
      </tr>${i < rows.length - 1 ? `<tr><td colspan="2" style="padding:0 22px;"><div style="border-top:1px dashed #cbd5e1;line-height:0;font-size:0;" class="divider">&nbsp;</div></td></tr>` : ''}`).join('')}
    </table>
  </td></tr>`
    : ''

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<!--[if mso]>
<style>
  table,td,div,h1,p,a{font-family:Tahoma,Arial,sans-serif !important;}
  .mso-hide { display: none !important; }
</style>
<![endif]-->
<style>
  body, table, td { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { border:0; outline:none; -ms-interpolation-mode:bicubic; }
  a { -webkit-text-size-adjust:100%; }
  @media (max-width:600px) {
    .container { width:100% !important; border-radius:0 !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .hero-px { padding:36px 24px 40px 24px !important; }
    .cta-btn { width:100% !important; display:block !important; text-align:center !important; padding:18px 0 !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background-color:#0f172a !important; }
    .card { background-color:#1e293b !important; border-color:#334155 !important; }
    .body-text { color:#f8fafc !important; }
    .muted-text { color:#94a3b8 !important; }
    .divider { border-color:#334155 !important; }
    .detail-card { background-color:#0f172a !important; border-color:#334155 !important; border-right-color:${style.from} !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#f1f5f9;font-family:Tahoma,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.15);overflow:hidden;border:1px solid #e2e8f0;">

  <!-- Hero -->
  <tr><td class="hero-px" style="padding:44px 36px 48px 36px;background-color:${style.solid};background-image:linear-gradient(135deg,${style.from} 0%,${style.via} 50%,${style.to} 100%);text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
      <tr><td style="padding:8px 20px;border-radius:999px;background-color:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);">
        <span style="font-family:Tahoma,Arial,sans-serif;font-size:13px;font-weight:bold;color:#ffffff;letter-spacing:.5px;">${SITE_NAME} &nbsp;•&nbsp; ${SITE_NAME_AR}</span>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px auto;">
      <tr><td style="width:90px;height:90px;border-radius:50%;background-color:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.3);text-align:center;vertical-align:middle;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <span style="font-size:44px;line-height:90px;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.2));">${style.icon}</span>
      </td></tr>
    </table>
    <h1 style="font-family:Tahoma,Arial,sans-serif;font-size:30px;line-height:1.4;font-weight:900;color:#ffffff;margin:0 0 12px 0;text-shadow:0 2px 5px rgba(0,0,0,0.15);">${esc(style.title)}</h1>
    <div style="font-size:17px;font-weight:600;color:rgba(255,255,255,.95);">${esc(style.subtitle)}</div>
  </td></tr>

  <!-- Body Content -->
  <tr><td class="px" style="padding:40px 36px 15px 36px;">
    <div class="body-text" style="font-size:17px;line-height:1.9;color:#1e293b;text-align:right;direction:rtl;">${paras}</div>
  </td></tr>

  <!-- Detail Card -->
  ${detailCard}

  <!-- CTA Button -->
  <tr><td class="px" style="padding:20px 36px 40px 36px;text-align:center;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="border-radius:14px;background-color:${style.solid};background-image:linear-gradient(135deg,${style.via},${style.to});box-shadow:0 10px 25px -5px ${style.solid};">
            <a href="${ctaUrl}" class="cta-btn" style="display:inline-block;padding:18px 56px;font-family:Tahoma,Arial,sans-serif;font-size:18px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:14px;border:1px solid rgba(255,255,255,0.15);letter-spacing:0.5px;">
              ${esc(style.cta)} &nbsp;←
            </a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Divider -->
  <tr><td class="px" style="padding:0 36px;">
    <div class="divider" style="border-top:1px solid #e2e8f0;line-height:0;font-size:0;">&nbsp;</div>
  </td></tr>

  <!-- Footer -->
  <tr><td class="px" style="padding:28px 36px 36px 36px;text-align:center;">
    <div class="muted-text" style="font-size:14px;color:#64748b;line-height:1.9;">
      لأي استفسار أو مساعدة، فريق الدعم جاهز ليك دايماً<br>
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${style.dark};text-decoration:none;font-weight:bold;">${SUPPORT_EMAIL}</a>
      ${WHATSAPP ? `<br>أو واتساب: <span dir="ltr" style="font-weight:bold;">${esc(WHATSAPP)}</span>` : ''}
      <br><br>
      <span style="font-size:13px;color:#94a3b8;">© ${year} ${SITE_NAME} — جميع الحقوق محفوظة</span>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

export type SendResult = { ok: boolean; skipped?: string; error?: string }

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
  opts: { to: string; subject: string; text: string; kind: string; tenantId?: string | null; replyTo?: string; ctaUrl?: string },
): Promise<SendResult> {
  try {
    const key = readEnv('RESEND_API_KEY')
    if (!key) return { ok: false, skipped: 'no_api_key' }
    const to = opts.to.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      await logEmail(sql, opts.tenantId, to, opts.kind, 'failed', 'bad_address')
      return { ok: false, skipped: 'bad_address' }
    }

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
          subject: opts.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200),
          // النسخة النصية بتشيل الرابط صراحةً (للعملاء اللي مابيعرضوش HTML)
          text: opts.ctaUrl ? `${opts.text}\n\n${opts.ctaUrl}` : opts.text,
          html: toHtml(opts.text, opts.kind, opts.subject, undefined, opts.ctaUrl),
          reply_to: opts.replyTo || REPLY_TO_FALLBACK,
        }),
      })
      ok = res.ok
      if (!ok) error = `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`
    } catch (e) {
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