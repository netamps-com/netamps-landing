const nextConfig = {
  output: 'export',
  poweredByHeader: false,
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: false
  }
};

export default nextConfig;
