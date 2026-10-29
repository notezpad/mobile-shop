/**
 * hr-kiosk-queue.ts — طابور تسجيل الحضور بدون إنترنت (كشك الـ PIN) — واجهة فقط.
 *
 * الفكرة: لو النت فصل، التسجيل بيتحفظ على الجهاز بوقته الحقيقي (clientTime) ويتبعت لما النت يرجع.
 * التحقق من الـ PIN بيحصل على السيرفر وقت المزامنة (مش بنخزّن أي hash للـ PIN على الجهاز)،
 * والـ PIN بيتخزن مؤقتًا مع التسجيل المعلّق ويتمسح بمجرد ما يتبعت أو يترفض.
 * التسجيل المرفوض (PIN غلط…) بيظهر للمدير عشان يسجله يدوي.
 */
import { HrHttpError, HrNetworkError, hrSend, newIdempotencyKey } from '@/lib/hr-client'

export interface QueuedPunch {
  id: string // = Idempotency-Key
  employeeId: number
  name: string
  pin: string
  clientTime: string // ISO
}
export interface RejectedPunch {
  id: string
  employeeId: number
  name: string
  clientTime: string
  reason: string
}

const Q_KEY = 'hr-kiosk-queue-v1'
const R_KEY = 'hr-kiosk-rejected-v1'
const ITEMS_KEY = 'hr-kiosk-items-v1'
const EVT = 'hr-kiosk-queue-changed'

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* التخزين ممنوع/ممتلئ */ }
  try { window.dispatchEvent(new Event(EVT)) } catch { /* ignore */ }
}

export const getQueue = () => (typeof window === 'undefined' ? [] : read<QueuedPunch>(Q_KEY))
export const getRejected = () => (typeof window === 'undefined' ? [] : read<RejectedPunch>(R_KEY))
export const clearRejected = () => write(R_KEY, [])

/** هل التخزين المحلي شغال؟ (وضع التصفح الخاص ممكن يمنعه — ساعتها مينفعش نعد بالتسجيل أوفلاين) */
export function queueAvailable(): boolean {
  try {
    localStorage.setItem('__hrq', '1'); localStorage.removeItem('__hrq'); return true
  } catch { return false }
}

/** id اختياري: نفس الـ Idempotency-Key بتاع المحاولة الأونلاين اللي فشلت (لو السيرفر نفّذها والرد ضاع، المزامنة ما بتكررهاش) */
export function enqueuePunch(p: Omit<QueuedPunch, 'id'> & { id?: string }): QueuedPunch {
  const item: QueuedPunch = { ...p, id: p.id ?? newIdempotencyKey() }
  write(Q_KEY, [...getQueue(), item])
  return item
}

/** آخر قائمة موظفين اتحمّلت (للكشك لو فتح بدون نت) */
export function saveItemsCache(items: unknown, meta: { today: string; tz: string }) {
  try { localStorage.setItem(ITEMS_KEY, JSON.stringify({ at: Date.now(), items, ...meta })) } catch { /* ignore */ }
}
export function loadItemsCache<T>(): { at: number; items: T[]; today: string; tz: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(ITEMS_KEY) || 'null')
    return v && Array.isArray(v.items) ? v : null
  } catch { return null }
}

let flushing = false

/**
 * يبعت الطابور بالترتيب. نتيجة كل تسجيل:
 *  - نجح / 409 (متسجل قبل كده) → يتشال.
 *  - 4xx تانية (PIN غلط، موظف اتحذف…) → يتشال ويتحط في «المرفوضة» والـ PIN بيتمسح.
 *  - مفيش اتصال / 429 / 5xx → يفضل في الطابور ونقف (نجرب بعدين).
 */
export async function flushQueue(): Promise<{ sent: number; rejected: number; left: number }> {
  if (typeof window === 'undefined' || flushing) return { sent: 0, rejected: 0, left: getQueue().length }
  flushing = true
  let sent = 0, rejected = 0
  try {
    for (const p of getQueue()) {
      try {
        await hrSend('/api/hr/kiosk', 'POST', { employeeId: p.employeeId, pin: p.pin, clientTime: p.clientTime }, { key: p.id, timeoutMs: 10_000 })
        sent++
      } catch (e) {
        if (e instanceof HrNetworkError) break
        if (e instanceof HrHttpError && (e.status === 429 || e.status >= 500)) break
        if (e instanceof HrHttpError && e.status === 409) { /* متسجل بالفعل */ }
        else {
          rejected++
          const reason = e instanceof Error ? e.message : 'مرفوض'
          write(R_KEY, [...getRejected(), { id: p.id, employeeId: p.employeeId, name: p.name, clientTime: p.clientTime, reason }])
        }
      }
      write(Q_KEY, getQueue().filter((x) => x.id !== p.id))
    }
  } finally {
    flushing = false
  }
  return { sent, rejected, left: getQueue().length }
}

export const KIOSK_QUEUE_EVENT = EVT
