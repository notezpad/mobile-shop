import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

// Title / Description / OG / canonical مأخوذين حرفيًا من src/lib/seo.ts
export const metadata: Metadata = buildPageMetadata("/refund-policy");

export default function RefundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
