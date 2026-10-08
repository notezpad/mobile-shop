import type { Metadata, Viewport } from "next";
import { Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { TrackingBootstrap } from "@/components/tracking/TrackingBootstrap";
import {
  SITE_URL,
  SITE_NAME,
  SITE_NAME_AR,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SUPPORT_PHONE,
} from "@/lib/site";

// خط هوية اسم المحل في السايدبار
const brandFont = IBM_Plex_Sans_Arabic({
  variable: "--font-brand",
  subsets: ["arabic", "latin"],
  weight: ["600", "700"],
  display: "swap",
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

// 🛡️ 2026-09-14: Comprehensive SEO metadata for the entire site.
// Next.js 16 supports the full Metadata API — these fields generate
// <title>, <meta description>, Open Graph tags, Twitter Card tags,
// canonical URLs, robots meta, and more — automatically.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  // ── Primary ──
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  applicationName: SITE_NAME_AR, // اسم التطبيق (PWA) — زي ما كان
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

  // ── Open Graph (Facebook, LinkedIn, etc.) ──
  openGraph: {
    type: "website",
    locale: "ar_EG",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
        type: "image/png",
      },
      {
        url: "/og-image-square.png",
        width: 1080,
        height: 1080,
        alt: SITE_TITLE,
        type: "image/png",
      },
    ],
  },

  // ── Twitter Cards ──
  twitter: {
    card: "summary_large_image",
    site: "@nezampos",
    creator: "@nezampos",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },

  // ── PWA / Mobile ──
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME_AR, // اسم الأيقونة على الشاشة الرئيسية — زي ما كان
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
  // توكن التحقق بيتحط من متغير البيئة فقط — مفيش قيمة وهمية بتتطلّع في الـ HTML
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  other: {
    "theme-color": "#10b981",
    "msapplication-TileColor": "#10b981",
    "msapplication-tap-highlight": "no",
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": SITE_NAME_AR,
    "application-name": SITE_NAME_AR,
    "rating": "general",
    "language": "Arabic",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 🛡️ لما الكيبورد يفتح على الجوال، الـ layout viewport يصغر معاه (بدل ما الكيبورد
  // يغطي الجزء السفلي) — فالدايلوجات و Bottom Sheets تفضل ظاهرة فوق الكيبورد.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 🛡️ JSON-LD (Organization + WebSite) — بيانات حقيقية بس.
  // اتشال: aggregateRating (تقييمات مش حقيقية = مخالفة لسياسة جوجل)،
  // و SearchAction (مفيش بحث في الموقع بالشكل ده)، ورابط واتساب من sameAs.
  // SoftwareApplication اتنقل للصفحة الرئيسية بس (src/app/page.tsx).
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: SITE_NAME_AR,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: SITE_DESCRIPTION,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: SUPPORT_PHONE,
      contactType: "customer support",
      availableLanguage: ["Arabic"],
    },
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "ar",
    description: SITE_DESCRIPTION,
  };

  // 📊 Tracking Layer — 🛠️ الإعدادات لم تعد تُقرأ هنا.
  // السبب: الـ layout الجذري كان يقرأ PlatformSetting أثناء الـ prerender/build
  // فتُخبَّز الإعدادات (غالباً الافتراضية enabled=false) داخل HTML الصفحات الثابتة،
  // فلا يصل أي تغيير من لوحة الأدمن للمتصفح ولا يُحمَّل أي بكسل.
  // الآن TrackingBootstrap يجلبها وقت التشغيل من /api/tracking/config (no-store).
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* 🛡️ SEO: JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body
        className={`${cairo.variable} ${brandFont.variable} font-cairo antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors />
        </Providers>

        {/* 📊 Marketing & Tracking Layer — مركزية من إعدادات لوحة الأدمن */}
        <TrackingBootstrap />

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
