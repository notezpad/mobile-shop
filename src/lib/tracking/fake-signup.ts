// 🛡️ 2026-10-13: كشف التسجيلات الوهمية (فضول / اختبار) عشان ما نبعتهاش لفيسبوك/تيك توك/GA4.
//
// فيسبوك مفيهوش أي API يتقال له «الحساب ده اتحذف / مش مهتم» — الحدث اللي اتبعت ما بيتسحبش.
// فالحل الفعلي إننا (1) ما نبعتش الحدث أصلاً لو التسجيل واضح إنه وهمي،
// (2) نصدّر الحسابات اللي اتحذفت كـ«جمهور استبعاد» (Custom Audience) تستبعده من الإعلانات.
//
// الفلتر متحفظ عن قصد: بيمنع الواضح بس (بريد مؤقت / test@ / أرقام متكررة)، ومش بيمنع تسجيل حقيقي.
// حتى لو اتمنع الحدث، الحساب نفسه بيتعمل عادي — الفلتر على التتبع بس.

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', '10minutemail.com', 'guerrillamail.com',
  'sharklasers.com', 'yopmail.com', 'trashmail.com', 'getnada.com', 'maildrop.cc', 'dispostable.com',
  'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com', 'mohmal.com', 'emailondeck.com', 'tempail.com',
  'mintemail.com', 'spamgourmet.com', 'moakt.com', 'mail.tm', 'burnermail.io', 'example.com', 'test.com',
])

const JUNK_WORD = /^(test|tests|testing|tst|fake|demo|sample|example|asd|asdf|asdfg|qwe|qwer|qwerty|abc|abcd|xyz|aaa+|bbb+|zzz+|xxx+|user|name|none|null|تست|تجربه|تجربة|اختبار|وهمي|فيك)\d*$/i

function isJunkText(v: string): boolean {
  const s = v.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return true
  if (!/\p{L}/u.test(s)) return true // أرقام/رموز بس
  if (JUNK_WORD.test(s)) return true
  if (/(.)\1{4,}/u.test(s)) return true // حرف متكرر 5 مرات+
  return false
}

export interface SignupIdentity {
  name?: string | null
  email?: string | null
  phone?: string | null
  shopName?: string | null
}

/** بيرجّع سبب الشك (نص قصير للسجل) أو null لو التسجيل يبدو حقيقي */
export function suspiciousSignupReason(v: SignupIdentity): string | null {
  const email = (v.email ?? '').trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at > 0) {
    const local = email.slice(0, at)
    const domain = email.slice(at + 1)
    if (DISPOSABLE_DOMAINS.has(domain)) return 'disposable-email'
    if (isJunkText(local.replace(/[._\-+]/g, ''))) return 'junk-email'
  }
  if (v.name && isJunkText(v.name)) return 'junk-name'
  if (v.shopName && isJunkText(v.shopName)) return 'junk-shop'
  const digits = (v.phone ?? '').replace(/\D/g, '')
  if (digits && (/(\d)\1{6,}/.test(digits) || /0123456789|1234567890|9876543210/.test(digits))) return 'junk-phone'
  return null
}
