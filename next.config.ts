import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Railway runs one Node process; server.ts owns the listener and Next is
  // used as a request handler, so there is no standalone/serverless target.
  poweredByHeader: false,
};

export default nextConfig;
