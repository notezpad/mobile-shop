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

const DEFAULT_FROM = 'Nezam POS <noreply@mail.nezampos.com>'
const DAILY_CAP = 90 // الخطة المجانية = 100/يوم (هامش أمان 10)
// 🛡️ حجز حصة: الترحيب والتجارب ماينفعش يستهلكوا الحد كله، فتذكيرات التجديد/الانتهاء (اللي بتحمي الإيراد)
// ليها آخر (DAILY_CAP - LOW_PRIORITY_CAP) = 30 إيميل محجوزين. أي نوع تاني بيقف عند LOW_PRIORITY_CAP.
const LOW_PRIORITY_CAP = 60
const HIGH_PRIORITY_KINDS = new Set(['renewal', 'expired'])
const SEND_TIMEOUT_MS = 10_000
const REPLY_TO_FALLBACK = 'nezampos@gmail.com'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function sha256(v: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v.trim().toLowerCase()))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toHtml(body: string): string {
  const paras = esc(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f4f5;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px;font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8;color:#111;direction:rtl;text-align:right">${paras}</div></body></html>`
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
          html: toHtml(opts.text),
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
