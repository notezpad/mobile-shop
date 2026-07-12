/**
 * Date utilities — RTL-friendly, Arabic locale.
 * Uses Intl.DateTimeFormat for zero deps.
 */

const arLocale = 'ar-EG';
const enLocale = 'en-US';

const dateFormatters = {
  short: new Intl.DateTimeFormat(arLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }),
  long: new Intl.DateTimeFormat(arLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
  time: new Intl.DateTimeFormat(arLocale, {
    hour: '2-digit',
    minute: '2-digit',
  }),
  relative: new Intl.RelativeTimeFormat(arLocale, { numeric: 'auto' }),
};

/** Format ISO date string as short date (yyyy-MM-dd). */
export function formatDate(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return dateFormatters.short.format(date);
}

/** Format ISO date string as long date with time. */
export function formatDateTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return dateFormatters.long.format(date);
}

/** Format ISO date string as time only. */
export function formatTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return dateFormatters.time.format(date);
}

/** Relative time (e.g. "منذ 5 دقائق"). */
export function formatRelative(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (Math.abs(diffSec) < 60) return dateFormatters.relative.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return dateFormatters.relative.format(diffMin, 'minute');
  if (Math.abs(diffHr) < 24) return dateFormatters.relative.format(diffHr, 'hour');
  return dateFormatters.relative.format(diffDay, 'day');
}

/** Current ISO timestamp (UTC). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Format date for <input type="date"> (yyyy-MM-dd). */
export function toDateInputValue(iso: string | Date | null): string {
  if (!iso) return '';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return date.toISOString().split('T')[0]!;
}

/** Format date for <input type="datetime-local"> (yyyy-MM-ddTHH:mm). */
export function toDateTimeInputValue(iso: string | Date | null): string {
  if (!iso) return '';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const tzAdjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return tzAdjusted.toISOString().slice(0, 16);
}

/** Switch locale globally (rare use). */
export function setLocale(locale: 'ar' | 'en'): void {
  // Implemented for future use.
  void locale;
  void enLocale;
}
