import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — نظام المحل",
  description:
    "سياسة الخصوصية الكاملة لمنصة نظام المحل — البيانات التي نجمعها، كيفية استخدامها، مشاركة البيانات، ملفات تعريف الارتباط (Cookies)، أمان البيانات، حقوقك، الاحتفاظ بالبيانات، النقل الدولي، والقانون الحاكم.",
  keywords: [
    "سياسة الخصوصية",
    "الخصوصية",
    "حماية البيانات",
    "أمان البيانات",
    "نظام المحل",
    "Cookies",
    "ملفات تعريف الارتباط",
    "حقوق المستخدم",
    "GDPR",
  ],
  openGraph: {
    title: "سياسة الخصوصية — نظام المحل",
    description:
      "سياسة الخصوصية الكاملة — نوضح بكل شفافية كيف نجمع بياناتك ونستخدمها ونحميها.",
    url: "/privacy-policy",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "سياسة الخصوصية — نظام المحل",
    description: "سياسة الخصوصية الكاملة لمنصة نظام المحل.",
  },
  alternates: {
    canonical: "/privacy-policy",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
