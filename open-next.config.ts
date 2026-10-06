import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * ⚡ ROOT FIX — Error 1102 (Worker exceeded resource limits) — 2026-10-06
 * ────────────────────────────────────────────────────────────────────────
 * المشكلة الجذرية اللي كانت بتسبب:
 *   1) «Error 1102 — Worker exceeded resource limits» على صفحات النظام
 *      (المخزون تحديدًا) بعد تصفح كام صفحة، والموقع يقع ويرجع لوحده.
 *   2) الأصفار في المخزون (لما الـ APIs تفشل معاه في نفس نافذة الانهيار).
 *
 * السبب الحقيقي: كل صفحات النظام (36 صفحة: /inventory، /dashboard،
 * /reports...) معمولة prerender وقت البناء وبتتخزن في `.open-next/cache/`
 * — لكن الكونفيج القديم كان بيستخدم الكاش الافتراضي (dummy = ذاكرة
 * داخلية لكل isolate وبتبدأ فاضية). النتيجة: أول طلب لكل صفحة بعد ما
 * Cloudflare تقلّب الـ isolate بيخلي Next.js **يرندر الصفحة من الصفر
 * جوا الـ Worker** (React SSR كامل). خطة Cloudflare المجانية بتيح 10ms
 * CPU للطلب — فالرندر ده بيعدّي الحد أحيانًا → 1102 → Circuit breaker
 * مؤقت → الموقع يقع ويرجع لوحده لما الـ isolate يسخن تاني.
 *
 * الحل: `staticAssetsIncrementalCache` — بيخلي الصفحات المع-mades
 * prerendered ت تتقرأ من **Workers Static Assets** نفسها (ملفات `.cache`
 * اللي بنسخها جوا الـ assets بأمر `populateCache` بعد البناء):
 *   - الطلب بيتقري من الأصول الثابتة عند الحافة بدون React SSR خالص
 *     (تكلفة CPU ~صفر مقارنة بالرندر الكامل)
 *   - read-only ومناسب لتطبيقنا: كل الصفحات ثابتة (البيانات كلها
 *     client-side من الـ APIs) ومفيش ISR — كل deploy بيطلع buildId
 *     جديد فمستحيل تتقري نسخة قديمة
 *   - لو ملف الصفحة مش موجود (حالة استثنائية) بيقع للرندر العادي زي
 *     ما كان — مفيش أي كسر
 *
 * خطوة البناء المطلوبة (اتضافت كـ script `cf:populate` في package.json):
 *   bun run cf:build
 *   bun run cf:populate   ← بتنسخ .open-next/cache → assets/cdn-cgi/_next_cache
 *   wrangler deploy
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
