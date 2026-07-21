export function formatCurrency(amount: number | null | undefined): string {
  const n = Number(amount ?? 0)
  const formatted = n.toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${formatted} جنيه`
}

export function formatNumber(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('ar-EG')
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  // ✅ getFullYear/Month/Date/Hours → توقيت المتصفح المحلي دايماً (مش UTC)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/**
 * Formats a date/time as a single-line Arabic string, e.g.
 * "18 يوليو 2026 - 4:19 م". Used everywhere a date is shown to the user
 * (tables, cards, details) so the whole app has one consistent, readable
 * format instead of raw numeric dates (2026/07/18) or mixed locale strings.
 */
export function formatArabicDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  const day = d.getDate()
  const month = ARABIC_MONTHS[d.getMonth()]
  const year = d.getFullYear()

  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const period = hours >= 12 ? 'م' : 'ص'
  hours = hours % 12
  if (hours === 0) hours = 12

  return `${day} ${month} ${year} - ${hours}:${minutes} ${period}`
}

/** Same as formatArabicDateTime but without the time portion, e.g. "18 يوليو 2026". */
export function formatArabicDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  const day = d.getDate()
  const month = ARABIC_MONTHS[d.getMonth()]
  const year = d.getFullYear()

  return `${day} ${month} ${year}`
}
