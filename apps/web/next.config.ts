import type { NextConfig } from 'next';

const config: NextConfig = {
  // packages/shared ships TypeScript source rather than a build step.
  transpilePackages: ['@dtbi/shared'],
  reactStrictMode: true,
};

export default config;
