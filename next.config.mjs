const nextConfig = {
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: false
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: 'https://returns.netamps.com/staff/login',
        permanent: true,
      },
      {
        source: '/returns',
        destination: 'https://returns.netamps.com/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
