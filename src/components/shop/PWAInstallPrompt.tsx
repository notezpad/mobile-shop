'use client'

import * as React from 'react'
import { Download, X, Smartphone, Share } from 'lucide-react'

/**
 * PWAInstallPrompt 2026 — premium install experience.
 *
 * Features:
 *  ✅ beforeinstallprompt capture (Chrome/Edge/Android)
 *  ✅ iOS Safari manual instructions (Share → Add to Home Screen)
 *  ✅ Dismissal persistence (localStorage — 30 day cooldown)
 *  ✅ Detection of standalone mode (already installed)
 *  ✅ Animated entrance (framer-motion)
 *  ✅ Platform-specific UI (Android vs iOS)
 *  ✅ Install success tracking
 */

const INSTALLED_KEY = 'pwa-installed'

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone === true
  )
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null)
  const [showBanner, setShowBanner] = React.useState(false)
  const [isIOS, setIsIOS] = React.useState(false)
  const [installed, setInstalled] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let handler: ((e: Event) => void) | undefined

    const markInstalled = () => {
      try { localStorage.setItem(INSTALLED_KEY, '1') } catch {}
      setInstalled(true)
      setShowBanner(false)
    }
    const onInstalled = () => markInstalled()
    window.addEventListener('appinstalled', onInstalled)

    // 1) مثبّت ومفتوح كتطبيق → افتكر ده على الجهاز (عشان لو فتحه من المتصفح بعدين)
    if (isStandaloneMode()) {
      markInstalled()
      return () => window.removeEventListener('appinstalled', onInstalled)
    }

    // 2) سبق وتأكدنا إنه مثبّت على الجهاز ده → ما نظهرش البانر
    try {
      if (localStorage.getItem(INSTALLED_KEY) === '1') {
        setInstalled(true)
        return () => window.removeEventListener('appinstalled', onInstalled)
      }
    } catch {}

    // 3) فترة الإخفاء بعد الإغلاق (30 يوم)
    try {
      const dismissedAt = localStorage.getItem('pwa-install-dismissed-at')
      if (dismissedAt) {
        const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24)
        if (daysSince < 30) {
          return () => window.removeEventListener('appinstalled', onInstalled)
        }
      }
    } catch {}

    // 4) switch الأدمن + فحص "هل مثبّت" (Chrome Android) قبل أي عرض
    ;(async () => {
      // ⚠️ الأدمن هو اللي بيقرر: البانر ما يظهرش إلا لو السيرفر قال "مفعّل" صراحةً.
      // لو الطلب فشل نستخدم آخر قيمة معروفة؛ ولو مفيش قيمة نخفيه (أأمن من إظهاره غلط).
      let enabled = false
      try {
        const res = await fetch('/api/pwa/config?t=' + Date.now(), { cache: 'no-store' })
        if (res.ok) {
          const cfg = await res.json()
          enabled = cfg?.installBannerEnabled === true
          try { localStorage.setItem('pwa-banner-enabled', enabled ? '1' : '0') } catch {}
        } else {
          throw new Error('bad status')
        }
      } catch {
        try { enabled = localStorage.getItem('pwa-banner-enabled') === '1' } catch {}
      }
      if (!enabled || cancelled) return
      if (cancelled) return

      try {
        const related = await (navigator as any).getInstalledRelatedApps?.()
        if (Array.isArray(related) && related.length > 0) {
          markInstalled()
          return
        }
      } catch {}
      if (cancelled) return

      const ua = navigator.userAgent
      const isiOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
      if (isiOS) {
        setIsIOS(true)
        timer = setTimeout(() => setShowBanner(true), 5000)
        return
      }

      handler = (e: Event) => {
        e.preventDefault()
        setDeferredPrompt(e)
        timer = setTimeout(() => setShowBanner(true), 5000)
      }
      window.addEventListener('beforeinstallprompt', handler)
    })()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (handler) window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowBanner(false)
    } else {
      // Dismissed — set 30-day cooldown
      localStorage.setItem('pwa-install-dismissed-at', String(Date.now()))
      setShowBanner(false)
    }

    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa-install-dismissed-at', String(Date.now()))
  }

  if (installed || !showBanner) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 animate-in-up pb-[env(safe-area-inset-bottom)]"
      style={{
        animation: 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div className="mx-auto max-w-md p-2 sm:p-4">
        <div
          className="flex items-center gap-2 rounded-2xl border bg-card p-2.5 shadow-2xl sm:gap-3 sm:p-4"
          style={{
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          {/* Icon */}
          <div className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30 min-[380px]:flex">
            <Smartphone className="size-6" />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {isIOS ? 'أضف النظام لشاشتك' : 'تثبيت التطبيق'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
              {isIOS
                ? 'يعمل بدون متصفح وبسرعة أكبر'
                : 'استخدم النظام كتطبيق بدون متصفح'}
            </p>
          </div>

          {/* Actions */}
          {isIOS ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Share className="size-4" />
              <span>مشاركة</span>
            </div>
          ) : (
            <button
              onClick={handleInstall}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 active:scale-95"
            >
              <Download className="size-3.5" />
              تثبيت
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted active:scale-90"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
