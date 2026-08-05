import type { NextConfig } from 'next';

interface ResolveOnly {
  resolve: { extensionAlias?: Record<string, string[]> };
}

/**
 * Defence in depth. Nothing here is load-bearing on its own — the real controls
 * are server-side projection and per-recipient emit — but a game link gets
 * pasted into group chats, and a framed Nightfall is a clickjacked microphone.
 *
 * connect-src has to allow LiveKit's signalling socket and media over wss, and
 * Upstash is reached server-side only, so it is deliberately absent.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), microphone=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next injects inline bootstrap and hydration data.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // LiveKit signalling and media, and our own Socket.io transport.
      "connect-src 'self' wss: https:",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  headers: async () => [{ source: '/:path*', headers: SECURITY_HEADERS }],
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
