/**
 * Money & number formatting utilities.
 * All monetary values stored as decimals in DB; formatting is display-only.
 */

const EGP = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const NUM_INT = new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format a number as EGP currency (Arabic locale). */
export function formatCurrency(amount: number, currency = 'EGP'): string {
  if (currency === 'EGP') return EGP.format(amount);
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a number for general display (Arabic digits). */
export function formatNumber(value: number, decimals = 2): string {
  return decimals === 0 ? NUM_INT.format(value) : NUM.format(value);
}

/** Parse a localized number string back to a JS number. */
export function parseNumber(input: string): number {
  const normalized = input
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632))
    .replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Multiply two decimals safely (avoid float drift). */
export function multiplyDecimal(a: number, b: number): number {
  return Number((a * b).toFixed(4));
}

/** Round to 2 decimals safely. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
