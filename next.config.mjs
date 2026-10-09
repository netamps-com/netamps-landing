import { createOpenNextConfig } from '@opennextjs/cloudflare';

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: false
  },
  // Allow dynamic routes for dashboard, login, returns, status
  // These will be handled by OpenNext on Cloudflare Workers
};

export default createOpenNextConfig(config);