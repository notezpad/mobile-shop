/**
 * Parses an Egyptian-dialect sentence describing product variants
 * (colors + sizes + quantity) into structured rows ready to inject
 * into ProductVariantsDialog.
 *
 * Pure regex/dictionary based — no AI/API calls, zero runtime cost.
 *
 * Example input:
 *   "طريحة كوتشي فلات أسود وكحلي مقاسات زوجي من 40 لـ 44 والكمية قطعتين"
 * →
 *   colors: ["أسود", "كحلي"]
 *   sizes: ["40", "42", "44"]
 *   quantityPerVariant: 2
 *   variants: 6 rows (each color × each size), each qty = 2
 */

export interface ParsedVariantRow {
  color: string | null
  size: string | null
  quantity: number
}

export interface ParseResult {
  productType: 'shoes' | 'kids' | 'clothing'
  colors: string[]
  sizes: string[]
  quantityPerVariant: number
  variants: ParsedVariantRow[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Dictionaries — extend these freely as you meet new dialect words.
// ---------------------------------------------------------------------------

// Arabic-Indic digits → Latin digits
const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => ARABIC_DIGITS[d] ?? d)
}

// Color aliases (raw dialect form → canonical Arabic name shown in the UI)
const COLOR_MAP: Record<string, string> = {
  'اسود': 'أسود', 'أسود': 'أسود', 'إسود': 'أسود',
  'ابيض': 'أبيض', 'أبيض': 'أبيض', 'إبيض': 'أبيض',
  'كحلي': 'كحلي', 'نيلي': 'كحلي',
  'احمر': 'أحمر', 'أحمر': 'أحمر',
  'ازرق': 'أزرق', 'أزرق': 'أزرق', 'بلو': 'أزرق',
  'سماوي': 'سماوي', 'فيروزي': 'تركواز', 'تركواز': 'تركواز',
  'اخضر': 'أخضر', 'أخضر': 'أخضر', 'زيتي': 'زيتي',
  'اصفر': 'أصفر', 'أصفر': 'أصفر',
  'برتقالي': 'برتقالي',
  'بمبي': 'وردي', 'وردي': 'وردي', 'روز': 'وردي', 'بينك': 'وردي',
  'بنفسجي': 'بنفسجي', 'موف': 'بنفسجي',
  'بني': 'بني', 'كاراميل': 'بني', 'كارمل': 'بني', 'تان': 'بني',
  'بيج': 'بيج', 'كريمي': 'كريمي', 'عاجي': 'كريمي',
  'رمادي': 'رمادي', 'جراي': 'رمادي', 'جري': 'رمادي',
  'فضي': 'فضي', 'ذهبي': 'ذهبي',
  'عنابي': 'عنابي', 'نبيتي': 'عنابي', 'خمري': 'عنابي',
  'فوشيا': 'فوشيا',
}

// Sorted longest-first so "كحلي غامق" (if ever added) matches before "كحلي"
const COLOR_KEYS = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length)

// Letter-size ladder for clothes (S → 5XL)
const LETTER_LADDER = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']

const LETTER_ALIASES: Record<string, number> = {
  'سمول': 0, 's': 0,
  'ميديم': 1, 'ميدم': 1, 'm': 1,
  'لارج': 2, 'l': 2,
  'اكس لارج': 3, 'اكسلارج': 3, 'اكس': 3, 'xl': 3,
  '2 اكس': 4, '2اكس': 4, 'دبل اكس': 4, 'تو اكس': 4, 'xxl': 4, '2xl': 4,
  '3 اكس': 5, '3اكس': 5, 'تريبل اكس': 5, 'ثري اكس': 5, 'xxxl': 5, '3xl': 5,
  '4 اكس': 6, '4اكس': 6, 'xxxxl': 6, '4xl': 6,
  '5 اكس': 7, '5اكس': 7, '5xl': 7,
}
const LETTER_KEYS = Object.keys(LETTER_ALIASES).sort((a, b) => b.length - a.length)

function containsToken(text: string, key: string): boolean {
  // Latin tokens (s, m, l, xl, 2xl...) must match as a whole word to avoid
  // colliding with unrelated substrings; Arabic dialect words are safe to
  // match as plain substrings since they're multi-character phrases.
  if (/^[a-z0-9]+$/i.test(key)) {
    return new RegExp(`(?<![a-z0-9])${key}(?![a-z0-9])`, 'i').test(text)
  }
  return text.includes(key)
}

// Dialect quantity words → number
const QUANTITY_WORDS: Record<string, number> = {
  'قطعة': 1, 'واحدة': 1, 'واحد': 1, 'حبة': 1,
  'قطعتين': 2, 'اتنين': 2, 'إثنين': 2, 'اثنين': 2, 'حبتين': 2,
  'تلات قطع': 3, 'تلاتة': 3, 'ثلاثة': 3,
  'اربع قطع': 4, 'اربعة': 4, 'أربعة': 4,
  'خمس قطع': 5, 'خمسة': 5,
  'ست قطع': 6, 'ستة': 6,
  'سبع قطع': 7, 'سبعة': 7,
  'تمن قطع': 8, 'ثمانية': 8, 'تمانية': 8,
  'تسع قطع': 9, 'تسعة': 9,
  'عشر قطع': 10, 'عشرة': 10,
}
const QUANTITY_KEYS = Object.keys(QUANTITY_WORDS).sort((a, b) => b.length - a.length)

const SHOE_KEYWORDS = ['كوتشي', 'جزمة', 'جزم', 'حذاء', 'صندل', 'شبشب', 'بوت', 'سنيكرز']
const KIDS_KEYWORDS = ['اطفال', 'أطفال', 'بيبي', 'ولادي صغير', 'بنوتي صغير']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectProductType(text: string, productName?: string): 'shoes' | 'kids' | 'clothing' {
  const hay = `${text} ${productName ?? ''}`
  if (SHOE_KEYWORDS.some((k) => hay.includes(k))) return 'shoes'
  if (KIDS_KEYWORDS.some((k) => hay.includes(k))) return 'kids'
  return 'clothing'
}

function extractColors(text: string): string[] {
  const found: string[] = []
  for (const key of COLOR_KEYS) {
    if (text.includes(key)) {
      const canonical = COLOR_MAP[key]
      if (!found.includes(canonical)) found.push(canonical)
    }
  }
  return found
}

function extractQuantity(text: string): { quantity: number; warning?: string } {
  // Prefer a plain number right after "كمية"/"الكمية"/"عدد"
  const numMatch = text.match(/(?:الكمية|كمية|عدد)\s*[:\-]?\s*(\d+)/)
  if (numMatch) return { quantity: parseInt(numMatch[1], 10) }

  for (const key of QUANTITY_KEYS) {
    if (text.includes(key)) return { quantity: QUANTITY_WORDS[key] }
  }
  return { quantity: 1, warning: 'لم يتم التعرف على الكمية، تم افتراض قطعة واحدة لكل تركيبة — راجعها قبل الإضافة' }
}

function expandLetterRange(text: string): string[] {
  // Look for "من X لـ/الى/ل Y"
  const rangeMatch = text.match(/من\s+([\p{L}0-9]+(?:\s+[\p{L}0-9]+)?)\s*(?:الى|إلى|حتى|ل|لـ)\s+([\p{L}0-9]+(?:\s+[\p{L}0-9]+)?)/u)
  if (rangeMatch) {
    const startIdx = matchLetterAlias(rangeMatch[1])
    const endIdx = matchLetterAlias(rangeMatch[2])
    if (startIdx !== null && endIdx !== null) {
      const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
      return LETTER_LADDER.slice(lo, hi + 1)
    }
  }
  // Otherwise, collect any standalone letter-size mentions
  const found: string[] = []
  for (const key of LETTER_KEYS) {
    if (containsToken(text, key)) {
      const label = LETTER_LADDER[LETTER_ALIASES[key]]
      if (!found.includes(label)) found.push(label)
    }
  }
  return found
}

function matchLetterAlias(token: string): number | null {
  const clean = token.trim().toLowerCase()
  for (const key of LETTER_KEYS) {
    if (clean === key || containsToken(clean, key)) return LETTER_ALIASES[key]
  }
  return null
}

function expandNumericRange(text: string): string[] {
  const rangeMatch = text.match(/من\s*(\d+)\s*(?:الى|إلى|حتى|ل|لـ)\s*(\d+)/)
  if (!rangeMatch) {
    // fall back: collect any loose 2-digit numbers mentioned near "مقاس"
    const loose = text.match(/مقاسات?\s*[:\-]?\s*([\d\s,،و]+)/)
    if (loose) {
      return Array.from(new Set(loose[1].match(/\d+/g) ?? []))
    }
    return []
  }
  const start = parseInt(rangeMatch[1], 10)
  const end = parseInt(rangeMatch[2], 10)
  const [lo, hi] = start <= end ? [start, end] : [end, start]

  const isEven = /زوجي/.test(text)
  const isOdd = /فردي/.test(text)
  const step = isEven || isOdd ? 2 : 1

  // If "زوجي"/"فردي" specified, align the starting point to match parity,
  // but always keep the two endpoints the user actually typed.
  const sizes: number[] = []
  for (let n = lo; n <= hi; n += step) sizes.push(n)
  if (sizes[sizes.length - 1] !== hi) sizes.push(hi)
  return sizes.map(String)
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function parseVariantText(rawText: string, productName?: string): ParseResult {
  const warnings: string[] = []
  const text = normalizeDigits(rawText.trim())
  const productType = detectProductType(text, productName)

  const colors = extractColors(text)
  if (colors.length === 0) {
    warnings.push('لم يتم التعرف على أي لون في الجملة')
  }

  let sizes: string[] = []
  const hasLetterHint = LETTER_KEYS.some((k) => containsToken(text, k))
  if (hasLetterHint) {
    sizes = expandLetterRange(text)
  } else {
    sizes = expandNumericRange(text)
  }
  if (sizes.length === 0) {
    warnings.push('لم يتم التعرف على أي مقاس في الجملة')
  }

  const { quantity, warning: qWarning } = extractQuantity(text)
  if (qWarning) warnings.push(qWarning)

  // Build the flat cross-product: every color × every size.
  const variants: ParsedVariantRow[] = []
  const colorList = colors.length ? colors : [null]
  const sizeList = sizes.length ? sizes : [null]
  for (const color of colorList) {
    for (const size of sizeList) {
      if (color === null && size === null) continue
      variants.push({ color, size, quantity })
    }
  }

  return { productType, colors, sizes, quantityPerVariant: quantity, variants, warnings }
}
