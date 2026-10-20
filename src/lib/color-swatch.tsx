import { cn } from '@/lib/utils'

/** عينات الألوان (اسم اللون بالعربي/الإنجليزي → لون). مشترك بين شاشات المتغيرات. */

export const normAr = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^ال/, '')

const COLOR_HEX: Record<string, string> = {
  اسود: '#111827', black: '#111827',
  ابيض: '#f8fafc', white: '#f8fafc',
  'اوف وايت': '#f5f0e6', كريمي: '#f5ecd5', كريم: '#f5ecd5',
  احمر: '#dc2626', red: '#dc2626',
  ازرق: '#2563eb', blue: '#2563eb',
  اخضر: '#16a34a', green: '#16a34a',
  اصفر: '#facc15', yellow: '#facc15',
  وردي: '#f472b6', بينك: '#f472b6', pink: '#f472b6',
  بنفسجي: '#7c3aed', موف: '#a855f7', purple: '#7c3aed',
  رمادي: '#9ca3af', gray: '#9ca3af', grey: '#9ca3af',
  بني: '#92400e', brown: '#92400e',
  برتقالي: '#f97316', orange: '#f97316',
  كحلي: '#1e3a8a', navy: '#1e3a8a',
  بيج: '#d6c3a1', beige: '#d6c3a1',
  ذهبي: '#d4af37', gold: '#d4af37',
  فضي: '#cbd5e1', silver: '#cbd5e1',
  سماوي: '#38bdf8', لبني: '#bae6fd',
  عنابي: '#7f1d1d', خمري: '#881337', نبيتي: '#6b1d3a',
  زيتي: '#556b2f', تركواز: '#14b8a6', جملي: '#c19a6b', هافان: '#8b5a2b',
}
const COLOR_KEYS_BY_LEN = Object.keys(COLOR_HEX).sort((a, b) => b.length - a.length)

export function swatchOf(name: string): string {
  const n = normAr(name)
  if (!n) return 'transparent'
  if (COLOR_HEX[n]) return COLOR_HEX[n]
  const hit = COLOR_KEYS_BY_LEN.find((k) => n.includes(k))
  if (hit) return COLOR_HEX[hit]
  let h = 0
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 55% 55%)`
}

export function Swatch({ name, className }: { name: string; className?: string }) {
  if (!name) return null
  return (
    <i
      aria-hidden
      className={cn('inline-block size-3 shrink-0 rounded-full ring-1 ring-black/20 dark:ring-white/25', className)}
      style={{ backgroundColor: swatchOf(name) }}
    />
  )
}
