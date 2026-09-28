import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

// Title / Description / OG / canonical مأخوذين حرفيًا من src/lib/seo.ts
export const metadata: Metadata = buildPageMetadata("/terms-and-conditions");

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
