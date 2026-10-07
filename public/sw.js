/**
 * Service Worker 2026 — نظام المحل PWA
 *
 * Features:
 *  ✅ Precaching (app shell + critical assets)
 *  ✅ Network-first for API (fresh data, cache fallback)
 *  ✅ Stale-while-revalidate for static assets (JS/CSS/images)
 *  ✅ Cache-first for fonts + icons
 *  ✅ Offline page fallback
 *  ✅ Background sync (flush outbox when network returns)
 *  ✅ Push notifications (display push from server)
 *  ✅ Skip-waiting on install (instant activation)
 *  ✅ Cache cleanup on activate
 *  ✅ Navigation preload (faster page loads)
 *  ✅ Message handler (client → SW communication)
 *  ✅ Periodic sync (optional, for background data refresh)
 */

// 🛡️ 2026-10-07 (v20/PWA): رفعنا الكاش من v5 لـ v6 — أول تشغيل للنسخة
// دي بينضف أي كاش قديم (HTML/ردود سمومة محتملة)، وبعدها بناء كاش جديد
// ينطّق مع سلسلة الأوفلاين الجديدة (نسخة السيشن في IDB + تسخين مسارات
// التطبيق). المستخدم هيعيد تخزين الصفحات تلقائياً من أول زيارة أونلاين
// + prewarm الـ app shell بيغطي المسارات الأساسية فوراً.
const CACHE_VERSION = 'shop-erp-v6'
const OFFLINE_URL = '/offline.html'

// ─── Precache list ──────────────────────────────────────────
// 🛡️ 2026-09-27: app routes (dashboard/pos/products/settings/finance)
// USED to be listed here and precached as full HTML documents. That
// caused the "sidebar link sometimes doesn't open the page until I
// refresh" bug: Next.js's App Router does client-side transitions by
// fetching an RSC payload from the SAME pathname as the page (a plain
// GET, not a `navigate`-mode request) — and the catch-all handler below
// would serve the STALE PRECACHED FULL HTML for that exact URL instead
// of forwarding to the network, so the router silently got the wrong
// payload shape and the on-screen content never changed (URL/history
// still updated, which is why it looked random/intermittent). A full
// page refresh worked because that request IS `navigate`-mode, which
// always goes to the network first (see below). It was also a stale/
// cross-tenant risk on a shared device: a dashboard HTML precached for
// one logged-in tenant could get served to a different tenant later.
// Only truly static, non-personalized assets belong in this list now.
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ─── Install: precache app shell ─────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Cache what we can — ignore individual failures
      return cache.addAll(PRECACHE_URLS).catch(() => {})
    })
  )
  self.skipWaiting()
})

// ─── Activate: clean old caches + enable navigation preload ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete old caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      ),
      // Enable navigation preload
      self.registration.navigationPreload?.enable(),
    ])
  )
  self.clients.claim()
})

// ─── Fetch handler ──────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET (POST/PUT/PATCH/DELETE → always network)
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip cross-origin (Paymob, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return

  // 🛡️ 2026-09-27: Next.js's App Router fetches an RSC payload from the
  // SAME URL as the page itself when you click a <Link> (client-side
  // transition) — it's a plain GET, not a `navigate`-mode request, so it
  // would otherwise fall into the generic "static asset" cache below and
  // could be answered with a stale cached HTML document for that path
  // instead of the fresh RSC payload Next.js expects, silently breaking
  // the transition (see the note on PRECACHE_URLS above for the full
  // story). These requests must always go straight to the network with
  // no Service Worker caching involved.
  const isNextRouterRequest =
    request.headers.get('RSC') === '1' ||
    request.headers.has('Next-Router-State-Tree') ||
    request.headers.has('Next-Router-Prefetch') ||
    url.pathname.startsWith('/_next/data/') ||
    url.searchParams.has('_rsc')
  if (isNextRouterRequest) return

  // ── API requests → network-first ─────────────────────────
  if (url.pathname.startsWith('/api/')) {
    // 🛡️ /api/auth/* بيحدد مين مسجّل دخول — ممنوع يتخزن نهائياً
    if (url.pathname.startsWith('/api/auth/')) return
    // 🛡️ 2026-10-07 (v17): ناخد نسخة في الكاش للعمل أوفلاين **لو الرد سليم
    // فقط**. الباج القديم كان بيخزّن أي رد (حتى 500/403/رد فاضي) — فلو
    // حصل خطأ مرة واحدة بيفضل متراكم ويترجع لاحقاً بدل البيانات الحقيقية.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => {
          // Offline → try cache (رد سليم فقط)، ثم 503
          return caches.match(request).then((cached) => {
            if (cached && cached.ok) return cached
            return new Response(
              JSON.stringify({ error: 'أنت غير متصل بالإنترنت' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            )
          })
        })
    )
    return
  }

  // ── Navigation → network-first + preload + offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // 🛡️ ROOT FIX (2026-10-07, v20/PWA): cache.put() بيرفض طلبات
        // navigate-mode بـ TypeError **بصمت** (الـ .then() كان بيبلع
        // الـ rejection) — يعني من أول يوم الـ SW ما خزّن ولا صفحة HTML
        // واحدة من التنقلات! أي refresh أوفلاين كان بيقع في offline.html
        // = «ولا كأني في PWA». الحل: مفتاح كاش Request عادي (GET) بنفس
        // الـ URL — الـ match بيوافق بالـ URL مهما كان الـ mode.
        // + حماية: نختزن الردود السليمة فقط (ok) — صفحات 500 اللي بيرجعها
        // الديف/الإيدج وقت ضعف الشبكة ممنوع تتخزن وتسمّم الأوفلاين.
        const cacheKey = new Request(request.url, { method: 'GET' })
        try {
          // Use navigation preload if available
          const preload = await event.preloadResponse
          if (preload) {
            if (preload.ok) {
              const clone = preload.clone()
              caches.open(CACHE_VERSION).then((cache) => cache.put(cacheKey, clone))
            }
            return preload
          }

          // Normal fetch
          const response = await fetch(request)
          if (response && response.ok) {
            const clone = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(cacheKey, clone))
          }
          return response
        } catch {
          // Offline → cache → offline page
          const cached = await caches.match(request)
          return cached || caches.match(OFFLINE_URL)
        }
      })()
    )
    return
  }

  // 🛡️ ROOT FIX: ملفات /_next/static/* أسماؤها فيها hash ومش بتتغير
  // أبداً. القديم كان stale-while-revalidate: يرجّع النسخة المخزنة
  // *ويعمل كمان ريكويست شبكة لنفس الملف في كل مرة* — أي ~25 ريكويست
  // زيادة على السيرفر في كل فتح صفحة بدون أي فايدة. دلوقتي cache-first
  // بالكامل: لو الملف موجود في الكاش خلاص، صفر شبكة.
  const isImmutable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/')
  if (isImmutable) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // ── Static assets → stale-while-revalidate ───────────────
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})

// ─── Background Sync: flush outbox when network returns ─────
self.addEventListener('sync', (event) => {
  if (event.tag === 'shop-erp-sync') {
    event.waitUntil(
      // Notify all clients to flush their outbox
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'FLUSH_OUTBOX' })
        })
      })
    )
  }
})

// ─── Push notifications ──────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'نظام المحل', body: event.data.text() }
  }

  const title = data.title || 'نظام المحل'
  const options = {
    body: data.body || data.message || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/dashboard',
    },
    actions: data.actions || [],
    tag: data.tag || 'shop-erp-notification',
    renotify: data.renotify || false,
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ─── Notification click ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// ─── Message handler (client → SW) ──────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break

    case 'PRECACHE_URLS':
      // 🛡️ PWA (2026-10-07): تسخين مسارات التطبيق (HTML) — متسامح مسار-بمسار:
      // القديم كان cache.addAll(urls) اللي بيفشل كله لو مسار واحد فشل.
      // كمان بنسكب المسارات المتخزنة أصلاً — الرسالة بتوصل مع كل prewarm
      // (كل 20 دقيقة أونلاين) فمفيش أي لزوم لإعادة جلب حاجة موجودة.
      if (Array.isArray(event.data.urls)) {
        event.waitUntil(
          caches.open(CACHE_VERSION).then((cache) =>
            Promise.allSettled(
              event.data.urls.map((u) =>
                cache.match(u, { ignoreSearch: true }).then((hit) => {
                  if (hit) return
                  return cache
                    .add(new Request(u, { redirect: 'follow' }))
                    .catch(() => {})
                }).catch(() => {})
              )
            )
          )
        )
      }
      break

    case 'CLEAR_CACHE':
      caches.delete(CACHE_VERSION).then(() => {
        event.source?.postMessage({ type: 'CACHE_CLEARED' })
      })
      break

    case 'GET_CACHE_SIZE':
      caches.open(CACHE_VERSION).then((cache) => {
        cache.keys().then((keys) => {
          event.source?.postMessage({ type: 'CACHE_SIZE', count: keys.length })
        })
      })
      break
  }
})

// ─── Periodic Sync (background data refresh) ─────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'shop-erp-refresh') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'PERIODIC_REFRESH' })
        })
      })
    )
  }
})
