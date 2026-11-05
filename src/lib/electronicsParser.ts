/**
 * 📱 التحديث 30 (2026-11-04): محلّل عامية الإلكترونيات — موبايل / لابتوب / إكسسوار.
 * قاموس + regex بس (مفيش API ولا تكلفة) — نفس فكرة variantParser.ts للملابس، ونفس شكل الـ output
 * (opt1 → عمود color، opt2 → عمود size) فشاشة المعاينة والإضافة بتشتغل بنفس الطريقة.
 *
 * أمثلة:
 *  «ايفون 15 برو اسود وتيتانيوم سعة 128 و256 و512 جديد عدد 3»
 *     → سعات [128GB,256GB,512GB] × ألوان [أسود,تيتانيوم] × جديد × كمية 3 = 6 صفوف
 *  «لابتوب i5 و i7 رام 8 و16 هارد 256 و512 SSD مستعمل عدد 2»
 *     → 2 معالج × 2 رام × 2 تخزين = 8 صفوف («i5 · 8GB · 256GB SSD» …) كلها مستعمل × 2
 */
import { COLOR_MAP, COLOR_KEYS, normalizeDigits, extractQuantity } from './variantParser'
import type { ElectronicsKind } from './electronics-variants'
import type { VariantCondition } from './variant-condition'

export interface ParsedElectronicsRow {
  /** المواصفة 1 → عمود color */
  opt1: string | null
  /** المواصفة 2 → عمود size */
  opt2: string | null
  condition: VariantCondition | null
  quantity: number
}

export interface ElectronicsParseResult {
  rows: ParsedElectronicsRow[]
  warnings: string[]
}

const MAX_ROWS = 60

// ألوان إضافية للأجهزة (مركّبة أولًا — بنطابق الأطول الأول)
const DEVICE_COLORS: Record<string, string> = {
  'تيتانيوم طبيعي': 'تيتانيوم طبيعي', 'تيتانيوم اسود': 'تيتانيوم أسود', 'تيتانيوم أسود': 'تيتانيوم أسود',
  'تيتانيوم ابيض': 'تيتانيوم أبيض', 'تيتانيوم أبيض': 'تيتانيوم أبيض', 'تيتانيوم ازرق': 'تيتانيوم أزرق',
  'تيتانيوم أزرق': 'تيتانيوم أزرق', 'تيتانيوم صحراوي': 'تيتانيوم صحراوي', 'تيتانيوم': 'تيتانيوم',
  'ديزرت': 'صحراوي', 'صحراوي': 'صحراوي', 'ميدنايت': 'ميدنايت', 'ستارلايت': 'ستارلايت',
  'جرافيت': 'جرافيت', 'جرافايت': 'جرافيت', 'سيلفر': 'فضي', 'جولد': 'ذهبي', 'بلاك': 'أسود', 'وايت': 'أبيض',
  'جراي': 'رمادي', 'اسبيس جراي': 'رمادي فلكي', 'سبيس جراي': 'رمادي فلكي',
}
const ALL_COLOR_MAP: Record<string, string> = { ...COLOR_MAP, ...DEVICE_COLORS }
const ALL_COLOR_KEYS = Object.keys(ALL_COLOR_MAP).sort((a, b) => b.length - a.length)
void COLOR_KEYS

const NEW_WORDS = ['جديدة', 'جديد', 'زيرو', 'متبرشم', 'متبرشمة', 'كرتونة']
const USED_WORDS = ['مستعملة', 'مستعمل', 'يوزد', 'استعمال', 'مستخدم', 'مستخدمة']

const STORAGE_OK = new Set([16, 32, 64, 128, 256, 512, 1024, 2048])
const RAM_OK = new Set([2, 3, 4, 6, 8, 12, 16, 24, 32, 64])

const uniq = <T,>(a: T[]) => Array.from(new Set(a))

/** يشيل الجزء المطابق من النص عشان ما يتطابقش تاني (تيتانيوم أسود ≠ أسود لوحدها) */
function consume(text: string, key: string): string {
  return text.split(key).join(' ')
}

function extractColors(text: string): { colors: string[]; rest: string } {
  const hits: { c: string; at: number }[] = []
  let rest = text
  for (const key of ALL_COLOR_KEYS) {
    if (rest.includes(key)) {
      const c = ALL_COLOR_MAP[key]
      if (!hits.some((h) => h.c === c)) hits.push({ c, at: text.indexOf(key) })
      rest = consume(rest, key)
    }
  }
  // بترتيب ظهورها في الجملة
  hits.sort((a, b) => a.at - b.at)
  return { colors: hits.map((h) => h.c), rest }
}

function extractConditions(text: string): { conds: VariantCondition[]; rest: string } {
  const conds: VariantCondition[] = []
  let rest = text
  for (const w of USED_WORDS) if (rest.includes(w)) { if (!conds.includes('used')) conds.push('used'); rest = consume(rest, w) }
  for (const w of NEW_WORDS) if (rest.includes(w)) { if (!conds.includes('new')) conds.push('new'); rest = consume(rest, w) }
  conds.sort((a, b) => (a === 'new' ? -1 : 1) - (b === 'new' ? -1 : 1))
  return { conds, rest }
}

/** يشيل عبارة الكمية (عدد/الكمية N) عشان رقمها ما يتحسبش سعة/رام */
function stripQuantityPhrase(text: string): string {
  return text
    .replace(/(?:الكمية|كمية|عدد)\s*[:\-]?\s*\d+/g, ' ')
    .replace(/\d+\s*(?:قطع|قطعة|حبة|حبات|جهاز|أجهزة|اجهزة)/g, ' ')
}

const fmtGb = (n: number) => (n >= 1024 ? `${n / 1024}TB` : `${n}GB`)

/** كل الأرقام بعد كلمة مفتاحية: «رام 8 و16 و32» → [8,16,32] */
function numbersAfter(text: string, keywords: string[]): { nums: number[]; rest: string } {
  const nums: number[] = []
  let rest = text
  for (const kw of keywords) {
    const re = new RegExp(`${kw}\\s*[:\\-]?\\s*((?:\\d+(?:\\s*(?:gb|g|جيجا|جيجابايت|tb|تيرا|ترا))?\\s*(?:,|،|و|\\/|-|\\+)?\\s*)+)`, 'gi')
    rest = rest.replace(re, (_m, g: string) => {
      for (const mm of g.matchAll(/(\d+)\s*(tb|تيرا|ترا)?/gi)) {
        const n = parseInt(mm[1], 10)
        nums.push(mm[2] ? n * 1024 : n)
      }
      return ' '
    })
  }
  return { nums, rest }
}

function build(
  opt1s: (string | null)[],
  opt2s: (string | null)[],
  conds: (VariantCondition | null)[],
  quantity: number,
  warnings: string[],
): ParsedElectronicsRow[] {
  const rows: ParsedElectronicsRow[] = []
  for (const o1 of opt1s) for (const o2 of opt2s) for (const c of conds) {
    if (o1 === null && o2 === null) continue
    rows.push({ opt1: o1, opt2: o2, condition: c, quantity })
  }
  if (rows.length > MAX_ROWS) {
    warnings.push(`الوصف طلّع ${rows.length} تركيبة — اتعرض أول ${MAX_ROWS} بس، قسّم الوصف لدفعتين`)
    return rows.slice(0, MAX_ROWS)
  }
  return rows
}

function parsePhone(text: string, warnings: string[]): { opt1s: string[]; opt2s: string[] } {
  let t = text
  // «8/256» أو «8+256» أو «8GB/256GB» = رام/سعة
  const pairs: string[] = []
  t = t.replace(/(\d{1,2})\s*(?:gb|g|جيجا)?\s*[\/+]\s*(\d{2,4})\s*(?:gb|g|جيجا|tb|تيرا)?/gi, (m, a, b) => {
    const ram = parseInt(a, 10), st = parseInt(b, 10)
    if (RAM_OK.has(ram) && STORAGE_OK.has(st)) { pairs.push(`${fmtGb(ram)} / ${fmtGb(st)}`); return ' ' }
    return m
  })
  const ramRes = numbersAfter(t, ['رام', 'ram'])
  t = ramRes.rest
  // «8 رام» (الرقم قبل الكلمة)
  t = t.replace(/(\d+)\s*(?:gb|g|جيجا)?\s*(?:رام|ram)/gi, (_m, n) => { ramRes.nums.push(parseInt(n, 10)); return ' ' })
  const stRes = numbersAfter(t, ['سعة', 'سعه', 'هارد', 'تخزين', 'storage', 'ssd', 'rom', 'روم', 'ذاكرة', 'ذاكره'])
  t = stRes.rest
  const storages = stRes.nums.filter((n) => STORAGE_OK.has(n))
  // أرقام سايبة: سعة لو من القيم المعروفة، وبدون وحدة صريحة لا نقبل 16/32 (ايفون 16 ≠ 16GB)
  for (const m of t.matchAll(/(\d+)\s*(gb|g|جيجا|جيجابايت|tb|تيرا|ترا)?/gi)) {
    let n = parseInt(m[1], 10)
    const unit = m[2]?.toLowerCase()
    if (unit && /tb|تيرا|ترا/.test(unit)) n *= 1024
    if (!STORAGE_OK.has(n)) continue
    if (!unit && n < 64) continue
    if (!storages.includes(n)) storages.push(n)
  }
  const rams = uniq(ramRes.nums.filter((n) => RAM_OK.has(n)))
  const sts = uniq(storages).sort((a, b) => a - b)
  const specs: string[] = [...pairs]
  if (sts.length) {
    if (rams.length) for (const r of rams) for (const s of sts) specs.push(`${fmtGb(r)} / ${fmtGb(s)}`)
    else for (const s of sts) specs.push(fmtGb(s))
  } else if (rams.length && !pairs.length) {
    for (const r of rams) specs.push(`${fmtGb(r)} رام`)
  }
  if (specs.length === 0) warnings.push('لم يتم التعرف على أي سعة — اكتب مثلاً «سعة 128 و256»')
  return { opt1s: uniq(specs), opt2s: [] }
}

function parseLaptop(text: string, warnings: string[]): { opt1s: string[]; opt2s: string[] } {
  let t = text
  // المعالج
  const cpus: string[] = []
  t = t.replace(/(?:core\s*)?\bi\s?([3579])\b(?:[-\s]?\d{4,5}\w{0,2})?/gi, (_m, n) => { const c = `i${n}`; if (!cpus.includes(c)) cpus.push(c); return ' ' })
  t = t.replace(/(?:ryzen|رايزن)\s*([3579])/gi, (_m, n) => { const c = `Ryzen ${n}`; if (!cpus.includes(c)) cpus.push(c); return ' ' })
  t = t.replace(/\b(m[1-4])\b(?:\s*(pro|max))?/gi, (_m, n, x) => { const c = `${String(n).toUpperCase()}${x ? ' ' + String(x).replace(/^./, (ch: string) => ch.toUpperCase()) : ''}`; if (!cpus.includes(c)) cpus.push(c); return ' ' })
  const isSsd = /ssd|اس اس دي|nvme|ام تو|m\.?2/i.test(t)
  const isHdd = /hdd|هارد ديسك/i.test(t)
  const ramRes = numbersAfter(t, ['رام', 'ram'])
  t = ramRes.rest
  t = t.replace(/(\d+)\s*(?:gb|g|جيجا)?\s*(?:رام|ram)/gi, (_m, n) => { ramRes.nums.push(parseInt(n, 10)); return ' ' })
  const stRes = numbersAfter(t, ['هارد', 'تخزين', 'ssd', 'hdd', 'storage', 'سعة', 'سعه'])
  t = stRes.rest
  const storages = stRes.nums.filter((n) => n >= 128 && STORAGE_OK.has(n))
  for (const m of t.matchAll(/(\d+)\s*(gb|g|جيجا|tb|تيرا|ترا)\b/gi)) {
    let n = parseInt(m[1], 10)
    if (/tb|تيرا|ترا/i.test(m[2])) n *= 1024
    if (n >= 128 && STORAGE_OK.has(n) && !storages.includes(n)) storages.push(n)
  }
  const rams = uniq(ramRes.nums.filter((n) => RAM_OK.has(n)))
  const sts = uniq(storages).sort((a, b) => a - b)
  const typeSuffix = isSsd ? ' SSD' : isHdd ? ' HDD' : ''
  const cpuList: (string | null)[] = cpus.length ? cpus : [null]
  const ramList: (number | null)[] = rams.length ? rams : [null]
  const stList: (number | null)[] = sts.length ? sts : [null]
  const configs: string[] = []
  for (const c of cpuList) for (const r of ramList) for (const s of stList) {
    const label = [c, r ? fmtGb(r) : null, s ? `${fmtGb(s)}${typeSuffix}` : null].filter(Boolean).join(' · ')
    if (label) configs.push(label)
  }
  if (configs.length === 0) warnings.push('لم يتم التعرف على أي مواصفات — اكتب مثلاً «i7 رام 16 هارد 512»')
  return { opt1s: uniq(configs), opt2s: [] }
}

export function parseElectronicsText(rawText: string, kind: ElectronicsKind): ElectronicsParseResult {
  const warnings: string[] = []
  let text = normalizeDigits(rawText.trim()).replace(/[ـ]/g, '')
  const { quantity, warning: qWarning } = extractQuantity(text)
  if (qWarning) warnings.push(qWarning)
  text = stripQuantityPhrase(text)

  const condRes = extractConditions(text)
  text = condRes.rest
  const colorRes = extractColors(text)
  text = colorRes.rest

  const conds: (VariantCondition | null)[] = condRes.conds.length ? condRes.conds : [null]
  let opt1s: (string | null)[] = []
  let opt2s: (string | null)[] = colorRes.colors.length ? colorRes.colors : [null]

  if (kind === 'phone') {
    const r = parsePhone(text, warnings)
    opt1s = r.opt1s.length ? r.opt1s : [null]
  } else if (kind === 'laptop') {
    const r = parseLaptop(text, warnings)
    opt1s = r.opt1s.length ? r.opt1s : [null]
  } else {
    // إكسسوار: الألوان بس — الموديل/النوع بيتكتب يدوي
    opt1s = [null]
    if (colorRes.colors.length === 0) warnings.push('لم يتم التعرف على أي لون — الإكسسوار بيتضاف يدويًا أو اكتب الألوان')
  }

  if (kind === 'phone' && colorRes.colors.length === 0) warnings.push('لم يتم التعرف على أي لون في الجملة')
  const rows = build(opt1s, opt2s, conds, quantity, warnings)
  return { rows, warnings }
}
