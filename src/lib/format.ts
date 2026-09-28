// LTR isolate — بيثبّت "العلامة + الرقم" قدام بعض في الصفحات RTL
const LRI = '\u2066'
const PDI = '\u2069'

function formatAmountParts(amount: number | null | undefined) {
  const n = Number(amount ?? 0)
  // ar-EG يحوّل الصفر لـ ٠ اللي يظهر كـ bullet في الفونت الكبير
  // en-US يعطي أرقام غربية واضحة مناسبة لتطبيق ERP
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  const negative = formatted.startsWith('-')
  const digits = negative ? formatted.slice(1) : formatted
  // "0" و "-0" (من التقريب) من غير علامة
  return { digits, negative: negative && digits !== '0' }
}

/**
 * المبلغ بالجنيه. القيم السالبة بتتعرض صح في صفحات RTL: "-502 جنيه"
 * (من غير العزل كانت بتظهر "502-" لأن علامة السالب بتاخد اتجاه الفقرة).
 *
 * ⚠️ الناتج للسالب فيه حروف اتجاه غير مرئية (U+2066/U+2069) — مناسب للشاشة
 * والـ HTML والـ PDF. الطابعة الحرارية (ESC/POS) بتشيلها قبل تحويل النص لـ bytes.
 */
export function formatCurrency(amount: number | null | undefined): string {
  const { digits, negative } = formatAmountParts(amount)
  return negative ? `${LRI}-${digits}${PDI} جنيه` : `${digits} جنيه`
}

/** زي formatCurrency + خيار showPlus لإظهار "+" للقيم الموجبة (حركات الوارد). */
export function formatSignedCurrency(
  amount: number | null | undefined,
  showPlus = false
): string {
  const { digits, negative } = formatAmountParts(amount)
  if (negative) return `${LRI}-${digits}${PDI} جنيه`
  if (showPlus && digits !== '0') return `${LRI}+${digits}${PDI} جنيه`
  return `${digits} جنيه`
}

/** رقم بعلامة (كميات مخزون، فروقات جرد...) بعلامة صحيحة في RTL: "+5" / "-5". */
export function formatSignedNumber(
  value: number | null | undefined,
  showPlus = true
): string {
  const n = Number(value ?? 0)
  const formatted = n.toLocaleString('en-US')
  const negative = formatted.startsWith('-')
  const digits = negative ? formatted.slice(1) : formatted
  if (digits === '0') return '0'
  if (negative) return `${LRI}-${digits}${PDI}`
  return showPlus ? `${LRI}+${digits}${PDI}` : digits
}

export function formatNumber(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('en-US')
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

  return `\u200F${day} ${month} ${year} \u200F- ${hours}:${minutes} ${period}`
}

/** Same as formatArabicDateTime but without the time portion, e.g. "18 يوليو 2026". */
export function formatArabicDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  const day = d.getDate()
  const month = ARABIC_MONTHS[d.getMonth()]
  const year = d.getFullYear()

  return `\u200F${day} ${month} ${year}`
}
