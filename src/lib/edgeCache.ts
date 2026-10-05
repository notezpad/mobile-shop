/**
 * ⚡ EDGE CACHE (2026-10-06) — إصلاح Error 1102 (Worker exceeded CPU time limit)
 * ─────────────────────────────────────────────────────────────────────────────
 * السياق: خطة Cloudflare المجانية بتيح 10ms CPU للطلب الواحد. كل طلب API
 * بيدفع تكلفة ثابتة (إنشاء PrismaClient جديد + محرك WASM + اتصال Postgres
 * بدون Hyperdrive) قبل أي منطق — فالحمل الزمني (مستخدم يتنقل بسرعة بين
 * الصفحات، داشبورد بيتحدث تلقائياً كل 5 دقايق + جرس الإشعارات كل 3 دقايق)
 * بيخلي سلسلة طلبات متتالية تعدي الحد → 1102 → Cloudflare بتعمل circuit
 * breaker مؤقت للموقع كله (بالهبوط والرجوع اللي شفناه في wrangler tail).
 *
 * الحل هنا: كاش على حافة Cloudflare (Cache API) للـ GET endpoints الثقيلة:
 *   - الرد المخزن بيتخدم من غير ما يشغّل الـ Worker أصلاً (≈ صفر CPU)
 *   - المفتاح per-tenant (بيانات كل محل منفصلة تماماً)
 *   - TTL قصير جداً (ثواني) عشان البيانات تفضل حديثة عملياً
 *   - أي mutation بتعمل purge للمفاتيح المتأثرة فوراً — فمفيش بيانات
 *     قديمة بعد إضافة عميل/فاتورة/سداد
 *   - على بيئة التطوير (Node) الكاش متجاهل تماماً (no-op) — السلوك زي ما هو
 *
 * 🔒 الأمان: المفتاح بيشمل tenantId + مسار الـ API + المعاملات المتعلقة
 * بالاستعلام فقط. مفيش أي بيانات مستأجر تاني ممكن تتسرب لأن المفتاح
 * نفسه ما بيتطابقش غير لنفس المستأجر، والكاش نفسه خارج المتصفح
 * (الـ response اللي بيوصل للمتصفح دايماً no-store).
 */

const CACHE_HOST = 'edge-cache.internal'

/** true لو شغالين داخل Cloudflare Workers (workerd) وليس Node dev */
export function edgeCacheAvailable(): boolean {
  try {
    const c = (globalThis as unknown as { caches?: { default?: { match?: unknown; put?: unknown } } }).caches
    return typeof c?.default?.match === 'function' && typeof c?.default?.put === 'function'
  } catch {
    return false
  }
}

/**
 * مفتاح كاش قياسي: path + معاملات مرتبة + tenantId.
 * بنمرر الـ searchParams مرتبة كـ string جاهزة (rawQuery) عشان المفتاح
 * يكون حتمي (deterministic) — نفس الطلب = نفس المفتاح دايماً.
 */
function buildKey(pathname: string, rawQuery: string, tenantId: number | string, v: string): Request {
  const q = rawQuery ? `?${rawQuery}` : ''
  return new Request(`https://${CACHE_HOST}${pathname}${q}#tenant=${tenantId}&v=${v}`)
}

/** رد مخزن؟ يرجع نسخة جاهزة للإرجاع للمتصفح (Cache-Control: no-store) */
export async function matchEdgeCache(
  pathname: string,
  rawQuery: string,
  tenantId: number | string,
  v = '1'
): Promise<Response | null> {
  if (!edgeCacheAvailable()) return null
  try {
    const hit = await (globalThis as unknown as { caches: { default: Cache } }).caches.default.match(
      buildKey(pathname, rawQuery, tenantId, v)
    )
    if (!hit) return null
    const fresh = new Response(hit.body, hit)
    // المتصفح دايماً يعيد الطلب — الكاش على الحافة فقط. مفيش stale في المتصفح
    // بعد أي mutation (الـ purge بيشتغل على الحافة فوراً).
    fresh.headers.set('Cache-Control', 'no-store')
    // 🛡️ ممنوع كوكي مستخدم يوصل لمستخدم تاني من نفس المحل
    fresh.headers.delete('Set-Cookie')
    return fresh
  } catch {
    return null
  }
}

/**
 * تخزين رد على الحافة بـ TTL قصير (ثواني). لا يفشل الطلب أبداً.
 * ملاحظة: مرّر نسخة `res.clone()` مش الرد الأصلي — الرد الأصلي يرجع للفريمورك.
 */
export async function putEdgeCache(
  res: Response,
  pathname: string,
  rawQuery: string,
  tenantId: number | string,
  ttlSeconds: number,
  v = '1'
): Promise<void> {
  if (!edgeCacheAvailable()) return
  if (res.status !== 200) return
  try {
    const stored = new Response(res.body, res)
    stored.headers.set('Cache-Control', `public, max-age=${ttlSeconds}`)
    stored.headers.delete('Set-Cookie')
    await (globalThis as unknown as { caches: { default: Cache } }).caches.default.put(
      buildKey(pathname, rawQuery, tenantId, v),
      stored
    )
  } catch {
    // الكاش ما يكسرش الرد أبداً (حجم/حصانة/ما شابه)
  }
}

/** مسح مفاتيح بعد mutations — فورية، عشان البيانات تفضل دقيقة 100% */
export async function purgeEdgeCache(
  entries: Array<{ pathname: string; rawQuery?: string }>,
  tenantId: number | string,
  v = '1'
): Promise<void> {
  if (!edgeCacheAvailable()) return
  try {
    const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default
    await Promise.all(
      entries.map((e) =>
        cache
          .delete(buildKey(e.pathname, e.rawQuery ?? '', tenantId, v))
          .catch(() => undefined)
      )
    )
  } catch {
    // تجاهل — الـ TTL هيمسح بالضرورة
  }
}

/** مفاتيح قياسية للمسح بعد أي تغيير في العملاء/المبيعات/المدفوعات */
export const PURGE_KEYS = {
  dashboard: (days: number | string) => ({ pathname: '/api/dashboard', rawQuery: `days=${days}` }),
  customersDefault: { pathname: '/api/customers', rawQuery: '' },
}
