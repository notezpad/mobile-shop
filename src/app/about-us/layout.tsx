import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "من نحن — قصة نظام المحل ورسالتنا",
  description:
    "نظام المحل منصة سحابية متكاملة لإدارة محلات الموبايل والكمبيوتر، والملابس والأحذية في الدول العربية. نقطة بيع، مخزون، صيانة، ومعاملات مالية في مكان واحد. صُنع بأيد عربية للسوق العربي.",
  keywords: [
    "من نحن",
    "نظام المحل",
    "منصة إدارة المحلات",
    "SaaS عربي",
    "إدارة المحلات",
    "نقطة بيع",
    "السوق العربي",
  ],
  openGraph: {
    title: "من نحن — قصة نظام المحل ورسالتنا",
    description:
      "منصة سحابية متكاملة لإدارة محلات الموبايل والكمبيوتر، والملابس والأحذية. صُنع بأيد عربية للسوق العربي.",
    url: "/about-us",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "من نحن — قصة نظام المحل ورسالتنا",
    description:
      "منصة سحابية متكاملة لإدارة محلات الموبايل والكمبيوتر، والملابس والأحذية. صُنع بأيد عربية للسوق العربي.",
  },
  alternates: {
    canonical: "/about-us",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function AboutUsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
