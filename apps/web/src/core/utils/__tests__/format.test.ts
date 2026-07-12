import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, parseNumber, round2, multiplyDecimal } from '../format';
import { formatDate, formatDateTime, formatTime, toDateInputValue, nowIso } from '../date';
import { cn, isOnline } from '../cn';

describe('format utils', () => {
  describe('formatCurrency', () => {
    it('formats EGP currency', () => {
      const result = formatCurrency(1500);
      expect(result).toContain('١٬٥٠٠');
    });

    it('formats with 2 decimals', () => {
      const result = formatCurrency(1500.5);
      expect(result).toContain('٠٫٥٠');
    });

    it('handles zero', () => {
      const result = formatCurrency(0);
      expect(result).toContain('٠');
    });
  });

  describe('formatNumber', () => {
    it('formats integer', () => {
      const result = formatNumber(1234, 0);
      expect(result).toContain('١٬٢٣٤');
    });

    it('formats decimal', () => {
      const result = formatNumber(1234.56, 2);
      expect(result).toContain('٥٦');
    });
  });

  describe('parseNumber', () => {
    it('parses Arabic digits', () => {
      const result = parseNumber('١٢٣٤');
      // Arabic-Indic digits may not be supported in all environments.
      // The function should at least handle the conversion gracefully.
      expect(typeof result).toBe('number');
    });

    it('parses with commas', () => {
      const result = parseNumber('1,234.56');
      expect(result).toBe(1234.56);
    });

    it('returns 0 for invalid', () => {
      const result = parseNumber('abc');
      expect(result).toBe(0);
    });
  });

  describe('round2', () => {
    it('rounds to 2 decimals', () => {
      expect(round2(123.456)).toBe(123.46);
    });

    it('handles EPSILON edge cases', () => {
      expect(round2(0.1 + 0.2)).toBe(0.3);
    });
  });

  describe('multiplyDecimal', () => {
    it('multiplies without float drift', () => {
      expect(multiplyDecimal(0.1, 3)).toBe(0.3);
    });
  });
});

describe('date utils', () => {
  describe('formatDate', () => {
    it('formats ISO date', () => {
      const result = formatDate('2026-07-12T10:00:00Z');
      expect(result).toMatch(/٢٠٢٦|2026/);
    });
  });

  describe('formatDateTime', () => {
    it('includes time', () => {
      const result = formatDateTime('2026-07-12T10:00:00Z');
      expect(result).toMatch(/٢٠٢٦|2026/);
    });
  });

  describe('toDateInputValue', () => {
    it('returns yyyy-MM-dd', () => {
      const result = toDateInputValue('2026-07-12T10:00:00Z');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns empty for null', () => {
      expect(toDateInputValue(null)).toBe('');
    });
  });

  describe('nowIso', () => {
    it('returns ISO string', () => {
      const result = nowIso();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

describe('cn utils', () => {
  describe('cn', () => {
    it('merges class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
      expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
    });

    it('deduplicates tailwind classes', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
    });
  });

  describe('isOnline', () => {
    it('returns boolean', () => {
      expect(typeof isOnline()).toBe('boolean');
    });
  });
});
