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
 * هيدر متدرّج حسب نوع الرسالة (ترحيب/تجديد/انتهاء)، كرت بيانات (المحل/الباقة/التاريخ)
 * لو المتغيرات متاحة، زرار دعوة لإجراء (CTA)، ودعم الوضع الداكن.
 */
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
    icon: '🎉', title: 'أهلاً بيك معانا', subtitle: 'حسابك جاهز وتجربتك المجانية بدأت',
    from: '#34d399', via: '#10b981', to: '#047857', solid: '#059669', dark: '#065f46',
    cta: 'ابدأ الاستخدام الآن', path: '/login',
  },
  renewal: {
    icon: '⏰', title: 'اشتراكك قرب يخلّص', subtitle: 'جدّد دلوقتي قبل ما الخدمة تتوقف',
    from: '#fbbf24', via: '#f59e0b', to: '#b45309', solid: '#d97706', dark: '#92400e',
    cta: 'جدّد الاشتراك الآن', path: '/settings',
  },
  expired: {
    icon: '⚠️', title: 'اشتراكك انتهى', subtitle: 'جدّد عشان ترجع تستخدم النظام تاني',
    from: '#f87171', via: '#ef4444', to: '#b91c1c', solid: '#dc2626', dark: '#991b1b',
    cta: 'جدّد الآن', path: '/settings',
  },
}
const DEFAULT_STYLE = {
  icon: '📩', title: SITE_NAME_AR, subtitle: 'رسالة آلية من النظام',
  from: '#34d399', via: '#10b981', to: '#047857', solid: '#059669', dark: '#065f46',
  cta: 'فتح الموقع', path: '/',
}

/** صف واحد في كرت البيانات (المحل/الباقة/تاريخ الانتهاء/الأيام المتبقية). */
function detailRows(vars: EmailVars | undefined): { label: string; value: string }[] {
  if (!vars) return []
  const rows: { label: string; value: string }[] = []
  if (vars.shopName) rows.push({ label: 'المحل', value: String(vars.shopName) })
  if (vars.planName) rows.push({ label: 'الباقة', value: String(vars.planName) })
  if (vars.endDate) rows.push({ label: 'تاريخ الانتهاء', value: String(vars.endDate) })
  if (vars.daysLeft !== undefined && vars.daysLeft !== null && vars.daysLeft !== '') {
    const n = Number(vars.daysLeft)
    rows.push({ label: 'الأيام المتبقية', value: Number.isFinite(n) ? `${n} ${n === 1 ? 'يوم' : 'أيام'}` : String(vars.daysLeft) })
  }
  return rows
}

function toHtml(body: string, kind: EmailKind, subject: string, vars?: EmailVars): string {
  const style = KIND_STYLE[kind as string] ?? DEFAULT_STYLE
  const paras = esc(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  const preheader = body.replace(/\s+/g, ' ').trim().slice(0, 110)
  const ctaUrl = `${SITE_URL}${style.path}`
  const year = new Date().getFullYear()
  const rows = detailRows(vars)

  const detailCard = rows.length
    ? `<tr><td style="padding:4px 32px 4px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="detail-card" style="background-color:#f9fafb;border:1px solid #eef0ed;border-radius:12px;">
      ${rows.map((r, i) => `
      <tr>
        <td style="padding:${i === 0 ? '14' : '8'}px 18px ${i === rows.length - 1 ? '14' : '8'}px 18px;font-size:13.5px;color:#6b7280;" class="muted-text">${esc(r.label)}</td>
        <td align="left" style="padding:${i === 0 ? '14' : '8'}px 18px ${i === rows.length - 1 ? '14' : '8'}px 18px;font-size:13.5px;font-weight:bold;color:#111827;text-align:left;" class="body-text">${esc(r.value)}</td>
      </tr>${i < rows.length - 1 ? `<tr><td colspan="2" style="padding:0 18px;"><div style="border-top:1px solid #eef0ed;line-height:0;font-size:0;" class="divider">&nbsp;</div></td></tr>` : ''}`).join('')}
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
<style>table,td,div,h1,p,a{font-family:Tahoma,Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  body, table, td { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { border:0; outline:none; -ms-interpolation-mode:bicubic; }
  a { -webkit-text-size-adjust:100%; }
  @media (max-width:600px) {
    .container { width:100% !important; border-radius:0 !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .hero-px { padding:30px 22px 34px 22px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background-color:#0c1210 !important; }
    .card { background-color:#151b19 !important; border-color:#242c29 !important; }
    .body-text { color:#e5e7eb !important; }
    .muted-text { color:#9aa39e !important; }
    .divider { border-color:#242c29 !important; }
    .detail-card { background-color:#10171410 !important; border-color:#242c29 !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#eef1ef;font-family:Tahoma,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background-color:#eef1ef;">
<tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px;max-width:600px;">

  <!-- Hero -->
  <tr><td class="hero-px" style="padding:38px 36px 42px 36px;border-radius:20px 20px 0 0;background-color:${style.solid};background-image:linear-gradient(135deg,${style.from} 0%,${style.via} 45%,${style.to} 100%);text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px auto;">
      <tr><td style="padding:7px 16px;border-radius:999px;background-color:rgba(255,255,255,.16);">
        <span style="font-family:Arial,sans-serif;font-size:12.5px;font-weight:bold;color:#ffffff;letter-spacing:.3px;">${SITE_NAME} &nbsp;•&nbsp; ${SITE_NAME_AR}</span>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 18px auto;">
      <tr><td style="width:76px;height:76px;border-radius:50%;background-color:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);text-align:center;vertical-align:middle;">
        <span style="font-size:36px;line-height:76px;">${style.icon}</span>
      </td></tr>
    </table>
    <div style="font-family:Arial,sans-serif;font-size:23px;line-height:1.4;font-weight:bold;color:#ffffff;">${esc(style.title)}</div>
    <div style="font-size:14px;margin-top:6px;color:rgba(255,255,255,.88);">${esc(style.subtitle)}</div>
  </td></tr>

  <!-- Card -->
  <tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="background-color:#ffffff;border:1px solid #e7e9e7;border-top:none;border-radius:0 0 20px 20px;">

    <tr><td class="px" style="padding:30px 36px 6px 36px;">
      <div class="body-text" style="font-size:15px;line-height:1.95;color:#374151;text-align:right;direction:rtl;">${paras}</div>
    </td></tr>

    ${detailCard}

    <tr><td class="px" style="padding:22px 36px 8px 36px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td bgcolor="${style.solid}" style="border-radius:11px;background-color:${style.solid};background-image:linear-gradient(135deg,${style.via},${style.to});">
          <a href="${ctaUrl}" style="display:inline-block;padding:15px 42px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:11px;">${esc(style.cta)} &nbsp;←</a>
        </td></tr>
      </table>
    </td></tr>

    <tr><td class="px" style="padding:26px 36px 0 36px;">
      <div class="divider" style="border-top:1px solid #eef0ed;line-height:0;font-size:0;">&nbsp;</div>
    </td></tr>

    <tr><td class="px" style="padding:18px 36px 30px 36px;text-align:center;">
      <div class="muted-text" style="font-size:12.5px;color:#9ca3af;line-height:1.9;">
        لأي استفسار راسلنا على
        <a href="mailto:${SUPPORT_EMAIL}" style="color:${style.dark};text-decoration:none;font-weight:bold;">${SUPPORT_EMAIL}</a>
        ${WHATSAPP ? `أو واتساب <span dir="ltr">${esc(WHATSAPP)}</span>` : ''}
        <br>© ${year} ${SITE_NAME} — جميع الحقوق محفوظة
      </div>
    </td></tr>

  </table>
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