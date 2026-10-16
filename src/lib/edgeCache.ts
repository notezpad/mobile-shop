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
// 🛡️ FIX (tsc): المُنادي بيمرر إصدارات number أحيانًا (2/3/4) وأحيانًا string ('4n')
// — الواقع أن المفتاح نص في الحالتين، فالنوع موحّد الآن.
function buildKey(pathname: string, rawQuery: string, tenantId: number | string, v: number | string): Request {
  const q = rawQuery ? `?${rawQuery}` : ''
  return new Request(`https://${CACHE_HOST}${pathname}${q}#tenant=${tenantId}&v=${v}`)
}

/** رد مخزن؟ يرجع نسخة جاهزة للإرجاع للمتصفح (Cache-Control: no-store) */
export async function matchEdgeCache(
  pathname: string,
  rawQuery: string,
  tenantId: number | string,
  v: number | string = '1'
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
  v: number | string = '1'
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
  v: number | string = '1'
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
  /**
   * ⚡ v9: قائمة المنتجات الافتراضية (كاشير/شاشة المنتجات).
   * المفتاح بيشمل فرع المستخدم لأن GET بيفلتر بـ session.branchId —
   * مستخدمين في فروع مختلفة لنفس المحل لازم يشوفوا قوائم مختلفة.
   * rawQuery هنا مُصطنع (مش من URL) بس هو نفسه اللي بيتخزن بيه.
   */
  products: (branchId: number | null | undefined) => ({
    pathname: '/api/products',
    rawQuery: `branch=${branchId ?? 0}`,
  }),
  /**
   * ⚡ v10: نسخة قائمة المخزون (شاشة المخزون تطلب status=all&limit=1000&meta=slim)
   * — مفتاح منفصل عن كاشير الـ POS، بنفس منطق الفرع.
   */
  productsInventory: (branchId: number | null | undefined) => ({
    pathname: '/api/products',
    rawQuery: `branch=${branchId ?? 0}&inv=1&page=1`,
  }),
  categories: { pathname: '/api/categories', rawQuery: '' },
  suppliers: { pathname: '/api/suppliers', rawQuery: '' },
  /**
   * ⚡ v12 (2026-10-06): إصلاح سقوط الموقع على صفحات الإدارة.
   * المستخدم جرّب تصفح كل الصفحات ~100 مرة بلا مشاكل، لكن /users و /reports
   * و /branches بيسقطوا الموقع — لأن APIs دي مش متخزنة على الحافة، فكل طلب
   * بيشتغّل Prisma (وإنشاء PrismaClient + تجهيز محرك WASM أول مرة في isolate
   * جديد هو اللي بياكل الـ 10ms CPU → Error 1102 → الموقع كله بيقع).
   * الفروع/المستخدمين بتتغير نادرًا → TTL أطول شوية (60/30 ثانية).
   */
  branches: { pathname: '/api/branches', rawQuery: '' },
  /** تقرير الفروع (صفحة الفروع بتطلبه مع القائمة) — بيتأثر بأي بيع جديد أو تغيير فرع */
  reportsBranches: { pathname: '/api/reports/branches', rawQuery: '' },
  /** قائمة المستخدمين */
  users: { pathname: '/api/users', rawQuery: '' },
  /** قائمة المصروفات (بدون فلاتر — الفلاتر ليها مفتاحها الخاص وقت التخزين) */
  expensesDefault: { pathname: '/api/expenses', rawQuery: '' },
}

/**
 * ⚡ v9: مسح كاش الكتالوج كله (منتجات + تصنيفات + موردين) بعد أي mutation
 * على أي واحد فيهم. أرخص وأأمن من تتبّع التقاطعات الدقيقة بين الجداول —
 * والعملية نفسها رخيصة (3 عمليات delete على الحافة).
 */
export async function purgeCatalogCaches(
  tenantId: number | string,
  branchId: number | null | undefined,
  v: number | string = '3'
): Promise<void> {
  await purgeEdgeCache(
    [
      PURGE_KEYS.products(branchId),
      PURGE_KEYS.productsInventory(branchId),
      PURGE_KEYS.categories,
      PURGE_KEYS.suppliers,
    ],
    tenantId,
    v
  )
}
