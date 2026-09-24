import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "الأسعار والباقات — نظام المحل",
  description:
    "4 باقات مرنة تناسب كل حجم محل — أساسية واحترافية لمحلات الموبايل والكمبيوتر، وأساسية واحترافية لمحلات الملابس والأحذية. تجربة مجانية 14 يوم بدون بطاقة ائتمان. أسعار بالعملة المحلية.",
  keywords: [
    "الأسعار",
    "الباقات",
    "اشتراك",
    "نظام المحل",
    "تجربة مجانية",
    "14 يوم",
    "باقة أساسية",
    "باقة احترافية",
    "محل موبايل",
    "محل ملابس",
    "POS",
  ],
  openGraph: {
    title: "الأسعار والباقات — نظام المحل",
    description:
      "4 باقات مرنة + تجربة مجانية 14 يوم. ابدأ مجاناً بدون بطاقة ائتمان.",
    url: "/pricing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "الأسعار والباقات — نظام المحل",
    description: "4 باقات مرنة + تجربة مجانية 14 يوم.",
  },
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
