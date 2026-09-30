import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://netamps.com/sitemap.xml',
    host: 'https://netamps.com',
  };
}
