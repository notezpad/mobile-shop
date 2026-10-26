import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'
import { HomeGate } from '@/components/HomeGate'
import { buildSoftwareApplicationJsonLd } from '@/lib/plans-schema'
import { buildPageMetadata } from '@/lib/seo'

/**
 * 🛡️ الصفحة الرئيسية — Server Component (SSR / static).
 * كل نص الـ Landing (H1، المزايا، الأسعار، الأسئلة الشائعة) موجود في الـ HTML
 * اللي محركات البحث بتستلمه، من غير ما تحتاج تشغّل JavaScript.
 *
 * مفيش cookies() أو headers() هنا عمداً، عشان Next يعمل prerender ثابت
 * للصفحة — يعني صفر CPU على الـ Worker لكل زحفة بوت.
 */
// Title / Description / OG / canonical مأخوذين حرفيًا من src/lib/seo.ts
export const metadata: Metadata = buildPageMetadata('/')

// JSON-LD للتطبيق + الباقات (Offer/UnitPriceSpecification) — المصدر: src/lib/plans-schema.ts
const softwareAppJsonLd = buildSoftwareApplicationJsonLd()

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <HomeGate>
        <LandingPage />
      </HomeGate>
    </>
  )
}
