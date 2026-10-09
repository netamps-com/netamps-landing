import { MetadataRoute } from 'next';

// Single authoritative robots.txt (public/robots.txt was removed — it
// shadowed this generator). Public marketing pages are crawlable; private
// app routes and APIs are disallowed for all bots, including AI crawlers
// that respect robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/login', '/dashboard', '/api/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/login', '/dashboard', '/api/'],
      },
      {
        userAgent: 'Googlebot-Smartphone',
        allow: '/',
        disallow: ['/login', '/dashboard', '/api/'],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/login', '/dashboard', '/api/'],
      },
    ],
    sitemap: 'https://netamps.com/sitemap.xml',
    host: 'https://netamps.com',
  };
}
