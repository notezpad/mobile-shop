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

/** The endpoints we pre-cache for offline page loads. */
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
  // 🛡️ PWA OFFLINE FIX (2026-10-07): باقي شاشات البيع الأساسية — عشان
  // الضغط على أي لينك من القايمة الجانبية أوفلاين يفتح الصفحة من الكاش
  // بدل ERR_FAILED (الـ SW بيرد بالصفحة المخزنة أو صفحة الأوفلاين).
  '/suppliers',
  '/purchases',
  '/expenses',
  '/cash',
  '/reports',
  '/finance',
]

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

  // Check if we already pre-warmed recently (within 5 minutes)
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

  // 🛡️ PWA: سخّن أغلفة HTML (مستقلة عن النتيجة — رسالة بسيطة للـ SW)
  void prewarmAppShell()

  return { products, endpoints }
}

/**
 * Check if the products store has been pre-warmed.
 */
export async function isPrewarmed(): Promise<boolean> {
  const count = await idb.productCount()
  return count > 0
}
