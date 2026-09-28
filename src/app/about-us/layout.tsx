import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

// Title / Description / OG / canonical مأخوذين حرفيًا من src/lib/seo.ts
export const metadata: Metadata = buildPageMetadata("/about-us");

export default function AboutUsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
