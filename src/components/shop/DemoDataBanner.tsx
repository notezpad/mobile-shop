'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { FlaskConical, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shop/ConfirmDialogProvider'
import { useShopStore } from '@/lib/store'

/**
 * DemoDataBanner — كارت عائم (نفس حاوية TrialExpiredBanner) للبيانات التجريبية.
 *  - لو فيه بيانات تجريبية: «امسحها وابدأ شغلك الحقيقي».
 *  - لو المحل فاضي (عملاء سجّلوا قبل الميزة دي): عرض تحميلها — في لوحة المعلومات بس.
 * للأدمن فقط. بيستخدم fetch عادي عشان العمليات دي لازم تتنفذ أونلاين فعلاً.
 */
interface Status {
  active: boolean
  counts: { products: number; customers: number; suppliers: number; sales: number }
  hasRealSales: boolean
  canSeed: boolean
}

const OFFER_KEY = 'nezam:demo-offer-dismissed:'
const SESSION_KEY = 'nezam:demo-banner-closed:'

export function DemoDataBanner() {
  const user = useShopStore((s) => s.user)
  const pathname = usePathname()
  const confirm = useConfirm()
  const [status, setStatus] = React.useState<Status | null>(null)
  const [hidden, setHidden] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const tenantId = user?.tenantId ?? ''

  React.useEffect(() => {
    if (!isAdmin) return
    let off = false
    fetch('/api/demo', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (!off && s) setStatus(s) })
      .catch(() => {})
    try {
      if (localStorage.getItem(OFFER_KEY + tenantId) === '1') setHidden(true)
      if (sessionStorage.getItem(SESSION_KEY + tenantId) === '1') setHidden(true)
    } catch { /* التخزين غير متاح */ }
    return () => { off = true }
  }, [isAdmin, tenantId])

  // هدوء: الكارت بيظهر في لوحة المعلومات بس (مش على كل صفحة) وبيتقفل لباقي الجلسة
  if (!isAdmin || !status || hidden || pathname !== '/dashboard') return null

  const finish = () => window.location.reload()

  async function purge() {
    const ok = await confirm({
      title: 'مسح البيانات التجريبية؟',
      description: status!.hasRealSales
        ? 'هيتمسح التجريبي بس (منتجات/عملاء/فواتير تجريبية). فواتيرك الحقيقية هتفضل زي ما هي.'
        : 'هيتمسح كل المنتجات والعملاء والفواتير التجريبية، وتبدأ بمحل نضيف.',
      confirmText: 'امسح وابدأ',
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch('/api/demo', { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success('تم مسح البيانات التجريبية — محلك جاهز للشغل الحقيقي')
      setTimeout(finish, 600)
    } catch {
      toast.error('تعذّر المسح — تأكد من الاتصال وحاول تاني')
      setBusy(false)
    }
  }

  async function seed() {
    setBusy(true)
    try {
      const r = await fetch('/api/demo', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (j?.detail || j?.reason) console.error('[demo] seed failed:', j.reason, j.detail)
        throw new Error(`${j?.error || 'تعذّر التحميل'}${j?.reason ? ` (${j.reason})` : ''}`)
      }
      toast.success('تم تحميل بيانات تجريبية — استكشف النظام براحتك')
      setTimeout(finish, 600)
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر التحميل')
      setBusy(false)
    }
  }

  function closeForSession() {
    setHidden(true)
    try { sessionStorage.setItem(SESSION_KEY + tenantId, '1') } catch { /* ignore */ }
  }

  function dismiss() {
    setHidden(true)
    try { if (!status!.active) localStorage.setItem(OFFER_KEY + tenantId, '1') } catch { /* ignore */ }
  }

  const card = 'pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur-md'

  if (status.active) {
    return (
      <div className={card} role="status">
        <FlaskConical className="size-5 shrink-0 text-violet-500" />
        <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
          <b className="text-foreground">بتشوف بيانات تجريبية</b> — جرّب النظام براحتك، ولما تخلص امسحها وابدأ شغلك الحقيقي.
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={purge}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : 'امسحها'}
        </Button>
        <button type="button" aria-label="إغلاق" className="text-muted-foreground" onClick={closeForSession}>
          <X className="size-4" />
        </button>
      </div>
    )
  }

  if (status.canSeed) {
    return (
      <div className={card} role="status">
        <FlaskConical className="size-5 shrink-0 text-violet-500" />
        <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
          <b className="text-foreground">محلك لسه فاضي.</b> عايز تجرّب النظام ببيانات تجريبية (منتجات وفواتير وعملاء)؟ تقدر تمسحها بضغطة.
        </p>
        <Button size="sm" disabled={busy} onClick={seed}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : 'حمّل بيانات تجريبية'}
        </Button>
        <button type="button" aria-label="لا شكراً" className="text-muted-foreground" onClick={dismiss}>
          <X className="size-4" />
        </button>
      </div>
    )
  }
  return null
}
