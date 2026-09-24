# PWA 2026 — مراجعة شاملة وتحديث

## التدقيق (Audit) — الأخطاء التي تم اكتشافها

### 1. Manifest.json — ناقص
| الحقل | قبل | بعد |
|------|------|------|
| `id` | ❌ ناقص | ✅ `/?source=pwa` |
| `display_override` | ❌ ناقص | ✅ `["window-controls-overlay", "standalone", ...]` |
| `orientation` | `"any"` | `"portrait-primary"` (أفضل للموبايل) |
| `launch_handler` | ❌ ناقص | ✅ `{"client_mode": "navigate-existing"}` |
| `edge_side_panel` | ❌ ناقص | ✅ `{"preferred_width": 480}` |
| `screenshots` | ❌ ناقص | ✅ narrow + wide screenshots |
| `prefer_related_applications` | ❌ ناقص | ✅ `false` |
| `shortcuts` | 3 shortcuts | 4 shortcuts (+ المعاملات المالية) |
| Maskable icons | ❌ مش موجود | ✅ 192 + 512 maskable |
| Monochrome icon | ❌ مش موجود | ✅ 512 monochrome |

### 2. Service Worker — تحسينات 2026
| الميزة | قبل | بعد |
|------|------|------|
| Navigation Preload | ❌ | ✅ `self.registration.navigationPreload.enable()` |
| Background Sync | ❌ | ✅ `sync` event → FLUSH_OUTBOX |
| Push Notifications | ❌ | ✅ `push` event + `notificationclick` |
| Periodic Sync | ❌ | ✅ `periodicsync` event |
| Message Handler | SKIP_WAITING فقط | ✅ PRECACHE_URLS + CLEAR_CACHE + GET_CACHE_SIZE |
| Cache version | `v1` | `v2` (تحديث إجباري) |

### 3. Icons — ناقصة
| الأيقونة | قبل | بعد |
|------|------|------|
| 192x192 any | ✅ | ✅ (مُعاد توليدها properly) |
| 512x512 any | ✅ | ✅ |
| 192x192 maskable | ❌ | ✅ جديد |
| 512x512 maskable | ❌ | ✅ جديد |
| 512x512 monochrome | ❌ | ✅ جديد (للإشعارات) |
| apple-touch-icon 180x180 | ❌ | ✅ جديد |
| favicon 32x32 | ❌ | ✅ جديد |
| favicon 16x16 | ❌ | ✅ جديد |

### 4. Layout.tsx — meta tags ناقصة
| الـ tag | قبل | بعد |
|------|------|------|
| `mobile-web-app-capable` | ❌ | ✅ |
| `apple-touch-icon` (180x180) | ❌ | ✅ |
| `favicon` 32x32 + 16x16 | ❌ | ✅ |
| `icon` 192 + 512 | ❌ | ✅ |
| `msapplication-TileColor` | ❌ | ✅ |
| `msapplication-tap-highlight` | ❌ | ✅ |
| `application-name` | ❌ | ✅ |

### 5. PWAInstallPrompt — تحسينات 2026
| الميزة | قبل | بعد |
|------|------|------|
| Dismissal cooldown | دائم | 30 يوم (re-prompt after) |
| `appinstalled` event | ❌ | ✅ tracks install success |
| Animated entrance | `animate-in-up` class | CSS `slideUp` keyframes |
| iOS detection | basic | improved (includes Mac+touch) |
| Platform-specific UI | basic | Android (تثبيت) vs iOS (مشاركة) |

## ميزات 2026 الجديدة

### Window Controls Overlay
```json
"display_override": ["window-controls-overlay", "standalone", ...]
```
يسمح للتطبيق بإخفاء شريط عنوان المتصفح تماماً على desktop — يستخدم المساحة بالكامل.

### Launch Handler
```json
"launch_handler": { "client_mode": "navigate-existing" }
```
لما المستخدم يفتح التطبيق من shortcut أو notification، يفتح في النافذة الموجودة بدل ما يفتح نافذة جديدة.

### Background Sync
```javascript
self.addEventListener('sync', (event) => {
  if (event.tag === 'shop-erp-sync') {
    // Flush outbox when network returns — even if app is closed!
  }
})
```
العمليات الـ offline بتترفع حتى لو التطبيق مقفول — الـ browser بيشغّل الـ SW في الـ background.

### Push Notifications
```javascript
self.addEventListener('push', (event) => {
  // Display notification from server
  self.registration.showNotification(title, { icon, badge, dir: 'rtl', ... })
})
```
السيرفر يقدر يبعت push notifications تظهر حتى لو التطبيق مقفول.

### Navigation Preload
```javascript
self.registration.navigationPreload.enable()
```
يبدأ تحميل الصفحة قبل ما الـ SW يفحص الـ cache — أسرع بكتير.

### Periodic Sync
```javascript
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'shop-erp-refresh') {
    // Refresh data in background — even if app is closed
  }
})
```
يحدّث البيانات في الـ background تلقائياً كل فترة.

## الملفات (15 ملف)

### public/ (11 ملفات)
- `manifest.json` ⭐ محدّث
- `sw.js` ⭐ محدّث (v2)
- `offline.html` ✅
- `icon-192.png` ⭐ مُعاد توليدها
- `icon-512.png` ⭐ مُعاد توليدها
- `icon-192-maskable.png` ⭐ جديد
- `icon-512-maskable.png` ⭐ جديد
- `icon-512-monochrome.png` ⭐ جديد
- `apple-touch-icon.png` ⭐ جديد
- `favicon-32.png` ⭐ جديد
- `favicon-16.png` ⭐ جديد

### src/ (2 ملفات)
- `src/app/layout.tsx` ⭐ محدّث (full PWA meta)
- `src/components/shop/PWAInstallPrompt.tsx` ⭐ محدّث (2026)

## خطوات التطبيق

1. انسخ كل الملفات فوق الملفات الأصلية
2. **مهم**: احذف `.next/` (عشان الـ SW القديم ما يتعارضش)
   ```bash
   rm -rf .next
   ```
3. `npm run dev`
4. افتح Chrome → DevTools → Application → Manifest
   - لازم تشوف كل الحقول مُعبّأة
   - Icons كلها ظاهرة (any + maskable + monochrome)
   - Screenshots معرّضة
   - Shortcuts = 4
5. DevTools → Application → Service Workers
   - لازم تشوف `shop-erp-v2` شغّال
   - `Navigation Preload` = enabled
6. جرّب التثبيت:
   - Chrome: أيقونة تثبيت في شريط URL
   - iOS: Share → Add to Home Screen

الحزمة: `/home/z/my-project/download/shop_erp_pwa_2026.zip`
