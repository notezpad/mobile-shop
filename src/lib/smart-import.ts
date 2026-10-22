/**
 * 🧠 2026-10-22 — محرك «الاستيراد الذكي للمنتجات الافتتاحية» (Excel → المنتجات)
 *
 * الهدف: العميل جاي من شيتات إكسيل متنوعة الشكل (أسماء أعمدة مختلفة، أرقام
 * عربية-هندية، صفوف عناوين زخرفية فوق الجدول، أكتر من شيت...) — المحرك ده
 * «بيفهم طبيعة الشيت» ويحط كل عمود في مكانه الصح بناءً على حقول النظام،
 * ويكتشف الأخطاء ويصلّحها تلقائيًا قبل التنفيذ.
 *
 * الملف ده PURE (مفيش DB ولا NextRequest) — بيتستخدم من مسارات الـ API
 * ومن الواجهة (أنواع + تسميات) من غير ما يجر أي حاجة ثقيلة.
 * مكتبة القراءة هي نفس مكتبة التصدير الموجودة أصلًا: xlsx-js-style.
 */

import type * as XLSXNamespace from 'xlsx-js-style'

// ─────────────────────────────────────────────────────────────────────────────
// الثوابت
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB
export const MAX_ROWS = 2000 // أقصى عدد صفوف بيانات في الاستيراد الواحد
export const MAX_COLS = 30 // أقصى عدد أعمدة ناخد بالنا منه

/** حقول النظام المدعومة في الاستيراد — الترتيب هو ترتيب العرض في الواجهة */
export const IMPORT_FIELDS = [
  'name',
  'barcode',
  'quantity',
  'cost',
  'price',
  'category',
  'unit',
  'minQuantity',
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

export const FIELD_LABELS: Record<ImportField, string> = {
  name: 'اسم المنتج',
  barcode: 'الباركود',
  quantity: 'الكمية (المخزون الافتتاحي)',
  cost: 'سعر التكلفة',
  price: 'سعر البيع',
  category: 'التصنيف',
  unit: 'وحدة القياس',
  minQuantity: 'حد التنبيه',
}

export const FIELD_REQUIRED: Partial<Record<ImportField, boolean>> = { name: true }

/**
 * قاموس المرادفات العربي (مصري + فصحى) والإنجليزي لكل حقل.
 * التطبيع بيحصل قبل المقارنة (شيل التشكيل ووحّد الهمزات...) — اكتب المرادفات
 * بالشكل البسيط: «سعر الشراء» مش محتاجة همزات.
 */
const FIELD_ALIASES: Record<ImportField, string[]> = {
  name: [
    'اسم المنتج', 'اسم الصنف', 'الصنف', 'المنتج', 'الاسم', 'اسم', 'السلعة',
    'اسم السلعة', 'البيان', 'product', 'product name', 'item', 'item name',
    'name', 'description',
  ],
  barcode: [
    'الباركود', 'باركود', 'باركود المنتج', 'كود المنتج', 'الكود', 'كود',
    'كود الصنف', 'sku', 'barcode', 'code', 'product code', 'upc', 'ean',
  ],
  quantity: [
    'الكمية', 'الكميه', 'كمية', 'كميه', 'الموجود', 'المتوفر', 'المخزون',
    'الرصيد', 'رصيد', 'رصيد اول المدة', 'رصيد أول المدة', 'الرصيد الافتتاحي',
    'الكمية الافتتاحية', 'المخزون الافتتاحي', 'العدد', 'عدد', 'الجرد',
    'qty', 'quantity', 'stock', 'opening stock', 'opening balance',
  ],
  cost: [
    'التكلفة', 'التكلفه', 'تكلفة', 'تكلفه', 'سعر الشراء', 'شراء',
    'سعر التكلفة', 'تكلفة الشراء', 'سعر الوارد', 'cost', 'purchase price',
    'buy price', 'س ش', 'س.ش',
  ],
  price: [
    'سعر البيع', 'البيع', 'السعر', 'سعر', 'سعر التجزئة', 'سعر الوحدة',
    'سعر الجملة', 'price', 'selling price', 'sale price', 'retail', 'س ب', 'س.ب',
  ],
  category: [
    'التصنيف', 'تصنيف', 'الفئة', 'الفئه', 'فئة', 'فئه', 'التصنيفات',
    'المجموعة', 'القسم', 'النوع', 'category', 'cat', 'group', 'section',
  ],
  unit: ['الوحدة', 'وحدة', 'وحدة القياس', 'الوحدة القياسية', 'unit'],
  minQuantity: [
    'حد التنبيه', 'الحد الادنى', 'الحد الأدنى', 'حد الطلب', 'التنبيه',
    'ادنى كمية', 'min', 'minimum', 'min quantity', 'reorder',
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// تطبيع النص العربي
// ─────────────────────────────────────────────────────────────────────────────

/** حروف لا تُرى ولا تُقصد: علامات اتجاه/تقطيع/مسافات خاصة */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u00A0\uFEFF]/g
/** تشكيل + تطويل */
const TASHKEEL_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u0640]/g

/**
 * 🧾 2026-10-22 (جولة التصدير→الاستيراد): ملفات التصدير بتكتب '-' في خلايا
 * الباركود/التصنيف الفاضية عشان الشيت يبقى مقروء في الطباعة. المحرك ده كان
 * بياخدها كقيم حقيقية → باركود '-' مزيف، تصنيف اسمه '-'، وخطأ كاذب
 * «نفس الباركود مستخدم لمنتجين». دلوقتي أي قيمة من دي بتتعامل كفاضية.
 */
const PLACEHOLDER_VALUES = new Set(['-', '–', '—', '_', '.', '..', 'لا يوجد', 'مفيش', 'فاضي', 'none', 'null', 'nil', 'n/a', 'na'])

export function isPlaceholderText(v: unknown): boolean {
  const s = cleanCellText(v).toLowerCase()
  if (!s) return true
  // شرطات ونجوم ونقط متكررة: «---» «***» «___»
  if (/^[-–—_.*•·]+$/.test(s)) return true
  return PLACEHOLDER_VALUES.has(s)
}

/**
 * 🧾 صف الإجمالي: ملفات التصدير بتنتهي بصف «الإجمالي» بجمع الكميات —
 * لو اترفعت للنظام كان هيتعمل منتج اسمه «الإجمالي» بمخزون = مجموع الشيت!
 * (اتأكدنا من ده في اختبار الجولة الكاملة). دلوقتي بيكتشف ويشال تلقائيًا.
 */
export function isTotalsRowLabel(name: string): boolean {
  const nk = normalizeKey(name)
  if (!nk) return false
  if (nk === 'الاجمالي' || nk.startsWith('اجمالي')) return true
  if (nk === 'المجموع' || nk === 'مجموع' || nk === 'الجمع') return true
  if (nk === 'total' || nk === 'totals' || nk === 'grandtotal' || nk === 'sum') return true
  return false
}

/** تنظيف عرضي: مسافات/حروف مخفية — بيستخدم كـ«إصلاح تلقائي» للقيم نفسها */
export function cleanCellText(v: unknown): string {
  if (v == null) return ''
  return String(v)
    .replace(INVISIBLE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** مفتاح مطابقة: تطبيع عنيف للمقارنة (همزات/تاء مربوطة/ألف مقصورة/مسافات/حروف لاتينية) */
export function normalizeKey(s: string): string {
  return cleanCellText(s)
    .replace(TASHKEEL_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '') // كل غير حرف/رقم يتشال (مسافات وعلامات)
}

// ─────────────────────────────────────────────────────────────────────────────
// تحليل الأرقام الذكي
// ─────────────────────────────────────────────────────────────────────────────

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export interface SmartNumber {
  kind: 'missing' | 'ok' | 'error'
  value?: number
  /** إيه اللي اتصلح تلقائيًا — بيظهر للعميل في خانة «الإصلاحات» */
  fixNote?: string
  /** رسالة خطأ لو القيمة مش مفهومة خالص */
  error?: string
}

/**
 * بيحوّل نص شيت واقعي لرقم نظيف:
 *   «١٠٫٥» → 10.5    «1,250» → 1250    «10 كيلو» → 10 (ملاحظة إصلاح)
 *   «صفر» → 0        «لا يوجد» → 0     «-» → 0
 *   «12.5ج» → 12.5   «EGP 45» → 45
 * وسلبية الكمية/السعر → خطأ مش رقم.
 */
export function parseSmartNumber(raw: unknown): SmartNumber {
  const original = cleanCellText(raw)
  if (!original) return { kind: 'missing' }

  let s = original.replace(INVISIBLE_RE, '')

  // كلمات «صفرية» شائعة
  if (/^(صفر|لا يوجد|مفيش|-|—|_|\.)$/i.test(s.trim())) {
    return { kind: 'ok', value: 0, fixNote: `«${original}» → 0` }
  }

  // أرقام عربية-هندية وفارسية → لاتيني
  let digitFixed = false
  s = s.replace(/[٠-٩]/g, (d) => {
    digitFixed = true
    return String(AR_DIGITS.indexOf(d))
  })
  s = s.replace(/[۰-۹]/g, (d) => {
    digitFixed = true
    return String(FA_DIGITS.indexOf(d))
  })

  // فواصل عربية/أجنبية: ٫ عشري، ٬ و , فاصلة آلاف (لو شكلها فاصلة آلاف)
  let sepFixed = false
  if (/[٫٬]/.test(s)) {
    sepFixed = true
    s = s.replace(/٫/g, '.').replace(/٬/g, '')
  }
  if (/\d{1,3}(,\d{3})+/.test(s)) {
    sepFixed = true
    s = s.replace(/,/g, '')
  } else if (/,\d{1,2}(\D|$)/.test(s)) {
    // «12,50» بنمط أوروبي = عشري
    sepFixed = true
    s = s.replace(',', '.')
  }

  // أوزان وعملات ووحدات جنب الرقم
  const beforeStrip = s
  s = s.replace(
    /(جنيه|جنيهات|ج\.?\s?م|مصر|ريال|درهم|دينار|ليره|ليرة|شيكل|روبيه?|egp|le\b|usd|\$|€|£|كيلو|كجم|ك\.?ج|جرام|ج\b|لتر|علبه|علبة|كرتونه|كرتونة|حبه|حبة|قطعه|قطعة|_pkt|kg|gm|ltr)/gi,
    '',
  )
  const strippedWords = s !== beforeStrip
  s = s.trim()

  // استخراج أول رقم (لو في نص حواليه زي «10 كيلو» أو «عمره 5 سنين» غلط شائع)
  const m = s.match(/(-?\d+(?:\.\d+)?)/)
  if (!m) {
    return { kind: 'error', error: `قيمة غير مفهومة: «${original.slice(0, 40)}»` }
  }
  let value = parseFloat(m[1])

  // «10/2» بنية كسر؟ لو فيه / بين رقمين صغيرين نفسرها كسر
  const frac = s.match(/^(\d{1,4})\s*\/\s*(\d{1,4})$/)
  if (frac && Number(frac[2]) > 0) {
    value = Number(frac[1]) / Number(frac[2])
    return { kind: 'ok', value: Math.round(value * 1000) / 1000, fixNote: `«${original}» → ${value} (فُسّرت ككسر)` }
  }

  const notes: string[] = []
  if (digitFixed) notes.push('أرقام عربية اتحولت لإرقام عادية')
  if (sepFixed) notes.push('فواصل الأرقام اتصحّحت')
  if (strippedWords) notes.push('الرقم اتعزل من نص الوحدة/العملة')

  if (value < 0) {
    return { kind: 'error', error: `قيمة سالبة (${value}) — الكميات والأسعار لازم تكون صفر أو أكثر` }
  }
  value = Math.round(value * 1000) / 1000
  if (notes.length) return { kind: 'ok', value, fixNote: `${original} → ${value} (${notes.join(' + ')})` }
  return { kind: 'ok', value }
}

// ─────────────────────────────────────────────────────────────────────────────
// قراءة ملف الإكسيل
// ─────────────────────────────────────────────────────────────────────────────

export interface SheetInfo {
  name: string
  /** عدد الصفوف غير الفاضية */
  rows: number
  /** أفضل صف عناوين مرشح (0-based داخل الشيت) */
  headerRow: number
  /** عدد الحقول المتعرف عليها في الشيت ده */
  matchedFields: number
}

export interface ParsedWorkbook {
  sheetName: string
  sheetsInfo: SheetInfo[]
  headers: string[]
  /** الصفوف قبل صف العناوين (زخرفية/عناوين مطبوعة) — بيتشالوا تلقائيًا */
  junkRows: number
  rows: string[][]
  truncated: boolean
  /** الشيت ده بدون صف عناوين؟ (الصف الأول بيانات مباشرة) */
  headerless: boolean
}

async function loadXLSX(): Promise<typeof XLSXNamespace> {
  // نفس مكتبة التصدير — القراءة منها متاحة (SheetJS core)
  const mod = await import('xlsx-js-style')
  return (mod.default ?? mod) as typeof XLSXNamespace
}

/**
 * ملفات CSV من وندوز بترفض أحيانًا UTF-8 (بتطلع رموز غريبة ØÙ...).
 * بنفك الترميزين ونختار اللي فيه حروف عربية أكتر.
 */
function decodeCsv(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const arabicCount = (s: string) => (s.match(/[\u0600-\u06FF]/g) || []).length
  if (!/\uFFFD/.test(utf8)) {
    // لو UTF-8 سليم وفيه عربي — تمام. لو مفيش عربي خالص ومفيش رموز تالفة، UTF-8 برضه
    return utf8
  }
  try {
    const cp1256 = new TextDecoder('windows-1256').decode(bytes)
    return arabicCount(cp1256) >= arabicCount(utf8) ? cp1256 : utf8
  } catch {
    return utf8
  }
}

/** شيل صفر من اليمين للقيم الرقمية المكتوبة كسر عشري في الإكسيل: 6221036.0 → نص نظيف */
function cellToString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number') {
    // أرقام كبيرة جدًا (باركود) بيتحولوا scientific notation — نرجعهم نص عادي
    if (Number.isInteger(v) && Math.abs(v) >= 1e12) return v.toFixed(0)
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا'
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

function gridIsRowEmpty(row: unknown[]): boolean {
  return row.every((c) => cleanCellText(cellToString(c)) === '')
}

/**
 * «بيفهم طبيعة الشيت»:
 * 1) يدور على صف العناوين الحقيقي في أول 15 صف (بمطابقة قاموس المرادفات)
 * 2) يختار الشيت الأنسب لو الملف فيه أكتر من شيت
 * 3) يرجّع الشبكة جاهزة: headers + صفوف بيانات نصية
 */
export async function parseWorkbook(
  buf: ArrayBuffer,
  fileName: string,
  preferredSheet?: string,
): Promise<ParsedWorkbook> {
  const XLSX = await loadXLSX()
  const isCsv = /\.csv$/i.test(fileName)
  const wb = isCsv
    ? XLSX.read(decodeCsv(buf), { type: 'string' })
    : XLSX.read(new Uint8Array(buf), { type: 'array' })

  if (!wb.SheetNames.length) {
    throw new Error('الملف فاضي — مفيش أي شيت جواه')
  }

  // نجمع شبكات كل الشيتات مرة واحدة
  const grids = new Map<string, unknown[][]>()
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    }) as unknown[][]
    grids.set(name, grid)
  }

  // كشف صف العناوين لكل شيت + اختيار الشيت الأنسب
  const infos: SheetInfo[] = []
  for (const [name, grid] of grids) {
    const hr = detectHeaderRow(grid)
    infos.push({
      name,
      rows: Math.max(0, grid.length - (hr.row ?? 0) - 1),
      headerRow: hr.row ?? 0,
      matchedFields: hr.matchedFields,
    })
  }
  infos.sort((a, b) => b.matchedFields - a.matchedFields || b.rows - a.rows)

  let chosen = preferredSheet && grids.has(preferredSheet) ? preferredSheet : infos[0]?.name
  if (!chosen || !grids.has(chosen)) chosen = wb.SheetNames[0]
  const grid = grids.get(chosen) ?? []
  const info = infos.find((i) => i.name === chosen)

  const hr = detectHeaderRow(grid)
  const headerIdx = hr.row // null = شيت بدون صف عناوين
  const headerless = headerIdx == null

  let headers: string[]
  let dataStart: number
  let junkRows: number
  if (headerless) {
    // الشيت ملوش عناوين؟ عمّم أسماء أعمدة والعميل يحدد يدويًا في خطوة الأعمدة
    const width = Math.min(MAX_COLS, Math.max(...grid.slice(0, 20).map((r) => r.length), 1))
    headers = Array.from({ length: width }, (_, i) => `العمود ${i + 1}`)
    dataStart = 0
    junkRows = 0
  } else {
    headers = (grid[headerIdx!] ?? []).slice(0, MAX_COLS).map((c) => cleanCellText(cellToString(c)) || `عمود ${1}`)
    // سيب أي عمود فاضي باسم واضح بدل «»
    headers = headers.map((h, i) => h || `العمود ${i + 1}`)
    dataStart = headerIdx! + 1
    junkRows = headerIdx!
  }

  let truncated = false
  const out: string[][] = []
  for (let i = dataStart; i < grid.length; i++) {
    const row = grid[i]
    if (gridIsRowEmpty(row)) continue
    if (out.length >= MAX_ROWS) {
      truncated = true
      break
    }
    out.push(row.slice(0, MAX_COLS).map(cellToString))
  }

  const sheetsInfo = infos.map((i) => ({ ...i, rows: Math.min(i.rows, MAX_ROWS) }))

  return {
    sheetName: chosen,
    sheetsInfo,
    headers,
    junkRows: headerless ? 0 : (info?.headerRow ?? junkRows ?? 0),
    rows: out,
    truncated,
    headerless,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// كشف صف العناوين + مطابقة الأعمدة
// ─────────────────────────────────────────────────────────────────────────────

interface HeaderRowHit {
  row: number | null
  matchedFields: number
}

function scoreHeaderCell(cellNorm: string): { field: ImportField; score: number } | null {
  if (!cellNorm) return null
  let best: { field: ImportField; score: number } | null = null
  for (const field of IMPORT_FIELDS) {
    for (const alias of FIELD_ALIASES[field]) {
      const a = normalizeKey(alias)
      if (!a) continue
      let score = 0
      if (cellNorm === a) score = 1
      else if (cellNorm.length >= a.length && cellNorm.includes(a)) score = 0.75
      else if (a.length >= 4 && a.includes(cellNorm) && cellNorm.length >= 3) score = 0.6
      if (score > 0 && (!best || score > best.score)) best = { field, score }
    }
  }
  return best
}

function detectHeaderRow(grid: unknown[][]): HeaderRowHit {
  const lookAt = Math.min(15, grid.length)
  let bestRow: number | null = null
  let bestScore = 0
  for (let r = 0; r < lookAt; r++) {
    const row = grid[r] ?? []
    let score = 0
    const seen = new Set<ImportField>()
    for (const cell of row.slice(0, MAX_COLS)) {
      const hit = scoreHeaderCell(normalizeKey(cleanCellText(cellToString(cell))))
      if (hit && !seen.has(hit.field)) {
        seen.add(hit.field)
        score += hit.score
      }
    }
    // صف عناوين مقبول لازم يطابق حقلين على الأقل (اسم + كمية/سعر مثلاً)
    if (score >= 1.4 && score > bestScore) {
      bestScore = score
      bestRow = r
    }
  }
  return { row: bestRow, matchedFields: Math.round(bestScore) }
}

export interface MappingResult {
  mapping: Partial<Record<ImportField, number>>
  confidence: Partial<Record<ImportField, number>>
  /** حقول اتعرفت بثقة عالية — الواجهة بتعلّم عليها «تم اكتشافه تلقائيًا» */
  autoDetected: ImportField[]
}

/** مطابقة أعمدة الشيت لحقول النظام — جشع بالأعلى ثقة، كل عمود وحقل بيتاخدوا مرة */
export function detectMapping(headers: string[], headerless: boolean): MappingResult {
  const mapping: Partial<Record<ImportField, number>> = {}
  const confidence: Partial<Record<ImportField, number>> = {}
  const autoDetected: ImportField[] = []

  if (headerless) return { mapping, confidence, autoDetected }

  const candidates: { field: ImportField; col: number; score: number }[] = []
  headers.forEach((h, col) => {
    const norm = normalizeKey(h)
    const hit = scoreHeaderCell(norm)
    if (hit) candidates.push({ field: hit.field, col, score: hit.score })
  })
  candidates.sort((a, b) => b.score - a.score || a.col - b.col)

  const usedCols = new Set<number>()
  for (const c of candidates) {
    if (mapping[c.field] !== undefined || usedCols.has(c.col)) continue
    if (c.score < 0.6) continue
    mapping[c.field] = c.col
    confidence[c.field] = c.score
    if (c.score >= 0.75) autoDetected.push(c.field)
    usedCols.add(c.col)
  }
  return { mapping, confidence, autoDetected }
}

// ─────────────────────────────────────────────────────────────────────────────
// التحقق + الإصلاح التلقائي للصفوف
// ─────────────────────────────────────────────────────────────────────────────

export type RowStatus = 'ok' | 'fixed' | 'warn' | 'error' | 'blank'

export interface ParsedRow {
  /** رقم الصف كما يظهر في الشيت (1-based بين صفوف البيانات) */
  idx: number
  status: RowStatus
  /** القيم النظيفة الجاهزة للنظام */
  name: string
  barcode: string | null
  quantity: number
  cost: number | null
  price: number | null
  category: string | null
  unit: string | null
  minQuantity: number | null
  /** ملاحظات الإصلاح التلقائي */
  fixes: string[]
  errors: string[]
  warnings: string[]
  /** صف مكرر داخل الملف — كميته بتتجمع على الصف ده */
  mergedInto: number | null
  /** المنتج موجود أصلًا في القاعدة (بالباركود أو بالاسم بعد التطبيع) */
  existsInDb: { id: number; name: string; byBarcode: boolean; active: boolean } | null
}

export interface ImportStats {
  totalRows: number
  ok: number
  fixed: number
  warn: number
  errors: number
  blank: number
  duplicatesInFile: number
  existsInDb: number
  truncated: boolean
  junkRows: number
  headerless: boolean
  /** إجمالي الكمية الافتتاحية — بيظهر كتأكيد قبل التنفيذ */
  totalQty: number
}

export interface ValidationPayload {
  rows: ParsedRow[]
  stats: ImportStats
  mappingIssues: string[]
}

export interface ValidateOptions {
  /** المنتج موجود في القاعدة: add = زوّد كميته، skip = سيبه، update = زوّد وحدّث سعره */
  mergeMode?: 'add' | 'skip' | 'update'
  /** أرقام صفوف مستثناة يدويًا من الواجهة */
  excluded?: number[]
}

function getCell(row: string[], col: number | undefined): string {
  if (col === undefined || col < 0 || col >= row.length) return ''
  return row[col] ?? ''
}

/**
 * الفحص الكامل لكل صف:
 *   - تنظيف النصوص (حروف مخفية/مسافات) + تحويل الأرقام العربية
 *   - فحص الاسم/الكمية/الأسعار/الباركود
 *   - دمج المكرر داخل الملف تلقائيًا
 *   - تعليم الموجود في القاعدة (القرار حسب mergeMode)
 */
export function validateRows(
  headers: string[],
  rawRows: string[][],
  mapping: Partial<Record<ImportField, number>>,
  opts: ValidateOptions = {},
): ValidationPayload {
  const mappingIssues: string[] = []
  if (mapping.name === undefined) {
    mappingIssues.push('حدّد عمود «اسم المنتج» — من غيره مينفعش نستورد أي صف')
  }

  const rows: ParsedRow[] = []
  const byBarcode = new Map<string, number>() // باركود → idx أول صف
  const byName = new Map<string, number>() // اسم مُطبّع → idx أول صف
  let dups = 0
  let existsCount = 0
  let totalQty = 0

  rawRows.forEach((raw, i) => {
    const idx = i + 1
    const nameRaw = getCell(raw, mapping.name)
    const hasAnyValue = raw.some((c) => cleanCellText(c) !== '')

    if (!cleanCellText(nameRaw) && !hasAnyValue) {
      rows.push(emptyRow(idx, 'blank'))
      return
    }

    const fixes: string[] = []
    const errors: string[] = []
    const warnings: string[] = []

    // ── الاسم (مطلوب) ──
    const name = cleanCellText(nameRaw)
    if (!name) {
      errors.push('اسم المنتج فاضي')
    } else if (name !== nameRaw) {
      fixes.push('تنظيف مسافات/حروف مخفية في الاسم')
    }

    // ── 🧾 صف الإجمالي (آخر صف في ملفات التصدير) ──
    // بيتشال تلقائيًا قبل أي فحص — مش بيتسجل كمنتج ولا بيدخل في التكرارات
    if (name && isTotalsRowLabel(name)) {
      rows.push({
        idx, status: 'blank', name, barcode: null, quantity: 0, cost: null, price: null,
        category: null, unit: null, minQuantity: null,
        fixes: [`صف «${name}» ده صف الإجمالي بتاع التصدير — اتشال تلقائيًا (مش منتج)`],
        errors: [], warnings: [], mergedInto: null, existsInDb: null,
      })
      return
    }

    // ── الباركود ──
    let barcode: string | null = null
    const bcRaw = cleanCellText(getCell(raw, mapping.barcode))
    if (bcRaw) {
      let bc: string | null = bcRaw.replace(INVISIBLE_RE, '').trim()
      if (bc !== bcRaw) fixes.push('تنظيف الباركود من حروف مخفية')
      // 🧾 «-» و«لا يوجد» و«---» = منتج بدون باركود (شكل التصدير للخلية الفاضية)
      if (bc && isPlaceholderText(bc)) {
        bc = null
        fixes.push('الباركود كان فاضي مكتوب فيه شرطة — اتعامل معاه كمنتج بدون باركود')
      }
      // 6221036.0 → 6221036 (إكسيل بيحوّل الأرقام الطويلة لكسر عشري)
      if (bc && /^\d+\.0+$/.test(bc)) {
        bc = bc.split('.')[0]
        fixes.push('الباركود كان شكله رقم عشري — اتصلّح')
      }
      // صيغة علمية 6.22103E+12 → مستحيل نسترجع الرقم، نعلّم على السطر
      if (bc && /^\d(\.\d+)?E\+?\d+$/i.test(bc)) {
        errors.push('الباركود مكتوب بصيغة علمية مفقود منه أرقام — افتح الخلية في إكسيل وخلّيها «نص» ثم اكتب الرقم كامل')
        bc = null
      }
      if (bc && bc.length > 64) {
        errors.push('الباركود أطول من الطبيعي (64 حرف)')
        bc = null
      }
      barcode = bc || null
    }

    // ── الكمية ──
    let quantity = 0
    const qRes = parseSmartNumber(getCell(raw, mapping.quantity))
    if (qRes.kind === 'error') errors.push(`الكمية: ${qRes.error}`)
    else if (qRes.kind === 'missing') warnings.push('الكمية فاضية — هتتسجل 0 (المنتج يدخل بدون مخزون افتتاحي)')
    else {
      quantity = qRes.value ?? 0
      if (qRes.fixNote) fixes.push(`الكمية: ${qRes.fixNote}`)
    }

    // ── السعر والتكلفة ──
    const costCol = mapping.cost
    const priceCol = mapping.price
    let cost: number | null = null
    let price: number | null = null
    if (costCol !== undefined) {
      const cRes = parseSmartNumber(getCell(raw, costCol))
      if (cRes.kind === 'error') warnings.push(`التكلفة: ${cRes.error} — هتتسجل 0`)
      else if (cRes.kind === 'ok') {
        cost = cRes.value ?? 0
        if (cRes.fixNote) fixes.push(`التكلفة: ${cRes.fixNote}`)
      }
    }
    if (priceCol !== undefined) {
      const pRes = parseSmartNumber(getCell(raw, priceCol))
      if (pRes.kind === 'error') warnings.push(`سعر البيع: ${pRes.error} — هتتسجل 0`)
      else if (pRes.kind === 'ok') {
        price = pRes.value ?? 0
        if (pRes.fixNote) fixes.push(`سعر البيع: ${pRes.fixNote}`)
      }
    }
    if (cost !== null && price !== null && cost > 0 && price > 0 && cost > price) {
      warnings.push('سعر التكلفة أعلى من سعر البيع — راجع الأرقام (ممكن تكون متعمدة)')
    }

    // ── التصنيف والوحدة وحد التنبيه ──
    // 🧾 «-» في التصنيف/الوحدة (شكل التصدير للفاضي) مش تصنيف حقيقي
    const catRaw = cleanCellText(getCell(raw, mapping.category))
    if (catRaw && isPlaceholderText(catRaw)) fixes.push('التصنيف كان فاضي مكتوب فيه شرطة — اتشال')
    const category = !catRaw || isPlaceholderText(catRaw) ? null : catRaw
    const unitRaw = cleanCellText(getCell(raw, mapping.unit))
    const unit = !unitRaw || isPlaceholderText(unitRaw) ? null : unitRaw
    let minQuantity: number | null = null
    if (mapping.minQuantity !== undefined) {
      const mRes = parseSmartNumber(getCell(raw, mapping.minQuantity))
      if (mRes.kind === 'ok') {
        minQuantity = mRes.value ?? null
        if (mRes.fixNote) fixes.push(`حد التنبيه: ${mRes.fixNote}`)
      } else if (mRes.kind === 'error') warnings.push(`حد التنبيه: ${mRes.error} — هيتسجل الافتراضي (1)`)
    }

    // ── التكرار داخل الملف ──
    let mergedInto: number | null = null
    if (name && !errors.length) {
      const key = barcode || normalizeKey(name)
      const first = barcode ? byBarcode.get(barcode) : byName.get(normalizeKey(name))
      if (first !== undefined) {
        const firstName = rows.find((r) => r.idx === first)?.name
        if (barcode && firstName && normalizeKey(firstName) !== normalizeKey(name)) {
          errors.push(`نفس الباركود (${barcode}) مستخدم لمنتجين مختلفين: «${firstName}» و«${name}» — الواحد لازم يبقى بباركود واحد`)
        } else {
          // صف مكرر لنفس المنتج → كميته بتتجمع على أول صف
          mergedInto = first
          dups++
          fixes.push(`صف مكرر لنفس المنتج — كميته هتتجمع مع الصف رقم ${first} (الاسم: ${name})`)
        }
      } else if (name) {
        if (barcode) byBarcode.set(barcode, idx)
        byName.set(normalizeKey(name), idx)
      }
    }

    // ── موجود في القاعدة؟ (فحص السيرفر قبل العرض) ──
    // existsInDb بيتزوّد من مسار الـ API بعد فحص القاعدة — هنا مكان محفوظ له فقط

    let status: RowStatus
    if (errors.length) status = 'error'
    else if (fixes.length) status = 'fixed'
    else if (warnings.length) status = 'warn'
    else status = 'ok'

    if (status === 'fixed' && warnings.length) status = 'warn' // تحذير أهم من إصلاح

    const row: ParsedRow = {
      idx, status, name, barcode, quantity, cost, price, category, unit, minQuantity,
      fixes, errors, warnings, mergedInto, existsInDb: null,
    }
    rows.push(row)
  })

  // صفوف مستثناة يدويًا من الواجهة
  if (opts.excluded?.length) {
    const ex = new Set(opts.excluded)
    for (const r of rows) {
      if (ex.has(r.idx)) {
        r.status = 'error'
        r.errors = ['مستثنى يدويًا من الاستيراد (اختيارك)']
        r.mergedInto = null
      }
    }
  }

  // إجمالي الكمية الفعلية (بعد استبعاد المكرر والأخطاء)
  for (const r of rows) {
    if (r.status !== 'error' && r.mergedInto == null && r.status !== 'blank') totalQty += r.quantity
  }

  const stats: ImportStats = {
    totalRows: rows.length,
    ok: rows.filter((r) => r.status === 'ok').length,
    fixed: rows.filter((r) => r.status === 'fixed').length,
    warn: rows.filter((r) => r.status === 'warn').length,
    errors: rows.filter((r) => r.status === 'error').length,
    blank: rows.filter((r) => r.status === 'blank').length,
    duplicatesInFile: dups,
    existsInDb: existsCount,
    truncated: false,
    junkRows: 0,
    headerless: false,
    totalQty: Math.round(totalQty * 1000) / 1000,
  }

  return { rows, stats, mappingIssues }
}

function emptyRow(idx: number, status: RowStatus): ParsedRow {
  return {
    idx, status, name: '', barcode: null, quantity: 0, cost: null, price: null,
    category: null, unit: null, minQuantity: null, fixes: [], errors: [],
    warnings: [], mergedInto: null, existsInDb: null,
  }
}

/** التحقق النهائي قبل الالتزام: كل الصفوف لازم تمر من هنا تاني (مصدر الحقيقة واحد) */
export function importableRows(rows: ParsedRow[]): ParsedRow[] {
  const byIdx = new Map(rows.map((r) => [r.idx, r]))
  const chosen: ParsedRow[] = []
  for (const r of rows) {
    if (r.status === 'error' || r.status === 'blank') continue
    if (r.mergedInto != null) continue // كمته بتتجمع على الصف الأول — مش صف مستقل
    chosen.push(r)
  }
  void byIdx
  return chosen
}

/** إجمالي الكمية اللي هتتضاف لمنتج واحد بعد دمج صفوفه المكررة */
export function mergedQtyFor(rows: ParsedRow[], root: ParsedRow): number {
  let q = root.quantity
  for (const r of rows) {
    if (r.mergedInto === root.idx && r.status !== 'error') q += r.quantity
  }
  return Math.round(q * 1000) / 1000
}
