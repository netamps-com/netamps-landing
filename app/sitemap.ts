import { MetadataRoute } from 'next';

// Single authoritative sitemap (public/sitemap.xml was removed — it shadowed
// this generator with a stale single-URL file). Only public, indexable routes
// are listed. Private routes (/login, /dashboard) and /api/* are excluded and
// disallowed in app/robots.ts.
const SITE = 'https://netamps.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE}/returns`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE}/status`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.6,
    },
    {
      url: `${SITE}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
