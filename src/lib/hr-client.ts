/**
 * hr-client.ts — كتابة مباشرة لمسارات الموارد البشرية من الواجهة (بدون طابور الأوفلاين العام).
 * الفلوس والحضور لازم يتنفذوا فعلاً، وبنبعت Idempotency-Key عشان الضغط المزدوج/إعادة
 * المحاولة ما تكرّرش العملية. الأخطاء بتفرّق بين «مفيش اتصال» و«السيرفر رفض».
 */

/** مفيش اتصال بالسيرفر (أوفلاين / مهلة) — الطلب يستاهل إعادة المحاولة لاحقًا */
export class HrNetworkError extends Error {
  constructor(message = 'مفيش اتصال بالإنترنت — الحضور والرواتب محتاجين اتصال') {
    super(message)
    this.name = 'HrNetworkError'
  }
}

/** السيرفر رد بخطأ — status بيحدد هل نعيد المحاولة (5xx/429) ولا الطلب مرفوض نهائيًا */
export class HrHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'HrHttpError'
    this.status = status
  }
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `hr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export async function hrSend<T = any>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  opts?: { key?: string; timeoutMs?: number },
): Promise<T> {
  const ctrl = opts?.timeoutMs ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts!.timeoutMs) : null
  let res: Response
  try {
    res = await fetch(url, {
      method,
      signal: ctrl?.signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method === 'POST' ? { 'Idempotency-Key': opts?.key ?? newIdempotencyKey() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new HrNetworkError()
  } finally {
    if (timer) clearTimeout(timer)
  }
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!res.ok) throw new HrHttpError(data?.error || `طلب فاشل (${res.status})`, res.status)
  return data as T
}
