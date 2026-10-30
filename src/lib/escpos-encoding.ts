/**
 * تشفير نص الفواتير للطابعات الحرارية ESC/POS.
 *
 * الطابعة بتستنى bytes من code page محدد (مش UTF-8)، وبتطبع من الشمال لليمين بالترتيب
 * اللي بتستلمه — فالعربي لازم يتحوّل لترتيب بصري (معكوس) قبل الإرسال.
 *
 * ⚠️ الحدود: مفيش تشكيل (حروف مربوطة) هنا — الطابعات الرخيصة بتطبع الحروف منفصلة.
 * لو محتاج حروف متصلة بالكامل، الحل الأضمن طباعة الفاتورة كصورة (raster).
 * أرقام الـ code pages حسب Epson؛ بعض الطابعات الصيني بتختلف (راجع صفحة الاختبار).
 */

export type PrinterEncoding = 'cp720' | 'cp864' | 'windows-1256'

/** أرقام ESC t n حسب جدول Epson: PC720=32, PC864=37, WPC1256=50. */
export const DEFAULT_CODE_PAGE: Record<PrinterEncoding, number> = {
  cp720: 32,
  cp864: 37,
  'windows-1256': 50,
}

// الـ 128 حرف للـ bytes 0x80–0xFF لكل code page (متولّدة من codecs بايثون).
const HIGH_TABLES: Record<'cp720' | 'cp864' | 'cp1256', string> = {
  'cp720': '\u0080\u0081éâ\u0084à\u0086çêëèïî\u008d\u008e\u008f\u0090ّْô¤ـûùءآأؤ£إئابةتثجحخدذرزسشص«»\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580ضطظعغفµقكلمنهوىي\u2261ًٌٍَُِ\u2248°\u2219·\u221a\u207f²\u25a0\u00a0',
  'cp864': '°·\u2219\u221a\u2592\u2500\u2502\u253c\u2524\u252c\u251c\u2534\u2510\u250c\u2514\u2518β\u221eφ±½¼\u2248«»\ufef7\ufef8\ufffd\ufffd\ufefb\ufefc\ufffd\u00a0\u00ad\ufe82£¤\ufe84\ufffd\ufffd\ufe8e\ufe8f\ufe95\ufe99،\ufe9d\ufea1\ufea5٠١٢٣٤٥٦٧٨٩\ufed1؛\ufeb1\ufeb5\ufeb9؟¢\ufe80\ufe81\ufe83\ufe85\ufeca\ufe8b\ufe8d\ufe91\ufe93\ufe97\ufe9b\ufe9f\ufea3\ufea7\ufea9\ufeab\ufead\ufeaf\ufeb3\ufeb7\ufebb\ufebf\ufec1\ufec5\ufecb\ufecf¦¬÷×\ufec9ـ\ufed3\ufed7\ufedb\ufedf\ufee3\ufee7\ufeeb\ufeed\ufeef\ufef3\ufebd\ufecc\ufece\ufecd\ufee1\ufe7dّ\ufee5\ufee9\ufeec\ufef0\ufef2\ufed0\ufed5\ufef5\ufef6\ufedd\ufed9\ufef1\u25a0\ufffd',
  'cp1256': '\u20acپ\u201aƒ\u201e\u2026\u2020\u2021ˆ\u2030ٹ\u2039Œچژڈگ\u2018\u2019\u201c\u201d\u2022\u2013\u2014ک\u2122ڑ\u203aœ\u200c\u200dں\u00a0،¢£¤¥¦§¨©ھ«¬\u00ad®¯°±²³´µ¶·¸¹؛»¼½¾؟ہءآأؤإئابةتثجحخدذرزسشصض×طظعغـفقكàلâمنهوçèéêëىيîïًٌٍَôُِ÷ّùْûü\u200e\u200fے',
}

const reverseMaps = new Map<string, Map<string, number>>()
function reverseMap(key: 'cp720' | 'cp864' | 'cp1256'): Map<string, number> {
  let m = reverseMaps.get(key)
  if (!m) {
    m = new Map()
    const t = HIGH_TABLES[key]
    for (let i = 0; i < t.length; i++) if (t[i] !== '\ufffd' && !m.has(t[i])) m.set(t[i], 0x80 + i)
    reverseMaps.set(key, m)
  }
  return m
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** أرقام لاتينية + علامات بسيطة بدل العربية/الفارسية (مش موجودة في كل الـ code pages). */
function simplify(text: string): string {
  return text
    .replace(/[\u066A-\u066D\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, (c) => (c === '\u066B' ? '.' : c === '\u066C' ? ',' : c === '\u066A' ? '%' : ''))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/\u2026/g, '...')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00A0/g, ' ')
}

// ───────────── تشكيل الحروف (لـ CP864: الطابعة بتطبع أشكال الحروف زي ما هي) ─────────────
// [معزول, نهاية, بداية, وسط] — متولّدة من جداول Unicode (FE70–FEFC). 0 = الشكل مش موجود.
const FORMS: Record<number, [number, number, number, number]> = {
  0x0621: [0xFE80, 0, 0, 0],
  0x0622: [0xFE81, 0xFE82, 0, 0],
  0x0623: [0xFE83, 0xFE84, 0, 0],
  0x0624: [0xFE85, 0xFE86, 0, 0],
  0x0625: [0xFE87, 0xFE88, 0, 0],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
  0x0627: [0xFE8D, 0xFE8E, 0, 0],
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
  0x0629: [0xFE93, 0xFE94, 0, 0],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
  0x062F: [0xFEA9, 0xFEAA, 0, 0],
  0x0630: [0xFEAB, 0xFEAC, 0, 0],
  0x0631: [0xFEAD, 0xFEAE, 0, 0],
  0x0632: [0xFEAF, 0xFEB0, 0, 0],
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
  0x0648: [0xFEED, 0xFEEE, 0, 0],
  0x0649: [0xFEEF, 0xFEF0, 0, 0],
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4]
}
// لام + ألف (لا، لأ، لإ، لآ): [معزول, نهاية]
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6],
  0x0623: [0xFEF7, 0xFEF8],
  0x0625: [0xFEF9, 0xFEFA],
  0x0627: [0xFEFB, 0xFEFC]
}

/** يربط الحروف العربية بأشكالها (presentation forms) ويشيل التشكيل والتطويل. بترتيب منطقي. */
export function shapeArabic(text: string, available: (ch: string) => boolean = () => true): string {
  const chars = [...text.replace(/[\u064B-\u0652\u0640]/g, '')]
  const out: string[] = []
  const formsOf = (c: string | undefined) => (c ? FORMS[c.codePointAt(0)!] : undefined)
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    const f = formsOf(c)
    if (!f) {
      out.push(c)
      continue
    }
    const pf = formsOf(chars[i - 1])
    const prevJoins = !!pf && pf[2] !== 0 // الحرف اللي قبله بيوصل لقدّام
    if (c === 'ل' && chars[i + 1] && LAM_ALEF[chars[i + 1].codePointAt(0)!]) {
      const lig = LAM_ALEF[chars[i + 1].codePointAt(0)!]
      out.push(String.fromCharCode(prevJoins ? lig[1] : lig[0]))
      i++
      continue
    }
    const nf = formsOf(chars[i + 1])
    const nextJoins = f[2] !== 0 && !!nf && nf[1] !== 0 // أنا بوصل لقدّام والتالي يقبل الوصل
    const joinPrev = prevJoins && f[1] !== 0
    // CP864 مفيهوش كل الأشكال (نهاية/وسط ناقصين لمعظم الحروف) — نجرّب البدائل المعتادة:
    // وسط → بداية → معزول، نهاية → معزول، بداية → معزول. أول شكل متاح بيتاخد.
    const order = joinPrev && nextJoins ? [f[3], f[2], f[0]] : joinPrev ? [f[1], f[0]] : nextJoins ? [f[2], f[0]] : [f[0]]
    const pick = order.find((cp) => cp !== 0 && available(String.fromCharCode(cp))) ?? f[0]
    out.push(String.fromCharCode(pick))
  }
  return out.join('')
}

const HAS_RTL = /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const LTR_RUN = /[A-Za-z0-9][A-Za-z0-9.,:/+%\-]*/y

/**
 * ترتيب بصري لسطر: الطابعة بتطبع LTR، فبنعكس السطر كله، وبنسيب الأرقام/اللاتيني
 * (وأسعار زي 1,250.00) بترتيبها الداخلي. السطر اللي مفيهوش عربي مابيتغيرش.
 */
export function toVisualOrder(line: string): string {
  if (!HAS_RTL.test(line)) return line
  const tokens: string[] = []
  let i = 0
  while (i < line.length) {
    LTR_RUN.lastIndex = i
    const m = LTR_RUN.exec(line)
    if (m) {
      tokens.push(m[0])
      i += m[0].length
    } else {
      tokens.push(line[i])
      i++
    }
  }
  return tokens.reverse().join('')
}

/** يشفّر نص (سطر واحد أو أكتر) لـ bytes الـ code page. الحرف اللي ملوش مقابل بيتحوّل لـ «?». */
export function encodeForPrinter(text: string, encoding: PrinterEncoding, opts: { visualOrder?: boolean } = {}): number[] {
  const { visualOrder = true } = opts
  const key = encoding === 'windows-1256' ? 'cp1256' : encoding
  const map = reverseMap(key)
  const out: number[] = []
  const lines = simplify(text).split('\n')
  lines.forEach((ln, idx) => {
    const shaped = key === 'cp864' ? shapeArabic(ln, (c) => map.has(c)) : ln
    const s = visualOrder ? toVisualOrder(shaped) : shaped
    for (const ch of s) {
      const cp = ch.codePointAt(0)!
      if (cp < 0x80) out.push(cp)
      else out.push(map.get(ch) ?? 0x3f)
    }
    if (idx < lines.length - 1) out.push(0x0a)
  })
  return out
}
