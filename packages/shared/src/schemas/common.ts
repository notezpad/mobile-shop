import { z } from 'zod';

/** Phone: Egyptian mobile format (01xxxxxxxxx) or international (+20…). */
export const phoneSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine(
    (v) => !v || /^(?:\+20|0)?1[0-2,5]\d{8}$/.test(v.replace(/[\s-]/g, '')),
    'رقم الهاتف غير صالح',
  );

/** Egyptian national ID (14 digits). */
export const nationalIdSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((v) => !v || /^\d{14}$/.test(v), 'الرقم القومي يجب أن يكون 14 رقماً');

/** IMEI (15 digits, Luhn checksum validated). */
export const imeiSchema = z
  .string()
  .trim()
  .refine((v) => /^\d{15}$/.test(v ?? ''), 'IMEI يجب أن يكون 15 رقماً')
  .refine((v) => luhnCheck(v ?? ''), 'IMEI غير صالح (checksum)');

function luhnCheck(num: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = num.length - 1; i >= 0; i--) {
    const char = num[i];
    if (!char) continue;
    let digit = parseInt(char, 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/** Positive amount (allows 0). */
export const amountSchema = z.number().min(0).multipleOf(0.01);

/** Positive integer. */
export const positiveIntSchema = z.number().int().positive();

/** Non-empty trimmed string. */
export const nonEmptyString = z.string().trim().min(1);

/** ISO date string. */
export const isoDateSchema = z.string().datetime({ offset: true });

/** UUID v4. */
export const uuidSchema = z.string().uuid();
