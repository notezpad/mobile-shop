const LETTER_LADDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', '2xl', 'xxl', '3xl', 'xxxl', '4xl', '5xl']

function sizeRank(size: string | null): [number, number | string] {
  const s = (size ?? '').trim().toLowerCase()
  const n = parseFloat(s)
  if (Number.isFinite(n)) return [0, n]
  const i = LETTER_LADDER.indexOf(s)
  return i >= 0 ? [1, i] : [2, s]
}

/** ترتيب المقاسات: أرقام (40، 41…) ثم حروف (S، M، L…) ثم الباقي أبجديًا. */
export function compareSizes(a: { size: string | null }, b: { size: string | null }) {
  const [ga, va] = sizeRank(a.size)
  const [gb, vb] = sizeRank(b.size)
  if (ga !== gb) return ga - gb
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'ar')
}
