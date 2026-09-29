/**
 * Signed amount parsing for manual cash entries (الخزنة).
 *
 * Root cause of the "+100 subtracts / -100 adds" bug:
 * the raw input string was read with `parseFloat()`, which
 *   - ignores a sign written AFTER the number ("100-" → 100), which is what
 *     an RTL text field produces when the user types the minus last,
 *   - ignores the Unicode minus "−" (U+2212) and the dashes − – — that some
 *     keyboards insert instead of ASCII "-" ("−100" → 100),
 *   - ignores Arabic-Indic digits and thousand separators.
 *
 * `parseSignedAmount` normalises all of that and returns a number whose sign
 * is exactly what the user meant: positive = money in, negative = money out.
 * Returns `null` when the input is not a usable amount.
 */
export function parseSignedAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }
  if (typeof raw !== 'string') return null

  let s = raw.trim()
  if (!s) return null

  // Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits → ASCII
  s = s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  s = s.replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))

  // Arabic decimal separator / thousands separator
  s = s.replace(/\u066b/g, '.').replace(/\u066c/g, '')

  // Any dash-like character → ASCII minus, any plus-like → ASCII plus
  s = s.replace(/[\u2010-\u2015\u2212\uff0d]/g, '-').replace(/\uff0b/g, '+')

  // Drop invisible bidi marks, spaces and thousand separators
  s = s.replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '')
  s = s.replace(/[\s,]/g, '')

  if (!s) return null

  // Sign may be written before OR after the number (RTL typing gives "100-")
  let negative = false
  let sawSign = false
  let digits = ''
  for (const ch of s) {
    if (ch === '-' || ch === '+') {
      if (sawSign) return null // "+-100" etc. → invalid
      sawSign = true
      negative = ch === '-'
      continue
    }
    if (ch === '.' || (ch >= '0' && ch <= '9')) {
      digits += ch
      continue
    }
    return null // any other character → invalid
  }

  if (!digits || digits === '.') return null
  const value = Number(digits)
  if (!Number.isFinite(value)) return null

  return negative ? -value : value
}
