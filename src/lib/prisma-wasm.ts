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

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ المرحلة 4 (2026-11-02) — ج-5: Decimal → number عند حدود الـ JSON
// ─────────────────────────────────────────────────────────────────────────────
// حقول المبالغ بقت NUMERIC(12,2) في الداتابيز، و Prisma بيرجّعها
// Prisma.Decimal. مكتبة decimal.js-light بتحوّل القيمة لـ STRING داخل
// JSON.stringify — ده كان هيكسر كل الواجهة (مبالغ كنصوص: «15050 + 0 = 150500»).
//
// الحل: toJSON يرجّع Number. القيم ≤ 12 خانة (سقف NUMERIC(12,2) ≈ 9.99e9)
// و double بيمثّل أعداد بهذا الحجم بدقة كافية للعرض والنقل — الحسابات
// الفعلية بتحصل في SQL أو بـ Decimal قبل الحدّ ده.
// ─────────────────────────────────────────────────────────────────────────────
type DecimalProto = {
  prototype?: {
    toJSON?: () => unknown
    toNumber?: () => number
    toString: () => string
  }
}
function patchDecimalToJson(mod: unknown) {
  const DecimalCtor = (mod as { Prisma?: { Decimal?: DecimalProto } })?.Prisma?.Decimal
  if (DecimalCtor?.prototype) {
    DecimalCtor.prototype.toJSON = function (this: { toNumber?: () => number; toString: () => string }) {
      return typeof this.toNumber === 'function' ? this.toNumber() : Number(this.toString())
    }
  }
}
// 1) نسخة العميل اللي بتبني الـ clients فعلًا (wasm في workerd / default في Node)
patchDecimalToJson(prismaClientModule)
// 2) في workerd فيه نسخة تانية محمّلة من '@prisma/client' الافتراضية (ملفات
//    بتستورد { Prisma } منها مباشرة) — نفس المعالجة عليها. في Node دي نفس
//    الموديل بالفعل فالتغيير لا يذكر.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  patchDecimalToJson(require('@prisma/client'))
} catch {
  /* متاح في workerd فقط — تجاهل */
}
