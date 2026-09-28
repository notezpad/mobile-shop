import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'
import { HomeGate } from '@/components/HomeGate'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'

/**
 * 🛡️ الصفحة الرئيسية — Server Component (SSR / static).
 * كل نص الـ Landing (H1، المزايا، الأسعار، الأسئلة الشائعة) موجود في الـ HTML
 * اللي محركات البحث بتستلمه، من غير ما تحتاج تشغّل JavaScript.
 *
 * مفيش cookies() أو headers() هنا عمداً، عشان Next يعمل prerender ثابت
 * للصفحة — يعني صفر CPU على الـ Worker لكل زحفة بوت.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// أسعار الباقات — لازم تطابق اللي معروض فعلاً في صفحة الأسعار.
const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, iOS, Android, Windows, macOS',
  url: SITE_URL,
  inLanguage: 'ar',
  description: SITE_DESCRIPTION,
  offers: [
    { '@type': 'Offer', name: 'باقة أساسية - موبايل وكمبيوتر', price: '299', priceCurrency: 'EGP' },
    { '@type': 'Offer', name: 'باقة احترافية - موبايل وكمبيوتر', price: '599', priceCurrency: 'EGP' },
    { '@type': 'Offer', name: 'باقة أساسية - ملابس وأحذية', price: '349', priceCurrency: 'EGP' },
    { '@type': 'Offer', name: 'باقة احترافية - ملابس وأحذية', price: '699', priceCurrency: 'EGP' },
  ],
  featureList: [
    'نقطة بيع (POS) كاملة بالباركود',
    'إدارة مخزون ذكية مع تنبيهات النفاد',
    'متابعة الصيانة أول بأول',
    'معاملات مالية ومحافظ إلكترونية متعددة',
    'تقارير وأرباح لحظية',
    'بيع بالجملة والقطاعي',
    'يعمل بدون إنترنت (PWA)',
  ],
  // ⚠️ اتشال aggregateRating عمداً: ما ينفعش يترجع إلا لو فيه تقييمات حقيقية
  // ظاهرة للزائر في الصفحة (سياسة جوجل للـ structured data).
}

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
