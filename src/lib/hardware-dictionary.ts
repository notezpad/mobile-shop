/**
 * 📱 التحديث 32 (2026-11-05): قاموس المعالجات وكروت الشاشة (لابتوب + مكتبي) للبحث والتعرّف.
 * مصدره `src/data/hardware-dictionary.json` (مدموج من 4 ملفات القاموس، مع الأسماء البديلة بالعربي والإنجليزي).
 * بيتحمّل lazy (chunk مستقل) أول ما دايلوج اللابتوب يتفتح — مش بيتقل على باقي النظام.
 * القاموس للاقتراح والتوحيد بس: الكتابة الحرة لسه متاحة لأي موديل مش موجود.
 */
import type { SuggestionKind } from './variant-suggestions'

export interface DictEntry {
  /** الاسم الرسمي (اللي بيتكتب في الكونفيج) */
  name: string
  /** 'l' لابتوب · 'd' مكتبي · 'ld' الاتنين */
  dev: string
  /** الشركة: Intel / AMD / Nvidia / Apple */
  brand: string
  /** مفاتيح بحث مُنضّفة: الاسم + كل الأسماء البديلة */
  keys: string[]
}
export type HardwareDictionary = Record<SuggestionKind, DictEntry[]>

/** تنضيف للمقارنة: حروف صغيرة + توحيد الحروف العربية + بدون مسافات/شرطات */
export function dictKey(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s\-_]+/g, '')
}

let cache: Promise<HardwareDictionary> | null = null

export function loadHardwareDictionary(): Promise<HardwareDictionary> {
  if (!cache) {
    cache = import('@/data/hardware-dictionary.json')
      .then((m) => {
        const raw = ((m as { default?: unknown }).default ?? m) as Record<SuggestionKind, [string, string, string[], string][]>
        const build = (rows: [string, string, string[], string][]): DictEntry[] =>
          rows.map(([name, dev, aliases, brand]) => ({
            name,
            dev,
            brand,
            keys: Array.from(new Set([name, ...aliases].map(dictKey).filter(Boolean))),
          }))
        return { cpu: build(raw.cpu ?? []), gpu: build(raw.gpu ?? []) } as HardwareDictionary
      })
      .catch((e) => {
        cache = null // نحاول تاني المرة الجاية
        throw e
      })
  }
  return cache
}

/** أفضل نتايج للكتابة: تطابق تام > بيبدأ بـ > بيحتوي (لازم 2 حرف على الأقل) */
export function searchDictionary(entries: DictEntry[], query: string, limit = 6): DictEntry[] {
  const q = dictKey(query)
  if (q.length < 2) return []
  const scored: { e: DictEntry; s: number; i: number }[] = []
  entries.forEach((e, i) => {
    let best = 0
    for (const k of e.keys) {
      if (k === q) { best = 100; break }
      if (k.startsWith(q)) best = Math.max(best, 60)
      else if (k.includes(q) && (q.length >= 3 || /\d/.test(q))) best = Math.max(best, 30)
    }
    if (best) scored.push({ e, s: best, i })
  })
  scored.sort((a, b) => b.s - a.s || Number(b.e.dev.includes('l')) - Number(a.e.dev.includes('l')) || a.e.name.length - b.e.name.length || a.i - b.i)
  return scored.slice(0, limit).map((x) => x.e)
}

/** لو الكتابة = اسم/اسم بديل لموديل واحد بالظبط → الاسم الرسمي، غير كده null */
export function resolveExact(entries: DictEntry[], query: string): string | null {
  const q = dictKey(query)
  if (!q) return null
  const hits = entries.filter((e) => e.keys.includes(q))
  return hits.length === 1 ? hits[0].name : null
}

/** يقسّم الاسم لأجزاء عشان نبرّز الجزء المطابق للي اتكتب (بيتجاهل المسافات والشرطات: «i7 8550» يبرّز «i7-8550») */
export function highlightParts(name: string, query: string): { text: string; hit: boolean }[] {
  const q = dictKey(query)
  if (q.length < 2) return [{ text: name, hit: false }]
  const pattern = Array.from(q)
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\-_]*')
  let m: RegExpExecArray | null = null
  try { m = new RegExp(pattern, 'i').exec(name) } catch { m = null }
  if (!m) return [{ text: name, hit: false }]
  const parts: { text: string; hit: boolean }[] = []
  if (m.index > 0) parts.push({ text: name.slice(0, m.index), hit: false })
  parts.push({ text: m[0], hit: true })
  const end = m.index + m[0].length
  if (end < name.length) parts.push({ text: name.slice(end), hit: false })
  return parts
}
