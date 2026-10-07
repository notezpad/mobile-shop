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
  // 🛡️ PWA (2026-10-07): نسخة السيشن — دي كانت الناقصة الجوهرية!
  // من غيرها getMe() أوفلاين كان بيرجّع null → طرد للرئيسية →
  // «لا يوجد إنترنت» عند الدخول. الـ fetch بيفشل بـ 401 لو مسجّل
  // خروج → بسكّب (if (!res.ok) continue) فمفيش تسريب لحساب قديم.
  '/api/auth/me',
]

/**
 * 🛡️ PWA (2026-10-07): مسارات HTML الأساسية — بنبعتها للـ SW يخزّنها
 * (navigate HTML) حتى لو المستخدم لسه مازارهاش، فأول فتح أوفلاين
 * لأي صفحة أساسية بيلاقيها جاهزة في كاش الصفحات بدل offline.html.
 * المسارات دي static prerendered (كاش v11) — جلبها من الإيدج رخيص
 * جداً، وبيتخطى أي مسار متخزن أصلاً (cache.match قبل الجلب — شوف
 * معالج PRECACHE_URLS في public/sw.js).
 */
const APP_SHELL_ROUTES = [
  '/dashboard', '/pos', '/products', '/sales',
  '/inventory', '/customers', '/finance', '/expenses',
  '/cash', '/reports', '/settings', '/purchases',
  '/suppliers', '/maintenance', '/branches', '/users',
]

function prewarmAppShell(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => {
      const sw = reg.active || navigator.serviceWorker.controller
      sw?.postMessage({ type: 'PRECACHE_URLS', urls: APP_SHELL_ROUTES })
    })
    .catch(() => {
      /* SW مش جاهز/غير مسجل — الأوفلاين هيتخزن من الزيارات العادية */
    })
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

  // 🛡️ PWA: خزّن صفحات التطبيق الأساسية في كاش الـ SW — بعد ما الـ
  // endpoints خلصت عشان ماتزاحمش في الشبكة.
  prewarmAppShell()

  return { products, endpoints }
}

/**
 * Check if the products store has been pre-warmed.
 */
export async function isPrewarmed(): Promise<boolean> {
  const count = await idb.productCount()
  return count > 0
}
