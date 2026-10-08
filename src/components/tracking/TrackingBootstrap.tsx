'use client'

/**
 * ═══════════════════════════════════════════════════════════════════
 * Tracking Bootstrap — يُركَّب مرة واحدة في Root Layout
 * ═══════════════════════════════════════════════════════════════════
 *  1) يجلب الإعدادات العامة (بدون Secrets) وقت التشغيل من
 *     /api/tracking/config — لا تُخبَّز في HTML الصفحات الثابتة.
 *  2) يهيئ طبقة التتبع أولاً، ثم فقط يبدأ تسجيل PageView.
 *     (إصلاح: effect الابن كان يُنفَّذ قبل effect الأب فيضيع أول PageView
 *      لأن config لم يكن جاهزاً بعد.)
 */

import { useEffect, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { PublicTrackingConfig } from '@/lib/tracking/types'
import { initTracking, trackPageView } from '@/lib/tracking/client'
import { ConsentBanner } from './ConsentBanner'

function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    trackPageView(url)
  }, [pathname, searchParams])

  return null
}

async function fetchConfig(): Promise<PublicTrackingConfig | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/tracking/config', { cache: 'no-store' })
      if (res.ok) return (await res.json()) as PublicTrackingConfig
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 800))
  }
  return null
}

export function TrackingBootstrap() {
  const [config, setConfig] = useState<PublicTrackingConfig | null>(null)

  useEffect(() => {
    let alive = true
    fetchConfig().then((cfg) => {
      if (!alive || !cfg) return
      initTracking(cfg) // يضبط config داخلياً قبل أي trackPageView
      setConfig(cfg)
    })
    return () => { alive = false }
  }, [])

  // لا نرندر PageViewTracker قبل جاهزية الإعدادات → أول PageView لا يضيع
  if (!config) return null

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {/* واجهة موافقة الكوكيز — تظهر فقط عند تفعيل Consent Management */}
      <ConsentBanner config={config} />
    </>
  )
}
