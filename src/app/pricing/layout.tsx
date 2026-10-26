import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { buildSoftwareApplicationJsonLd } from "@/lib/plans-schema";

// Title / Description / OG / canonical مأخوذين حرفيًا من src/lib/seo.ts
export const metadata: Metadata = buildPageMetadata("/pricing");

// صفحة الأسعار client-rendered (الباقات بتتحمّل من /api/plans/public بعد الـ hydration)،
// فبنحط الباقات والأسعار في الـ HTML الأولي كـ JSON-LD عشان محركات الـ AI تقراها بدون JavaScript.
export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildSoftwareApplicationJsonLd()) }}
      />
      {children}
    </>
  );
}
