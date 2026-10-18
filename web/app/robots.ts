import type { MetadataRoute } from 'next';
import { SITE } from './guides/guides';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard'] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
