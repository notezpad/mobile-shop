/** ترتيب مقاسات المتغيرات: أرقام (40, 41…) ثم حروف (XS…5XL) ثم أي نص تاني. مشترك بين كل شاشات المتغيرات. */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export const normalizeDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, '.')

const LETTER_LADDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL']

export function sizeRank(a: string): [number, number | string] {
  const n = Number(normalizeDigits(a))
  if (Number.isFinite(n) && a.trim() !== '') return [0, n]
  const i = LETTER_LADDER.indexOf(a.trim().toUpperCase())
  if (i >= 0) return [1, i]
  return [2, a]
}

export function compareSizes(a: string, b: string) {
  const [ga, va] = sizeRank(a)
  const [gb, vb] = sizeRank(b)
  if (ga !== gb) return ga - gb
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'ar')
}

export interface ColorGroup<T> {
  /** '' = من غير لون */
  color: string
  items: T[]
  total: number
}

/** تجميع المتغيرات بالألوان (بترتيب ظهور اللون)، ومقاسات كل لون مرتبة. */
export function groupByColor<T extends { size: string | null; color: string | null; quantity: number }>(
  variants: T[]
): ColorGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const v of variants) {
    const c = (v.color ?? '').trim()
    const arr = map.get(c)
    if (arr) arr.push(v)
    else map.set(c, [v])
  }
  return [...map.entries()].map(([color, items]) => {
    const sorted = [...items].sort((a, b) => compareSizes(a.size ?? '', b.size ?? ''))
    return { color, items: sorted, total: sorted.reduce((n, v) => n + Math.max(0, v.quantity), 0) }
  })
}
