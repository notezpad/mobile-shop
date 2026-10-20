/**
 * 🛡️ 2026-10-20 — Security headers (مصدر واحد).
 * مستخدمة في: withDb (ردود الـ API من الـ Worker) و public/_headers (الملفات الثابتة)
 * ويمكن استخدامها في next.config لو اتضاف. ما فيهاش script-src عمدًا عشان GA/GTM/Meta/TikTok/
 * Paymob ما تتكسرش — فقط القيود الآمنة: ممنوع التضمين في iframe، وممنوع base/object.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
}

/** بيضيف الهيدرز لأي Response (من غير ما يغيّر هيدر موجود). آمن لو الـ Response immutable. */
export function applySecurityHeaders<T>(res: T): T {
  if (!(res instanceof Response)) return res
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!res.headers.has(k)) res.headers.set(k, v)
    }
  } catch {
    /* immutable headers (مثلاً Response.redirect من fetch) — نتجاهل */
  }
  return res
}
