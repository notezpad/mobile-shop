import { db } from '@/lib/db'

/**
 * 🛡️ 2026-10-12 — Signup abuse guard.
 *
 * Why: signup used to accept any syntactically-valid email, with no phone,
 * no per-IP limit, and no check that the same person had already used a
 * free trial. Each new email = a fresh 14-day trial on a paid plan.
 *
 * What lives here (all pure helpers except the DB / network ones, which
 * FAIL OPEN — a guard outage must never block a legitimate signup):
 *   - Egyptian mobile normalization + variants (for matching old rows)
 *   - email normalization (gmail dots / plus-alias) + disposable blocklist
 *   - MX lookup over DNS-over-HTTPS (kills fake domains like "gf.hh")
 *   - per-IP signup rate limit (hashed IP, table "SignupAttempt")
 *   - "has this phone / email already had a trial?" lookup
 */

// ─────────────────────────────────────────────────────────────
// Phone
// ─────────────────────────────────────────────────────────────

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => {
    const a = ARABIC_DIGITS.indexOf(c)
    if (a >= 0) return String(a)
    const p = PERSIAN_DIGITS.indexOf(c)
    return p >= 0 ? String(p) : c
  })
}

/**
 * Accepts: 01012345678 / +201012345678 / 00201012345678 / 201012345678,
 * with spaces/dashes and Arabic-Indic digits. Returns the canonical local
 * form "01xxxxxxxxx" or null if it is not an Egyptian mobile number
 * (010 / 011 / 012 / 015 + 8 digits).
 */
export function normalizeEgyptPhone(raw: unknown): string | null {
  let s = toLatinDigits(String(raw ?? '')).replace(/[\s\-().]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('0020')) s = s.slice(4)
  else if (s.startsWith('20') && s.length === 12) s = s.slice(2)
  if (s.length === 10 && s.startsWith('1')) s = '0' + s
  return /^01[0125]\d{8}$/.test(s) ? s : null
}

/** Every spelling an older row might have stored for the same number. */
export function phoneVariants(normalized: string): string[] {
  const rest = normalized.slice(1) // 1xxxxxxxxx
  return [normalized, `+20${rest}`, `20${rest}`, `0020${rest}`, `+20 ${rest}`]
}

// ─────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/** Providers we trust to have MX records — skip the network lookup. */
const KNOWN_GOOD_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com',
  'proton.me', 'protonmail.com',
])

/** Small blocklist of throwaway-mail providers (not exhaustive by design). */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org',
  'temp-mail.io', 'throwawaymail.com', 'yopmail.com', 'yopmail.net',
  'trashmail.com', 'getnada.com', 'nada.email', 'maildrop.cc', 'dispostable.com',
  'fakeinbox.com', 'mailnesia.com', 'mintemail.com', 'moakt.com', 'emailondeck.com',
  'tempail.com', 'burnermail.io', 'spamgourmet.com', 'mohmal.com', 'tmpmail.org',
  'discard.email', 'mail.tm', 'inboxkitten.com', 'tempinbox.com', 'fexbox.org',
])

export interface ParsedEmail {
  email: string          // as typed (lower-cased) — what we store & log in with
  local: string
  domain: string
  /** gmail-aware canonical local part, used ONLY for duplicate detection */
  canonicalLocal: string
}

export function parseEmail(raw: unknown): ParsedEmail | null {
  const email = String(raw ?? '').trim().toLowerCase()
  const m = /^([a-z0-9._%+\-]+)@([a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,})$/.exec(email)
  if (!m) return null
  const [, local, domain] = m
  let canonicalLocal = local.split('+')[0]
  if (GMAIL_DOMAINS.has(domain)) canonicalLocal = canonicalLocal.replace(/\./g, '')
  return { email, local, domain, canonicalLocal }
}

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain)
}

/**
 * Does the domain have mail servers? Uses Cloudflare DNS-over-HTTPS.
 * FAILS OPEN (returns true) on timeout / network / unexpected response,
 * so a DNS hiccup never blocks a real customer.
 */
export async function domainAcceptsMail(domain: string): Promise<boolean> {
  if (KNOWN_GOOD_DOMAINS.has(domain)) return true
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { accept: 'application/dns-json' }, signal: ctrl.signal },
    )
    if (!res.ok) return true
    const data: any = await res.json().catch(() => null)
    if (!data || typeof data.Status !== 'number') return true
    // 3 = NXDOMAIN → the domain does not exist at all.
    if (data.Status === 3) return false
    // Status 0 with an MX answer → fine. No MX: RFC 5321 falls back to A/AAAA,
    // but a signup with no MX is overwhelmingly fake — only reject NXDOMAIN
    // and "exists but has no MX and no A".
    const hasMx = Array.isArray(data.Answer) && data.Answer.some((a: any) => a?.type === 15)
    if (hasMx) return true
    const a = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
      { headers: { accept: 'application/dns-json' }, signal: ctrl.signal },
    )
    if (!a.ok) return true
    const ad: any = await a.json().catch(() => null)
    if (!ad || typeof ad.Status !== 'number') return true
    return ad.Status === 0 && Array.isArray(ad.Answer) && ad.Answer.length > 0
  } catch {
    return true
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Is this email (or a gmail dot-variant of it) already registered?
 * Exact match is handled by the caller via the unique index; this adds the
 * gmail dot/plus-alias check. Fails open on any DB error.
 */
export async function gmailAliasExists(p: ParsedEmail): Promise<boolean> {
  if (!GMAIL_DOMAINS.has(p.domain)) return false
  try {
    const rows = await db.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM "User"
      WHERE split_part(lower(email), '@', 2) IN ('gmail.com', 'googlemail.com')
        AND replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') = ${p.canonicalLocal}
      LIMIT 1`
    return rows.length > 0
  } catch (e) {
    console.error('[signup-guard] gmailAliasExists failed (fail-open):', e)
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// "Has this person already had a trial?"
// ─────────────────────────────────────────────────────────────

/**
 * True if ANY tenant registered with this phone already exists. A phone is
 * the strongest identity we have in Egypt, and one shop = one number, so a
 * second signup with the same number is a duplicate (or a trial-farm).
 */
export async function phoneAlreadyRegistered(normalizedPhone: string): Promise<boolean> {
  const variants = phoneVariants(normalizedPhone)
  const hit = await db.tenant.findFirst({
    where: { OR: [{ ownerPhone: { in: variants } }, { phone: { in: variants } }] },
    select: { id: true },
  })
  return !!hit
}

// ─────────────────────────────────────────────────────────────
// Per-IP rate limit (table "SignupAttempt", created by migration
// 20261012_add_signup_attempts). Everything fails open if the table
// is missing, so deploying code before the migration is safe.
// ─────────────────────────────────────────────────────────────

/**
 * Egyptian mobile carriers put MANY customers behind one public IP (CGNAT),
 * so this is deliberately loose: it stops scripts, not shared Wi-Fi.
 */
export const SIGNUP_LIMIT_PER_IP_24H = 5

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashIp(ip: string | undefined): Promise<string | null> {
  if (!ip) return null
  return sha256Hex(`signup-ip:${ip}`)
}

export async function signupsFromIpLast24h(ipHash: string): Promise<number> {
  try {
    const rows = await db.$queryRaw<{ n: bigint | number }[]>`
      SELECT COUNT(*) AS n FROM "SignupAttempt"
      WHERE "ipHash" = ${ipHash} AND "createdAt" > NOW() - INTERVAL '24 hours'`
    return Number(rows?.[0]?.n ?? 0)
  } catch (e) {
    console.error('[signup-guard] signupsFromIpLast24h failed (fail-open):', e)
    return 0
  }
}

export async function recordSignupFromIp(ipHash: string): Promise<void> {
  try {
    await db.$executeRaw`INSERT INTO "SignupAttempt" ("ipHash") VALUES (${ipHash})`
  } catch (e) {
    console.error('[signup-guard] recordSignupFromIp failed (ignored):', e)
  }
}
