import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الاسترجاع — نظام المحل",
  description:
    "سياسة الاسترجاع الكاملة لمنصة نظام المحل — ضمان 14 يوم استرجاع كامل، استرجاع نسبي للاشتراكات السنوية، حالات لا يوجد فيها استرجاع، كيفية طلب الاسترجاع، المدة الزمنية، وحدود المسؤولية.",
  keywords: [
    "سياسة الاسترجاع",
    "استرجاع المال",
    "استرداد",
    "نظام المحل",
    "ضمان 14 يوم",
    "إلغاء الاشتراك",
    "Paymob",
    "استرجاع اشتراك",
  ],
  openGraph: {
    title: "سياسة الاسترجاع — نظام المحل",
    description:
      "ضمان 14 يوم استرجاع كامل + استرجاع نسبي للاشتراكات السنوية. أموالك آمنة معنا.",
    url: "/refund-policy",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "سياسة الاسترجاع — نظام المحل",
    description: "ضمان 14 يوم استرجاع كامل. أموالك آمنة معنا.",
  },
  alternates: {
    canonical: "/refund-policy",
  },
};

export default function RefundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
