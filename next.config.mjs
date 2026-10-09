const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Static export: `npx next build` writes to out/, which wrangler.toml
  // (pages_build_output_dir) and the CI workflow (pages deploy out) deploy.
  // Do NOT remove this — without it the build writes to .next/ and the
  // Pages deploy fails with 'Output directory "out" not found'.
  // Dynamic APIs live in functions/ (Pages Functions), never as Next routes.
  output: 'export',
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: false
  },
};

export default config;