/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing';
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
  NetworkOnly,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// ─── Precache all build assets ────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// ─── Skip waiting on message from client ──────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// ─── Clients claim (activate immediately) ─────────────────────────
clientsClaim();

// ─── Navigation: NetworkFirst with offline fallback ───────────────
// Tries network first (for fresh content), falls back to cache, then to offline page.
const navigationStrategy = new NetworkFirst({
  cacheName: 'mse-pages',
  networkTimeoutSeconds: 5,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 15, maxAgeSeconds: 60 * 60 * 24 }),
  ],
});

const navigationRoute = new NavigationRoute(navigationStrategy, {
  denylist: [/^\/api\//, /^\/repairs\/track\//],
});
registerRoute(navigationRoute);

// ─── Static assets: StaleWhileRevalidate ──────────────────────────
// JS, CSS, workers — serve from cache, update in background.
registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: 'mse-static-resources',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// ─── Fonts: CacheFirst (long-lived) ───────────────────────────────
registerRoute(
  ({ request, url }) =>
    request.destination === 'font' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'mse-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

// ─── Images: StaleWhileRevalidate ─────────────────────────────────
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'mse-images',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// ─── API GET: NetworkFirst with cache fallback ────────────────────
// For API reads — try network first (fresh data), fall back to cache.
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'mse-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 }),
    ],
  }),
);

// ─── API POST/PUT/DELETE: NetworkOnly (no cache) ──────────────────
// Mutations must always hit the network.
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method),
  new NetworkOnly(),
);

// ─── Catch handler: offline fallback ──────────────────────────────
// When a navigation request fails (offline), serve the offline page.
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    const cache = await caches.open('mse-offline');
    const cached = await cache.match('/offline.html');
    if (cached) return cached;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
});

// ─── Background Sync ───────────────────────────────────────────────
// When connection is restored, the browser fires a 'sync' event.
// We notify all clients to flush their pending writes.
self.addEventListener('sync', (event) => {
  if (event.tag === 'mse-sync-queue') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_TRIGGER' });
        });
      })(),
    );
  }
});

// Also listen for 'periodicsync' (Periodic Background Sync API — experimental).
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'mse-periodic-sync') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_TRIGGER' });
        });
      })(),
    );
  }
});

// ─── Push notifications (future) ──────────────────────────────────
// self.addEventListener('push', (event) => {
//   const data = event.data?.json() ?? {};
//   event.waitUntil(
//     self.registration.showNotification(data.title ?? 'إشعار', {
//       body: data.body ?? '',
//       icon: '/icons/icon-192.png',
//       badge: '/icons/icon-192.png',
//     }),
//   );
// });
