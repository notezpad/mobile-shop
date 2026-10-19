/**
 * ⚡ RUNTIME FIX (2026-10-05 — "الموقع واقع ومفيش بيانات"):
 * ─────────────────────────────────────────────────────────────────────
 * المشكلة: PrismaClient الافتراضي ('@prisma/client') بيحمّل query compiler
 * WASM بـ `fs.readFileSync` — وحاضنة Cloudflare Workers مافيهاش fs، فكل
 * استعلام قاعدة بيانات في الإنتاج كان بينفجر بـ:
 *   [unenv] fs.readFileSync is not implemented yet!
 *   at Object.getQueryCompilerWasmModule
 * النتيجة: كل الـ APIs بترجع 500 ← مفيش بيانات ← شاشات فاضية/سودا.
 *
 * الحل: نسخة العميل المخصصة للـ WASM ('@prisma/client/wasm') بتستورد ملف
 * الـ .wasm كـ import حقيقي — والده المدعوم في workerd. لكن نفس النسخة دي
 * بتكسر وضع التطوير على Node (Turbopack dev مش قادر يحمّل .wasm كـ module)،
 * فبنختار النسخة حسب بيئة التشغيل الفعلية:
 *
 *   - Cloudflare Workers (navigator.userAgent === 'Cloudflare-Workers')
 *       → نسخة WASM (بتستورد الـ .wasm — شغالة في workerd)
 *   - Node.js (تطوير/بناء/اختبارات)
 *       → النسخة الافتراضية (fs متاح — شغالة عادي)
 *
 * ملاحظات:
 *  1) النسختين بيتقاسما نفس runtime بتاع @prisma/client — الفرق فقط في
 *     طريقة تحميل الـ compiler، فتأثير الحجم على الـ bundle ضئيل.
 *  2) من غير الـ require() هنا، Turbopack بيفشل في حل '@prisma/client/wasm'
 *     لأن خريطة exports بتاعة Prisma بتحوّل "import" إلى ملف ./wasm.mjs
 *     غير موجود في الحزمة (bug في التغليف) — شرط "require" شغال تمام.
 *  3) `import 'pg-cloudflare'` لازم يفضل أول استيراد في db.ts قبل أي
 *     استخدام لـ pg — مش متأثر بالتغيير ده.
 */

const isCloudflareWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

 
const prismaClientModule: typeof import('@prisma/client') = isCloudflareWorkers
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@prisma/client/wasm')
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@prisma/client')

export const PrismaClient = prismaClientModule.PrismaClient
export type PrismaClientType = InstanceType<typeof PrismaClient>
