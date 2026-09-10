import type { NextConfig } from 'next';

// Set in deployment to the origin of the apps/api deployment. Unset locally,
// where the browser talks to http://localhost:4000 directly.
const apiOrigin = process.env.API_ORIGIN;

const config: NextConfig = {
  // packages/shared ships TypeScript source rather than a build step.
  transpilePackages: ['@dtbi/shared'],
  reactStrictMode: true,

  // Proxy the API under the web app's own origin in deployment.
  //
  // This is not a convenience. If the browser called the API on its own
  // hostname, the session cookie would be cross-site, which forces
  // SameSite=None — against REQ-N24 and undermining ADR-0003's revocable
  // session. Proxying keeps the cookie first-party and SameSite=Lax.
  //
  // With this in place NEXT_PUBLIC_API_URL is set to "" in deployment, so
  // lib/api.ts builds relative URLs. Returning [] when API_ORIGIN is unset
  // leaves local development exactly as it was.
  async rewrites() {
    if (!apiOrigin) return [];
    return [
      { source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` },
    ];
  },
};

export default config;
