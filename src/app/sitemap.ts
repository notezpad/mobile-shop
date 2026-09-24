import { MetadataRoute } from 'next'

/**
 * 🛡️ 2026-09-14: Dynamic sitemap.xml for SEO.
 *
 * Next.js 16 supports `sitemap.ts` files that automatically generate
 * `/sitemap.xml` at build time. This is the recommended approach over
 * a static XML file because:
 *   - Routes are typed and checked at build time
 *   - Last modified dates can be dynamic
 *   - Easier to maintain
 *
 * Reference: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

const SITE_URL = 'https://shop-system.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Public routes — these should be indexed by search engines
  const publicRoutes = [
    {
      url: '/',
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: '/about-us',
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    },
    {
      url: '/contact-us',
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: '/pricing',
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: '/terms-and-conditions',
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    },
    {
      url: '/privacy-policy',
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    },
    {
      url: '/cookies-policy',
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    },
    {
      url: '/refund-policy',
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    },
  ]

  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route.url}`,
    lastModified: route.lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
