/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // react-bootstrap ships CJS — transpile it so RSC builds cleanly.
  },
  transpilePackages: ['react-bootstrap'],
};

export default nextConfig;
