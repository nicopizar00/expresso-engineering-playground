/** @type {import('next').NextConfig} */

// The web app is the single browser-facing entry point. The browser only ever
// talks to this app (same origin); the Next.js server proxies to the other
// container services over the internal Docker network. This keeps the BFF and
// visualizer reachable without exposing them to the browser and avoids CORS.
//
// Rewrite destinations are resolved when the config loads (build time for the
// standalone production server, server start for `next dev`). The defaults
// target host ports so `pnpm pg:dev:host` works without Docker; compose sets
// the in-container service names (see infra/docker/compose.yaml).
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
      // Browser -> /api/bff/* (same origin) -> internal BFF container.
      {
        source: '/api/bff/:path*',
        destination: `${BFF_INTERNAL_URL}/:path*`,
      },
      // Browser -> /viz (and assets) -> internal visualizer container. The
      // visualizer uses relative asset paths, so serving it under /viz/ keeps
      // scene.js/style.css/config.js resolving through this proxy.
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
