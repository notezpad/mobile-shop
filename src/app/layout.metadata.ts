// انسخ الـ exports دي في app/layout.tsx بدل الـ metadata والـ viewport الحاليين
import type { Metadata, Viewport } from "next";
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, OG_IMAGE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Business",
  alternates: {
    canonical: "/", // كل صفحة لازم تحط canonical بتاعها (شوف README)
    languages: { ar: "/", "x-default": "/" },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    locale: "ar_EG",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  // حط كود التحقق الحقيقي من Google Search Console، أو امسح السطر
  // verification: { google: "PUT-REAL-CODE" },
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32" }],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#10b981",
  // اتشال maximum-scale و user-scalable=no — بيمنعوا التكبير ويضروا تقييم جوجل للموبايل
};
