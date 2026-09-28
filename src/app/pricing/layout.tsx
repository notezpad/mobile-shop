import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

// Title / Description / OG / canonical مأخوذين حرفيًا من src/lib/seo.ts
export const metadata: Metadata = buildPageMetadata("/pricing");

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
