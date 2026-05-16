/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_PUBLIC_API_BASE_URL is the only external configuration surface.
  // Set it in the root .env (or apps/web/.env.local) for local development.
  // The default (http://localhost:3001) is baked in at the call sites so the
  // app works out-of-the-box without a local env file.
  output: 'standalone',
};

export default nextConfig;
