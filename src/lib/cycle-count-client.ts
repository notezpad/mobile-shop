/**
 * 🔄 2026-10-31 (التحديث الثاني عشر) — استدعاء محرك الأتمتة من المتصفح.
 *
 * بيُنادى منه من الداشبورد ومحطة الجرد — أول تشغيل للتطبيق في الموعد
 * بيولّد أوراق الجرد الدوري المستحقة (الحماية على السيرفر: claim ذري —
 * حتى لو 10 أجهزة نادت في نفس اللحظة، ورقة واحدة بس).
 *
 * الخانة: مرة كل 10 دقايق لكل جلسة متصفح (sessionStorage) — عشان مابيبعتش
 * طلبات زيادة، والسيرفر محمي أصلاً.
 */
import { api } from './api'

const RUN_THROTTLE_KEY = 'cycle-count-run-last'

export async function runCycleCountAutomation(): Promise<void> {
  try {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return
    const last = Number(sessionStorage.getItem(RUN_THROTTLE_KEY) ?? 0)
    if (Date.now() - last < 10 * 60 * 1000) return
    sessionStorage.setItem(RUN_THROTTLE_KEY, String(Date.now()))
    await api('/api/inventory/cycle-count/run', { method: 'POST' })
  } catch {
    /* صامت — الأتمتة مش حرجة، والمحاولة الجاية هتعدي */
  }
}
