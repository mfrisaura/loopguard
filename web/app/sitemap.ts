import type { MetadataRoute } from 'next';
import { GUIDES, SITE } from './guides/guides';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/guides`, changeFrequency: 'weekly', priority: 0.7 },
    ...GUIDES.map(g => ({ url: `${SITE}/guides/${g.slug}`, lastModified: g.updated, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${SITE}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
