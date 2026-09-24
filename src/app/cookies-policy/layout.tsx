import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الكوكيز — نظام المحل",
  description:
    "سياسة الكوكيز الكاملة لمنصة نظام المحل — أنواع الكوكيز التي نستخدمها (أساسية، تحليلية)، الكوكيز التي لا نستخدمها (تسويقية)، كيفية التحكم في الكوكيز من متصفحك، وحذف الكوكيز.",
  keywords: [
    "سياسة الكوكيز",
    "Cookies",
    "ملفات تعريف الارتباط",
    "نظام المحل",
    "الخصوصية",
    "تتبع",
    "Local Storage",
    "تحكم في الكوكيز",
  ],
  openGraph: {
    title: "سياسة الكوكيز — نظام المحل",
    description:
      "شفافية كاملة حول الكوكيز — ما نستخدمه وما لا نستخدمه وكيف تتحكم فيه.",
    url: "/cookies-policy",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "سياسة الكوكيز — نظام المحل",
    description: "سياسة الكوكيز الكاملة لمنصة نظام المحل.",
  },
  alternates: {
    canonical: "/cookies-policy",
  },
};

export default function CookiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
