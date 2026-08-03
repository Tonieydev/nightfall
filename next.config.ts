import type { NextConfig } from 'next';

interface ResolveOnly {
  resolve: { extensionAlias?: Record<string, string[]> };
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Railway runs one Node process; server.ts owns the listener and Next is
  // used as a request handler, so there is no standalone/serverless target.
  poweredByHeader: false,

  // src/ is written as ESM: relative imports carry the .js extension they will
  // have at runtime. Node and tsx resolve that to the .ts source; webpack does
  // not, so it is taught the same mapping here rather than stripping extensions
  // from game-core, which is complete and must not be edited.
  webpack: (config) => {
    (config as ResolveOnly).resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

export default nextConfig;
