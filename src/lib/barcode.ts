// EAN-13 starting with "20" (in-store / internal-use range — never clashes
// with real manufacturer barcodes, which never start with 20-29 in Egypt's
// normal retail scanning).
export function generateEan13(): string {
  const digits = [2, 0]
  for (let i = 0; i < 10; i++) {
    digits.push(Math.floor(Math.random() * 10))
  }
  // checksum
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  const checksum = (10 - (sum % 10)) % 10
  digits.push(checksum)
  return digits.join('')
}

/**
 * Generate an EAN-13 that isn't in `existing` — used when assigning several
 * barcodes in the same batch (e.g. one per variant row), so two rows can't
 * end up with the same randomly-generated code before the server even gets
 * a chance to reject the duplicate.
 */
export function generateUniqueEan13(existing: Set<string> | string[]): string {
  const used = existing instanceof Set ? existing : new Set(existing)
  let code = generateEan13()
  let guard = 0
  while (used.has(code) && guard < 20) {
    code = generateEan13()
    guard++
  }
  return code
}
