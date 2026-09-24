import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "الشروط والأحكام — نظام المحل",
  description:
    "الشروط والأحكام الكاملة لاستخدام منصة نظام المحل — قبول الشروط، تعريف الخدمة، الاشتراكات، الدفع عبر Paymob، التزامات المستخدم، الملكية الفكرية، حدود المسؤولية، الإلغاء والاسترداد، القانون الحاكم.",
  keywords: [
    "الشروط والأحكام",
    "شروط الاستخدام",
    "نظام المحل",
    "سياسة الاستخدام",
    "اتفاقية المستخدم",
    "الاشتراكات",
    "الدفع",
    "Paymob",
  ],
  openGraph: {
    title: "الشروط والأحكام — نظام المحل",
    description:
      "الشروط والأحكام الكاملة لاستخدام منصة نظام المحل — 13 قسم قانوني شامل.",
    url: "/terms-and-conditions",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "الشروط والأحكام — نظام المحل",
    description: "الشروط والأحكام الكاملة لاستخدام منصة نظام المحل.",
  },
  alternates: {
    canonical: "/terms-and-conditions",
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
