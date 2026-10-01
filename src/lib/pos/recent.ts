/** Recently added product ids (per browser) — used only to order the catalog grid. Ids only, never prices/stock. */
const KEY = 'pos-recent-v1'
const MAX = 30

export function getRecentIds(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}

export function pushRecent(id: number) {
  try {
    const next = [id, ...getRecentIds().filter((x) => x !== id)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — ordering is a nicety, ignore */
  }
}

/** Stable sort: recent first (most recent first), the rest keep server order. */
export function sortByRecent<T extends { id: number }>(items: T[], recent: number[]): T[] {
  if (recent.length === 0) return items
  const rank = new Map(recent.map((id, i) => [id, i]))
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ra = rank.get(a.it.id) ?? Infinity
      const rb = rank.get(b.it.id) ?? Infinity
      return ra !== rb ? ra - rb : a.i - b.i
    })
    .map((x) => x.it)
}
