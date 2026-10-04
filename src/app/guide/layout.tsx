import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

// Title / Description / OG / canonical مأخوذين من src/lib/seo.ts
export const metadata: Metadata = buildPageMetadata('/guide')

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children
}
