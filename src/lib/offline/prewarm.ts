/**
 * Pre-warm engine — pulls shop data to IndexedDB when online.
 *
 * When the user opens the app while connected, this fetches:
 *   1. ALL products → store in IDB 'products' for offline POS search
 *   2. Key API responses → cache in IDB 'rows' for offline page loads
 *
 * This is the "sync" counterpart: pull data when online, use it offline.
 */

import { idb } from './idb'

/** The endpoints we pre-cache for offline page loads (IDB layer — طبقة api()). */
const PRECACHE_ENDPOINTS = [
  '/api/dashboard',
  '/api/products?status=all',
  '/api/customers',
  '/api/suppliers',
  '/api/categories',
  '/api/subscription',
  '/api/tenant',
  '/api/notifications?unread=false',
  // 🛡️ PWA OFFLINE ROOT FIX (2026-10-07): سيشن المستخدم لازم تتخزن في IDB
  // — من غيرها أي فتح أوفلاين بيرجع getMe() = null = طرد للصفحة الرئيسية.
  // (write-through في getMe() بتغطي معظم الحالات؛ ده ضمان إضافي)
  '/api/auth/me',
]

/**
 * 🛡️ PWA OFFLINE FIX v4 (2026-10-07): endpoints المخزون — بتتلحق بـ
 * كاش الـ SW نفسه (مش IDB فقط) لأن صفحات المخزون بتقرأ بـ fetch خام
 * مباشر، والـ fetch الخام أوفلاين بياخد جوابه من كاش الـ SW.
 * من غير كده صفحة المخزون كانت بتفتح أوفلاين بصفر + "الخطأ: رمز 503".
 */
const SW_API_ENDPOINTS = [
  ...PRECACHE_ENDPOINTS,
  '/api/branches',
  '/api/products?limit=1000&status=all',
  '/api/inventory/movements',
  '/api/inventory/transfers',
  '/api/inventory/stocktake',
]

/**
 * 🛡️ PWA OFFLINE ROOT FIX (2026-10-07): تسخين أغلفة HTML للتطبيق عبر
 * رسالة PRECACHE_URLS للـ Service Worker — عشان إطلاق الـ PWA أوفلاين
 * (start_url = /dashboard?source=pwa) يلاقي الصفحة في كاش الـ SW حتى لو
 * المستخدم ما فتحهاش بنفس الـ query ده قبل كده. الـ SW بيتعامل مع الرسالة
 * بشكل متسامح (مسار-بمسار، بيسكب المتخزن أصلاً).
 */
const APP_SHELL_ROUTES = [
  '/login',
  '/dashboard',
  '/pos',
  '/products',
  '/sales',
  '/customers',
  '/inventory',
  // 🛡️ PWA OFFLINE FIX (2026-10-07): كل شاشات النظام — الضغط على أي لينك
  // من القايمة الجانبية أوفلاين لازم يفتح الصفحة من الكاش بدل ERR_FAILED
  // أو صفحة "أنت غير متصل". الصفحات كلها prerendered على الحافة فالتسخين رخيص.
  '/suppliers',
  '/purchases',
  '/expenses',
  '/cash',
  '/reports',
  '/finance',
  '/inventory/movements',
  '/inventory/transfers',
  '/inventory/stocktake',
  '/settings',
  '/branches',
  '/users',
  '/maintenance',
  '/guide',
]

/**
 * 🛡️ PWA OFFLINE FIX v4: بعد أي تحديث للـ Service Worker الكاش بيتعمله
 * wipe (activate بيمسح الكاشات القديمة) — فالثروتل 20-دقيقة كان هيمنع
 * إعادة التسخين والجهاز يفضل أوفلاين فاضي! بنلغي الثروتل لحظة ما SW
 * جديد ياخد الكونترول (controllerchange) فأول دورة sync تالية تعيد
 * تسخين كل حاجة تلقائياً.
 */
let swResetInstalled = false
export function installPrewarmResetOnSwUpdate(): void {
  if (swResetInstalled || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  swResetInstalled = true
  try {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      void idb.setMeta('lastPrewarmAt', 0).catch(() => {})
    })
  } catch {
    /* ignore */
  }
}

/**
 * 🛡️ PWA OFFLINE FIX v4: إرسال ردود الـ API لكاش الـ SW (الطبقة اللي
 * بتقرأ منها fetches الخام أوفلاين) — رسالة PRECACHE_APIS، متسامحة
 * URL-بـ-URL جوا الـ SW نفسه.
 */
async function warmSwApiCache(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const sw = reg?.active
    if (!sw) return
    sw.postMessage({ type: 'PRECACHE_APIS', urls: SW_API_ENDPOINTS })
  } catch {
    /* ignore */
  }
}

export async function prewarmAppShell(): Promise<void> {
  try {
    if (typeof navigator === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const sw = reg?.active
    if (!sw) return
    sw.postMessage({ type: 'PRECACHE_URLS', urls: APP_SHELL_ROUTES })
  } catch {
    /* ignore */
  }
}

/**
 * Pull all products into IndexedDB for offline POS search.
 * Fetches with status=all to get every product (active + inactive).
 */
export async function prewarmProducts(): Promise<number> {
  try {
    const res = await fetch('/api/products?status=all')
    if (!res.ok) return 0
    const products = await res.json()
    if (!Array.isArray(products) || products.length === 0) return 0
    await idb.replaceProducts(products)
    await idb.setMeta('productsPrewarmedAt', Date.now())
    return products.length
  } catch {
    return 0
  }
}

/**
 * Pre-cache key API endpoints so pages load instantly offline.
 */
export async function prewarmEndpoints(): Promise<number> {
  let cached = 0
  for (const url of PRECACHE_ENDPOINTS) {
    try {
      const res = await fetch(url, { cache: 'default' })
      if (!res.ok) continue
      const data = await res.json()
      await idb.setCached(url, data)
      cached++
    } catch {
      /* skip failed endpoints */
    }
  }
  // 🛡️ v4: وبالتوازي — نسخّن كاش الـ SW برضه (لصفحات الـ fetch الخام):
  // بنسيبه في الخلفية عشان منعطلش رجوع العدد للمُنادي.
  void warmSwApiCache()
  return cached
}

/**
 * Full pre-warm: products + endpoints. Called on app boot when online.
 * Returns { products, endpoints } counts.
 */
export async function prewarmAll(): Promise<{ products: number; endpoints: number }> {
  if (typeof navigator === 'undefined' || navigator.onLine === false) {
    return { products: 0, endpoints: 0 }
  }

  // 🛡️ v4: لو SW جديد استلم الكونترول (تحديث) بنلغي الثروتل — الكاش
  // الجديد فاضي ومحتاج تسخين كامل فوراً. (idempotent — بنسجعه مرة واحدة)
  installPrewarmResetOnSwUpdate()

  // 🛡️ v4: أغلفة الصفحات بتتسخّن مع كل دورة sync — الـ SW بيسكب المتخزن
  // أصلاً (cache.match قبل الـ fetch) فتكلفة الدورة شبه صفر، وميزة الأمان
  // كبيرة: أي صفحة جديدة اتقفلت من كاش تحديث SW بترجع تلقائياً.
  void prewarmAppShell()
  void warmSwApiCache()

  // Check if we already pre-warmed recently (within 20 minutes) —
  // المنتجات والـ endpoints دي الأتقل (سحب كامل) فبنعملها بالثروتل فقط.
  const lastPrewarm = await idb.getMeta<number>('lastPrewarmAt')
  if (lastPrewarm && Date.now() - lastPrewarm < 20 * 60 * 1000) {
    // Already warmed recently — skip
    return { products: 0, endpoints: 0 }
  }

  const [products, endpoints] = await Promise.all([
    prewarmProducts(),
    prewarmEndpoints(),
  ])

  await idb.setMeta('lastPrewarmAt', Date.now())

  return { products, endpoints }
}

/**
 * Check if the products store has been pre-warmed.
 */
export async function isPrewarmed(): Promise<boolean> {
  const count = await idb.productCount()
  return count > 0
}
