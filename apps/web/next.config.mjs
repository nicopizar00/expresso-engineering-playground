/** @type {import('next').NextConfig} */

const BFF_INTERNAL_URL = (
  process.env.BFF_INTERNAL_URL || 'http://localhost:3001'
).replace(/\/$/, '');

const VISUALIZER_INTERNAL_URL = (
  process.env.VISUALIZER_INTERNAL_URL || 'http://localhost:3002'
).replace(/\/$/, '');

const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/bff/:path*',
        destination: `${BFF_INTERNAL_URL}/:path*`,
      },
      {
        source: '/viz',
        destination: `${VISUALIZER_INTERNAL_URL}/`,
      },
      {
        source: '/viz/:path*',
        destination: `${VISUALIZER_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
