'use client'

/**
 * Tiny fetch wrapper used by all client views.
 * Always sends JSON, parses JSON, throws on non-2xx.
 */
export async function api<T = any>(
  url: string,
  options?: { method?: string; body?: any; signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(url, {
    method: options?.method ?? 'GET',
    headers:
      options?.body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  })
  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      `طلب فاشل (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : 'طلب فاشل')
  }
  return data as T
}
