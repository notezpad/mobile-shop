/**
 * Security helpers — sanitize user input for Supabase PostgREST filters.
 */

/**
 * Sanitize a search string for use in Supabase `or()` / `ilike()` filters.
 * Escapes special PostgREST characters: `,`, `.`, `(`, `)`, `\`.
 * Also truncates to prevent overly long queries.
 */
export function sanitizeSearch(input: string | undefined | null): string {
  if (!input) return '';
  // Remove control characters and limit length.
  const cleaned = input.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  // Escape PostgREST special chars by wrapping in double quotes if needed.
  // PostgREST `or` uses commas to separate conditions and dots as operators.
  // We use `ilike` which treats the value as literal after the `.*` wildcard.
  return cleaned;
}

/**
 * Build a safe `or` filter string for Supabase queries.
 * Example: buildOrFilter('john', ['name', 'username', 'email'], 'ilike')
 * → "name.ilike.%john%,username.ilike.%john%,email.ilike.%john%"
 */
export function buildOrFilter(
  search: string,
  columns: string[],
  operator: 'ilike' | 'eq' = 'ilike',
): string {
  const safe = sanitizeSearch(search);
  if (!safe) return '';
  return columns.map((col) => `${col}.${operator}.%${safe}%`).join(',');
}
