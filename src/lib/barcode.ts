// EAN-13 starting with "20" (in-store / internal-use range — never clashes
// with real manufacturer barcodes, which never start with 20-29 in Egypt's
// normal retail scanning).
export function generateEan13(): string {
  const digits = [2, 0]
  // crypto بدل Math.random: توزيع أفضل وتصادم أقل (متاح في المتصفح وNode).
  // rejection sampling: نرفض البايتات ≥ 250 عشان `% 10` ما يخلّيش الأرقام 0–5 أكتر احتمالاً.
  const buf = new Uint8Array(32)
  let pos = buf.length
  while (digits.length < 12) {
    if (pos >= buf.length) {
      globalThis.crypto.getRandomValues(buf)
      pos = 0
    }
    const b = buf[pos++]
    if (b < 250) digits.push(b % 10)
  }
  // checksum
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  const checksum = (10 - (sum % 10)) % 10
  digits.push(checksum)
  return digits.join('')
}

/**
 * Generate an EAN-13 that isn't in `existing` — used when assigning several
 * barcodes in the same batch (e.g. one per variant row), so two rows can't
 * end up with the same randomly-generated code before the server even gets
 * a chance to reject the duplicate.
 */
export function generateUniqueEan13(existing: Set<string> | string[]): string {
  const used = existing instanceof Set ? existing : new Set(existing)
  for (let i = 0; i < 1000; i++) {
    const code = generateEan13()
    if (!used.has(code)) return code
  }
  // مستحيل عملياً (10 أرقام عشوائية) — لكن مانرجّعش كود مكرر بصمت أبداً
  throw new Error('تعذّر توليد باركود غير مكرر')
}

/** يتحقق إن النص EAN-13 سليم (13 رقم + checksum صح). */
export function isValidEan13(code: string | null | undefined): boolean {
  if (!code || !/^\d{13}$/.test(code)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === Number(code[12])
}

/**
 * UPC-A (12 رقم + checksum صح؟) — UPC-A في الحقيقة EAN-13 بصفر في الأول،
 * فنرسمه EAN-13: أضيق (~95 وحدة بدل ~167 في CODE128) فالمقاسات الصغيرة زي
 * 30×20 تطلع بعرض وحدة 0.25مم بدل نقطة طابعة واحدة، والسكانر بيرجّع نفس
 * الـ 12 رقم المخزّنين. (وزن الـ checksum متطابق: الأوزان بتاعة EAN-13 على
 * «0 + الكود» بتعطي نفس رقم فحص UPC-A.)
 */
export function isValidUpcA(code: string | null | undefined): boolean {
  if (!code || !/^\d{12}$/.test(code)) return false
  let sum = 0
  for (let i = 0; i < 11; i++) sum += Number(code[i]) * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(code[11])
}

/**
 * صيغة الرسم المناسبة للقيمة: EAN-13 للأكواد اللي بتتولّد عندنا (والأكواد الدولية السليمة
 * وUPC-A) عشان تطلع أضيق (~95 وحدة بدل ~123 في CODE128)، وغير كده CODE128 (يقبل أي نص).
 */
export function barcodeFormatFor(value: string): 'EAN13' | 'CODE128' {
  return isValidEan13(value) || isValidUpcA(value) ? 'EAN13' : 'CODE128'
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹'

/**
 * تنظيف الباركود قبل الحفظ/الطباعة: يحوّل الأرقام العربية (٠-٩) والفارسية (۰-۹) لإنجليزي،
 * ويشيل الحروف المخفية (zero-width / RTL marks / NBSP) والمسافات الطرفية.
 * بيرجّع null لو فاضي. لازم يتطبّق على السيرفر قبل فحص التكرار والحفظ.
 */
export function normalizeBarcode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXT_ARABIC_INDIC.indexOf(d)))
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00A0]/g, '')
    .trim()
  return s || null
}

/** CODE128 بيقبل ASCII المطبوع بس (32–126). أي حاجة برّه كده مش هتترسم. */
export function isRenderableBarcode(value: string | null | undefined): value is string {
  return !!value && /^[\x20-\x7E]+$/.test(value)
}
