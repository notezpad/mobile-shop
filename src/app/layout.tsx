import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

// 🛡️ 2026-09-14: Comprehensive SEO metadata for the entire site.
// Next.js 16 supports the full Metadata API — these fields generate
// <title>, <meta description>, Open Graph tags, Twitter Card tags,
// canonical URLs, robots meta, and more — automatically.

const SITE_URL = "https://shop-system.com";
const SITE_NAME = "نظام المحل";
const SITE_TITLE = "نظام المحل — منصة إدارة المحلات #1 في الدول العربية";
const SITE_DESCRIPTION =
  "نظام متكامل لإدارة محلات الموبايل والكمبيوتر، والملابس والأحذية — نقطة بيع (POS)، مخزون، صيانة، عملاء، معاملات مالية، وتقارير لحظية. تجربة مجانية 14 يوم بدون بطاقة ائتمان.";
const SITE_KEYWORDS = [
  "إدارة المحلات",
  "نقطة بيع",
  "POS",
  "محل موبايل",
  "محل كمبيوتر",
  "محل ملابس",
  "محل أحذية",
  "إدارة المخزون",
  "نظام محاسبي",
  "فواتير",
  "باركود",
  "صيانة",
  "عملاء",
  "موردين",
  "تقارير مبيعات",
  "بيع بالجملة",
  "بيع بالقطاعي",
  "السوق العربي",
  "منصة SaaS",
  "إدارة محلات",
  "برنامج محاسبة",
  "كاشير",
  "خزنة",
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  // ── Primary ──
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  authors: [{ name: "نظام المحل", url: SITE_URL }],
  creator: "نظام المحل",
  publisher: "نظام المحل",
  applicationName: SITE_NAME,
  category: "Business",
  classification: "Business Software, POS, ERP, Inventory Management",

  // ── Robots ──
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // ── Canonical + Alternates ──
  alternates: {
    canonical: "/",
    languages: {
      "ar": "/",
      "x-default": "/",
    },
  },

  // ── Open Graph (Facebook, LinkedIn, etc.) ──
  openGraph: {
    type: "website",
    locale: "ar_AR",
    alternateLocale: ["ar_SA", "ar_AE", "ar_EG", "ar_QA", "ar_KW", "ar_OM", "ar_BH", "ar_JO", "ar_LB"],
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "نظام المحل — منصة إدارة المحلات",
        type: "image/png",
      },
      {
        url: "/og-image-square.png",
        width: 1080,
        height: 1080,
        alt: "نظام المحل — منصة إدارة المحلات",
        type: "image/png",
      },
    ],
  },

  // ── Twitter Cards ──
  twitter: {
    card: "summary_large_image",
    site: "@shop_system",
    creator: "@shop_system",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },

  // ── PWA / Mobile ──
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },

  // ── Icons ──
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" }, // Modern browsers
      { url: "/favicon.ico", sizes: "any" }, // Legacy (IE/old)
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },

  // ── Misc SEO ──
  formatDetection: {
    telephone: true,
    address: false,
    email: true,
  },
  verification: {
    google: "google-site-verification-token-here", // ← ضع التوكن الحقيقي هنا من Google Search Console
    yandex: "",
    yahoo: "",
  },
  other: {
    "theme-color": "#10b981",
    "msapplication-TileColor": "#10b981",
    "msapplication-tap-highlight": "no",
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": SITE_NAME,
    "application-name": SITE_NAME,
    "rating": "general",
    "revisit-after": "1 day",
    "language": "Arabic",
    "geo.region": "ARAB",
    "geo.placename": "Arab World",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 🛡️ JSON-LD structured data for search engines.
  // Helps Google understand the organization + the software application +
  // the FAQ entries → can appear as rich results in search.
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "نظام المحل",
    alternateName: "Shop System",
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: SITE_DESCRIPTION,
    foundingDate: "2026",
    sameAs: [
      "https://wa.me/201010328471",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+201010328471",
      contactType: "customer support",
      availableLanguage: ["Arabic"],
      areaServed: ["SA", "AE", "EG", "QA", "KW", "OM", "BH", "JO", "LB", "IQ", "YE", "PS", "SY", "JO"],
    },
  };

  const softwareAppJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "نظام المحل",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android, Windows, macOS",
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    offers: [
      {
        "@type": "Offer",
        name: "باقة أساسية - موبايل وكمبيوتر",
        price: "299",
        priceCurrency: "EGP",
        description: "إدارة كاملة لمحل الموبايل والكمبيوتر — POS، مخزون، صيانة، معاملات مالية",
      },
      {
        "@type": "Offer",
        name: "باقة احترافية - موبايل وكمبيوتر",
        price: "599",
        priceCurrency: "EGP",
        description: "كل مزايا الباقة الأساسية + تقارير متقدمة، فروع، مستخدمين، وبيع بالجملة",
      },
      {
        "@type": "Offer",
        name: "باقة أساسية - ملابس وأحذية",
        price: "349",
        priceCurrency: "EGP",
        description: "إدارة محل الملابس والأحذية — POS، مخزون، مقاسات وألوان",
      },
      {
        "@type": "Offer",
        name: "باقة احترافية - ملابس وأحذية",
        price: "699",
        priceCurrency: "EGP",
        description: "كل مزايا الباقة الأساسية + كوليكشنات وبيع بالجملة (دستة/نص دستة)",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "127",
      reviewCount: "127",
      bestRating: "5",
      worstRating: "1",
    },
    featureList: [
      "نقطة بيع (POS) كاملة بالباركود",
      "إدارة مخزون ذكية مع تنبيهات النفاد",
      "متابعة الصيانة أول بأول",
      "معاملات مالية ومحافظ إلكترونية متعددة",
      "تقارير وأرباح لحظية",
      "بيع بالجملة والقطاعي",
      "يعمل بدون إنترنت (PWA + Offline)",
      "تطبيق ويب قابل للتثبيت (PWA)",
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "نظام المحل",
    url: SITE_URL,
    inLanguage: "ar",
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* 🛡️ Favicons — all formats for all devices */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="shortcut icon" href="/favicon.ico" />

        {/* Apple PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="نظام المحل" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Windows Tiles */}
        <meta name="msapplication-TileColor" content="#10b981" />
        <meta name="msapplication-TileImage" content="/icon-512.png" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="application-name" content="نظام المحل" />

        {/* Theme color for browsers */}
        <meta name="theme-color" content="#10b981" />

        {/* 🛡️ SEO: JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body
        className={`${cairo.variable} font-cairo antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors />
        </Providers>

        {/* ⚡ Service Worker registration — moved to body as a client script.
            Next.js 16 warns about <script> tags inside <head> of a Server Component
            because they're not executed during client-side navigation. Moving it
            to the end of <body> ensures it runs after hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(e) {
                    console.warn('SW registration failed:', e);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
