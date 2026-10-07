/**
 * Service Worker 2026 — نظام المحل PWA (v7 — OFFLINE-PROOF)
 *
 * 🛡️ 2026-10-07 (v21/PWA — جذر مشكلة "لا كأني في PWA"):
 *
 *   المشكلة 1: إطلاق التطبيق المثبَّت أوفلاين كان يطلع ERR_FAILED (صفحة كروم
 *   الرمادية). السبب: مفتاح كاش التنقلات كان بيشمل الـ query string كامل —
 *   الـ PWA بيفتح /dashboard?source=pwa بينما المتخزن هو /dashboard فقط →
 *   miss → ومكان الفولباك offline.html كان ممكن يكون هو نفسه مش متخزن
 *   (addAll الذرّية: فشل أي أيقونة = فشل الكل بصمت) → respondWith رجّع
 *   undefined = خطأ شبكة خام.
 *
 *   المشكلة 2: ريفرش أوفلاين كان يرمي المستخدم على الصفحة الرئيسية —
 *   ده جزئه العميل (سيشن /api/auth/me مش متخزنة في IDB) لكن ده معناه
 *   إن صفحات التطبيق نفسها لازم تكون متاحة أوفلاين برضه — تم إصلاح
 *   التخزين + سيشن العميل في نفس هذا الإصدار.
 *
 * الحلول في v7:
 *   ✅ مطابقة تنقلات بـ ignoreSearch — /dashboard?source=pwa بيلحق /dashboard
 *   ✅ سلسلة فولباك مضمونة 100%: كاش → نفس المسار بأي query → offline.html
 *      → مستند أوفلاين مدمج داخل السوفتوير نفسه (مستحيل يرجع undefined)
 *   ✅ تخزين مسبق متسامح (URL-بـ-URL) بدل addAll الذرّية
 *   ✅ تخزين ردود التنقل السليمة فقط (ok) تحت مفتاح GET عادي
 *   ✅ كل حمايات v4-v6 القديمة: استبعاد RSC، منع تخزين /api/auth/*،
 *      cache-first للملفات الـ immutable، network-first للـ API
 *
 * 🛡️ 2026-10-07 (v9 — تسخين طبقة الـ API للـ fetches الخام):
 *   صفحات المخزون (وغيرها) بتقرأ بياناتها بـ fetch خام مباشر — مش عبر
 *   طبقة IDB بتاعة التطبيق — فأوفلاين كانت بتاخد 503 ("رمز 503").
 *   الحل: رسالة PRECACHE_APIS بتخزّن ردود الـ API في كاش الـ SW نفسه
 *   (مطابقة URL دقيقة) — فأي fetch خام يلاقي جوابه أوفلاين.
 *   + PURGE_API_CACHE: مسح ردود الـ API من كاش الـ SW عند خروج/انتهاء
 *   السيشن (خصوصية الجهاز المشترك) — بيتنادى من clearAuthSnapshot.
 *
 * 🛡️ 2026-10-07 (v10 — تسخين جراف الـ chunks — جذر "الصفحات بتدي خطأ غير متوقع"):
 *   تسخين الـ HTML لوحده مش كفاية: الصفحات بتستخدم next/dynamic (ssr:false)
 *   فالكود الحقيقي بيتحمّل في chunks منفصلة وقت الزيارة. لو الصفحة ما
 *   اتفتحتش أونلاين بعد آخر تحديث للـ SW (الكاش بيتعمله wipe في activate)
 *   الـ chunks بتاعتها مش متخزنة → dynamic import أوفلاين بيفشل → error
 *   boundary ("خطأ غير متوقع"). الحل: بعد تسخين أي مسار، بنمشي على جراف
 *   الـ assets (HTML → scripts → chunks المضمّنة جواها recursively) ونخزّنهم
 *   كلهم — بحد أقصى 600 ملف + marker يتفصل بعد كل تحديث SW تلقائياً.
 *   + فولباك API أوفلاين مطرّد: exact match → نفس المسار بأي query
 *   (ignoreSearch) → 503 JSON — فالفلاتر المختلفة أوفلاين ما بترمش 503.
 *
 * 🛡️ 2026-10-07 (v11 — LOCAL-FIRST — جذر "كل حاجة صفر + الإجراء مش بيظهر إلا بعد المزامنة"):
 *   الجذر كان في طبقة التطبيق (api-offline.ts): أي كتابة أوفلاين كانت
 *   بتمسح كل كاش IDB → الصفحات بتفتح على أصفار + توست أحمر. الاتفصل ده
 *   اتصلّح هناك (applyLocalMutation بدل المسح). هنا بنبقى نسخة جديدة
 *   بس (v11) عشان activate يعيد تسخين كل حاجة (chunk-walk marker بيتمسح
 *   مع الكاش القديم) — والـ endpoints الجديدة في PRECACHE_APIS تتخزن.
 */

const CACHE_VERSION = 'shop-erp-v11'
const OFFLINE_URL = '/offline.html'

/**
 * 🛡️ v10: marker بتاع مسيرة جراف الـ chunks — بيتخزن في الكاش بعد أول
 * مسيرة ناجحة. activate بيمسح الكاشات القديمة عند أي تحديث SW → الماركر
 * بيتمسح معاهم → المسيرة بتعيد نفسها تلقائياً بعد كل تحديث (لما الكاش
 * يكون فاضي ومحتاج تسخين كامل). من غيرها المسيرة هتتكرر مع كل دورة sync.
 */
const CHUNK_WALK_MARKER = '/__nezam-chunk-walk-v10'
/** سقف أمان لعدد الـ assets في المسيرة الواحدة (البيلد الحالي ~130 ملف) */
const WALK_MAX_ASSETS = 600

// 🛡️ v10: استخراج مسارات الـ assets:
//   - من HTML: مراجع مطلقة (/​_next/static/... + /fonts/...)
//   - من JS/CSS: مراجع نسبية جوا كود Turbopack ("static/chunks/xxx.js")
//     — دي الطريقة اللي dynamic import (next/dynamic) بيبني بيها روابط
//     الـ chunks وقت التشغيل.
const ASSET_RE_HTML = /\/_next\/static\/[a-zA-Z0-9_\-.\/%]+\.(?:js|css)/g
const FONT_RE_HTML = /\/fonts\/[a-zA-Z0-9_\-.\/%]+\.(?:woff2?|ttf)/g
const ASSET_RE_CODE = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[a-zA-Z0-9_\-.\/%]+\.(?:js|css|woff2?)/g

// ─── Precache list ──────────────────────────────────────────
// 🛡️ 2026-09-27: مسارات التطبيق (HTML كامل) ممنوع تتخزن هنا — كانت بتعمل
// bug "لينك السايدبار مش بيفتح غير بعد ريفرش" (الـ RSC payload بيتخزن غلط).
// المسارات بتتخزن تلقائياً أثناء الاستخدام الطبيعي + رسالة PRECACHE_URLS
// من التطبيق بتسخّن المسارات الأساسية بشكل متسامح (شوف message handler).
// هنا فقط أصول ثابتة غير شخصية — والمهم ترتيبها: offline.html أولاً.
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ─── Install: precache app shell (متسامح — مفيش فشل ذرّي) ────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION)
      // 🛡️ v7: كل URL لوحده — فشل أيقونة واحدة عمره ما يبطّل offline.html
      await Promise.allSettled(
        PRECACHE_URLS.map(async (u) => {
          try {
            const res = await fetch(u, { cache: 'no-store', redirect: 'follow' })
            if (res && (res.ok || res.type === 'opaque')) {
              await cache.put(u, res)
            }
          } catch {
            /* skip this one */
          }
        })
      )
      // 🛡️ ضمانة إضافية: offline.html لازم يكون موجود مهما حصل —
      // لو لأي سبب لسه مش متخزن، جرّب مرة أخيرة بـ cache-buster.
      try {
        const hit = await cache.match(OFFLINE_URL)
        if (!hit) {
          const res = await fetch(OFFLINE_URL + '?sw=' + Date.now(), { cache: 'no-store' })
          if (res && res.ok) await cache.put(OFFLINE_URL, res)
        }
      } catch {
        /* آخر أمان: الفولباك المدمج تحت هيغطي */
      }
    })()
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

// ─── 🛡️ v7: مستند أوفلاين مدمج (آخر خط أمان — مضمون الوجود دائماً) ──
// لو offline.html نفسه مش في الكاش (متصفح مسح البيانات مثلاً) — بدل ما
// respondWith يرجع undefined (ERR_FAILED) بنرجّع HTML عربي كامل من الذاكرة.
const INLINE_OFFLINE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>غير متصل — نظام المحل</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',-apple-system,BlinkMacSystemFont,sans-serif;background:#0c0e14;color:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px}
.c{max-width:400px;width:100%}
.i{width:80px;height:80px;margin:0 auto 24px;border-radius:20px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;box-shadow:0 20px 40px rgba(16,185,129,.3)}
.i svg{width:40px;height:40px;color:#fff}
h1{font-size:1.5rem;font-weight:800;margin-bottom:12px}
p{font-size:.9rem;color:#94a3b8;line-height:1.6;margin-bottom:24px}
button{background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:12px 28px;border-radius:12px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit}
</style></head><body><div class="c">
<div class="i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></div>
<h1>أنت غير متصل بالإنترنت</h1>
<p>لا يمكن تحميل هذه الصفحة الآن. الصفحات التي زرتها مؤخراً تعمل بدون إنترنت.</p>
<button onclick="window.location.reload()">إعادة المحاولة</button>
</div><script>window.addEventListener('online',function(){window.location.reload()})</script>
</body></html>`

function offlineDocumentResponse() {
  return new Response(INLINE_OFFLINE_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Offline-Fallback': 'sw-inline',
    },
  })
}

// ─── 🛡️ v10: مسيرة جراف الـ chunks ──────────────────────────────
// من أغلفة HTML المخزنة بنستخرج روابط الـ assets، وبنخزّن كل واحد،
// وبنمسح جوا كل JS/CSS مراجع chunks إضافية (dynamic imports بتاعة
// next/dynamic) — BFS بحد أقصى WALK_MAX_ASSETS ومتسامحة تماماً:
// أي ملف فاشل بيتسكب والباقي يكمل.
async function walkChunkGraph(cache, routeUrls) {
  const visited = new Set()
  const queue = []

  const enqueue = (raw) => {
    if (!raw) return
    // المراجع من HTML مطلقة (/​_next/...) ومن الكود نسبية (static/...)
    const path = raw.startsWith('/_next/') ? raw : '/_next/' + raw
    if (visited.has(path)) return
    if (visited.size >= WALK_MAX_ASSETS) return
    visited.add(path)
    queue.push(path)
  }

  // 1) البذرة: assets المذكورة في كل HTML مسار متسخّن
  for (const u of routeUrls || []) {
    try {
      const hit = await cache.match(u, { ignoreSearch: true })
      if (!hit) continue
      const html = await hit.text()
      for (const m of html.matchAll(ASSET_RE_HTML)) enqueue(m[0])
      for (const m of html.matchAll(FONT_RE_HTML)) enqueue(m[0])
    } catch {
      /* skip this route */
    }
  }

  // 2) BFS: خزّن كل asset، وامسح جوّا الـ JS/CSS مراجع جديدة
  let processed = 0
  while (queue.length > 0 && processed < WALK_MAX_ASSETS) {
    const path = queue.shift()
    processed++
    try {
      let res = await cache.match(path)
      if (!res) {
        const fetched = await fetch(path, { cache: 'no-store' })
        if (!fetched || !fetched.ok) continue
        await cache.put(path, fetched.clone()).catch(() => {})
        res = fetched
      }
      if (/\.(js|css)$/.test(path) && res) {
        const text = await res.clone().text()
        for (const m of text.matchAll(ASSET_RE_CODE)) enqueue(m[0])
      }
    } catch {
      /* skip this asset */
    }
  }
}

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
  // the transition. These requests must always go straight to the network
  // with no Service Worker caching involved.
  const isNextRouterRequest =
    request.headers.get('RSC') === '1' ||
    request.headers.has('Next-Router-State-Tree') ||
    request.headers.has('Next-Router-Prefetch') ||
    url.pathname.startsWith('/_next/data/') ||
    url.searchParams.has('_rsc')
  if (isNextRouterRequest) return

  // ── API requests → network-first ─────────────────────────
  if (url.pathname.startsWith('/api/')) {
    // 🛡️ /api/auth/* بيحدد مين مسجّل دخول — ممنوع يتخزن في كاش الـ SW نهائياً
    // (السيشن الأوفلاين مسؤولية طبقة العميل: IDB مع مسح عند تغيير الحساب)
    if (url.pathname.startsWith('/api/auth/')) return
    // 🛡️ 2026-10-07 (v17): ناخد نسخة في الكاش للعمل أوفلاين **لو الرد سليم
    // فقط**. الباج القديم كان بيخزّن أي رد (حتى 500/403/رد فاضي).
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
          // Offline → try cache (رد سليم فقط):
          // 1) الـ URL بالظبط (الـ query مهم — داتا مختلفة)
          // 2) 🛡️ v10: نفس المسار بأي query (ignoreSearch) — فلاتر مختلفة
          //    أوفلاين بترجع آخر نسخة معروفة بدل 503 فجّ.
          //    ⚠️ الاستثناء: URLs البحث (search= غير فاضي) — بيسكبها عشان
          //    طبقة التطبيق (api-offline) تفلتر النتايج محلياً بدل ما ترجّع
          //    لستة كاملة غير مفلترة وكأنها نتايج البحث.
          // 3) 503 JSON واضح.
          const hasSearch = (() => {
            try { return !!url.searchParams.get('search') } catch { return false }
          })()
          return caches.match(request).then((cached) => {
            if (cached && cached.ok) return cached
            if (hasSearch) {
              return new Response(
                JSON.stringify({ error: 'أنت غير متصل بالإنترنت' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              )
            }
            return caches
              .match(request, { ignoreSearch: true })
              .then((loose) => {
                if (loose && loose.ok) return loose
                return new Response(
                  JSON.stringify({ error: 'أنت غير متصل بالإنترنت' }),
                  { status: 503, headers: { 'Content-Type': 'application/json' } }
                )
              })
              .catch(() =>
                new Response(
                  JSON.stringify({ error: 'أنت غير متصل بالإنترنت' }),
                  { status: 503, headers: { 'Content-Type': 'application/json' } }
                )
              )
          })
        })
    )
    return
  }

  // ── Navigation → network-first + فولباك أوفلاين مضمون 100% ──
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION)
        // 🛡️ (v6): مفتاح كاش Request عادي (GET) — لأن cache.put() بيرفض
        // طلبات navigate-mode بـ TypeError بصمت. Match بيوافق بالـ URL.
        const cacheKey = new Request(request.url, { method: 'GET' })
        try {
          // Use navigation preload if available (يتفشل أوفلاين — بنلقطه)
          let response = null
          try {
            response = await event.preloadResponse
          } catch {
            /* offline — below fetch will fail too and we fall back */
          }
          if (!response) {
            response = await fetch(request)
          }
          if (response && response.ok) {
            const clone = response.clone()
            cache.put(cacheKey, clone).catch(() => {})
          }
          return response
        } catch {
          // ════ OFFLINE recovery chain (v7) ════
          // 1) نفس الـ URL بالظبط (بأي query)
          let hit = null
          try { hit = await caches.match(request) } catch { /* ignore */ }
          // 2) 🛡️ THE FIX: تجاهل الـ query — /dashboard?source=pwa بيلحق
          //    /dashboard المخزنة. ده كان سبب ERR_FAILED عند إطلاق الـ PWA.
          if (!hit) {
            try { hit = await caches.match(request, { ignoreSearch: true }) } catch { /* ignore */ }
          }
          // 3) نفس المسار بأي مفتاح مخزّن (أي query تاني)
          if (!hit) {
            try {
              const keys = await cache.keys()
              const key = keys.find((k) => {
                try { return new URL(k.url).pathname === url.pathname } catch { return false }
              })
              if (key) hit = await cache.match(key)
            } catch { /* ignore */ }
          }
          // 4) صفحة الأوفلاين المخزنة مسبقاً
          if (!hit) {
            try { hit = await caches.match(OFFLINE_URL) } catch { /* ignore */ }
          }
          // 5) 🛡️ آخر أمان مضمون: مستند أوفلاين مدمج — مستحيل نرجّع undefined
          //    (undefined = ERR_FAILED — ده بالظبط اللي كان بيحصل للمستخدم)
          return hit || offlineDocumentResponse()
        }
      })()
    )
    return
  }

  // 🛡️ ملفات /_next/static/* أسماؤها فيها hash ومش بتتغير أبداً — cache-first
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
      // 🛡️ تسخين مسارات التطبيق (HTML) — متسامح مسار-بمسار: فشل مسار واحد
      // عمره ما يبطّل الباقي. وبنسكب المسارات المتخزنة أصلاً (ignoreSearch)
      // — الرسالة بتيجي مع كل دورة sync فمفيش لزوم لإعادة جلب موجودة.
      if (Array.isArray(event.data.urls)) {
        event.waitUntil(
          (async () => {
            const cache = await caches.open(CACHE_VERSION)
            // 1) أغلفة HTML — زي v7 (تخزين متسامح skip-if-cached)
            await Promise.allSettled(
              event.data.urls.map((u) =>
                cache.match(u, { ignoreSearch: true }).then((hit) => {
                  if (hit) return
                  return cache
                    .add(new Request(u, { redirect: 'follow' }))
                    .catch(() => {})
                }).catch(() => {})
              )
            )
            // 2) 🛡️ v10: مسيرة جراف الـ chunks — بتجعل كل مسار متسخّن
            //    مكتمل أوفلاين (HTML + كل الـ JS/CSS اللي بيحتاجه، شامل
            //    chunks الـ next/dynamic اللي مش مكتوبة في الـ HTML).
            //    الماركر بيمنع التكرار مع كل دورة sync — وبيتمسح تلقائياً
            //    مع كل تحديث SW (activate بيمسح الكاش) فبتعيد التسخين.
            try {
              const marker = await cache.match(CHUNK_WALK_MARKER)
              if (!marker) {
                await walkChunkGraph(cache, event.data.urls)
                await cache.put(
                  CHUNK_WALK_MARKER,
                  new Response('1', {
                    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
                  })
                )
              }
            } catch {
              /* مسيرة فاشلة — الدورة الجاية تعيد (الماركر مش هيتكتب) */
            }
          })()
        )
      }
      break

    case 'PRECACHE_APIS':
      // 🛡️ v9: تسخين ردود الـ API في كاش الـ SW — الطبقة اللي بتقرأ منها
      // fetches الخام أوفلاين (صفحات المخزون والحركات والجرد). هنا المطابقة
      // بالـ URL **الكامل** (الـ query مهم في الـ APIs — فلتر مختلف = داتا
      // مختلفة) ومتسامح URL-بـ-URL: فشل endpoint واحد عمره ما يبطّل الباقي.
      if (Array.isArray(event.data.urls)) {
        event.waitUntil(
          caches.open(CACHE_VERSION).then((cache) =>
            Promise.allSettled(
              event.data.urls.map((u) =>
                cache.match(u).then((hit) => {
                  if (hit) return
                  return cache
                    .add(new Request(u, { redirect: 'follow', credentials: 'same-origin' }))
                    .catch(() => {})
                }).catch(() => {})
              )
            )
          )
        )
      }
      break

    case 'PURGE_API_CACHE':
      // 🛡️ v9: مسح ردود الـ API المخزنة من كاش الـ SW (بيتنادى عند خروج
      // / انتهاء سيشن عبر clearAuthSnapshot) — عشان جهاز مشترك ما يقدرش
      // يعرض بيانات تينانت قديم أوفلاين. بنمسح /api/* فقط — الصفحات
      // والأصول الثابتة تفضل متخزنة (مش شخصية).
      event.waitUntil(
        caches.open(CACHE_VERSION)
          .then((cache) =>
            cache.keys().then((keys) =>
              Promise.all(
                keys
                  .filter((k) => {
                    try { return new URL(k.url).pathname.startsWith('/api/') } catch { return false }
                  })
                  .map((k) => cache.delete(k))
              )
            )
          )
          .then(() => {
            event.source?.postMessage({ type: 'API_CACHE_PURGED' })
          })
      )
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
