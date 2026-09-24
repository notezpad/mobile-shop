import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تواصل معنا — نظام المحل",
  description:
    "تواصل مع فريق نظام المحل عبر واتساب أو البريد الإلكتروني. دعم فني بالعربي 24/7 لكل عملائنا في الدول العربية. رد سريع خلال دقائق في ساعات العمل.",
  keywords: [
    "تواصل معنا",
    "دعم فني",
    "واتساب",
    "نظام المحل",
    "خدمة العملاء",
    "الدعم العربي",
    "تواصل",
  ],
  openGraph: {
    title: "تواصل معنا — نظام المحل",
    description:
      "تواصل مع فريق نظام المحل عبر واتساب أو البريد الإلكتروني. دعم فني بالعربي 24/7.",
    url: "/contact-us",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "تواصل معنا — نظام المحل",
    description: "تواصل مع فريق نظام المحل عبر واتساب أو البريد الإلكتروني.",
  },
  alternates: {
    canonical: "/contact-us",
  },
};

export default function ContactUsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
