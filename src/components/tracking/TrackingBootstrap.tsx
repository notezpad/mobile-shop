'use client'

/**
 * ═══════════════════════════════════════════════════════════════════
 * Tracking Bootstrap — يُركَّب مرة واحدة في Root Layout
 * ═══════════════════════════════════════════════════════════════════
 *  1) يهيئ طبقة التتبع بالإعدادات العامة الآمنة (بدون Secrets) التي
 *     قرأها السيرفر من قاعدة البيانات — بدون أي طلب شبكة إضافي.
 *  2) يسجل PageView عند كل تنقلة SPA مع حماية صارمة من التكرار
 *     (React StrictMode / hydration / re-render).
 */

import { useEffect, Suspense, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { PublicTrackingConfig } from '@/lib/tracking/types'
import { initTracking, trackPageView } from '@/lib/tracking/client'
import { ConsentBanner } from './ConsentBanner'

function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const firstRun = useRef(true)

  useEffect(() => {
    // تجاهل الأحداث الصامتة أثناء الـ hydration الأول — يُرسل أدناه مرة
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    trackPageView(url)
    firstRun.current = false
  }, [pathname, searchParams])

  return null
}

export function TrackingBootstrap({ config }: { config: PublicTrackingConfig }) {
  useEffect(() => {
    initTracking(config)
    // الإعدادات العامة تُقرأ من السيرفر — لا نعيد التهيئة عند كل render
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {/* واجهة موافقة الكوكيز الحقيقية — تظهر فقط عند تفعيل Consent Management */}
      <ConsentBanner config={config} />
    </>
  )
}
