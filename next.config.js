const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint:  { ignoreDuringBuilds: false },
  output:  'standalone',
  // ✅ حذف outputFileTracingRoot — مش محتاجه في standalone repo

  images: {
    formats:         ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: 'https', hostname: '**.vercel.app'  },
      { protocol: 'https', hostname: '**.railway.app' },
      { protocol: 'https', hostname: 'api.minepi.com' },
    ],
  },

  compress: true,

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff'                         },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control',  value: 'on'                              },
          { key: 'Permissions-Policy',      value: 'camera=(), microphone=()'        },
          {
            key:   'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' sdk.minepi.com *.minepi.com",
              "connect-src 'self' https: wss:",
              "img-src 'self' data: blob: *.railway.app *.vercel.app",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "frame-src 'self' sdk.minepi.com *.minepi.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'self' *.minepi.com minepi.com",
            ].join('; '),
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

// --- TEC-TESTNET-VERIFY (Pi Testnet domain verification, per-host validation key) ---
// Mainnet custom domain (<app>.tecosystem.app) keeps public/validation-key.txt (Mainnet
// key). The paired Testnet app is served on the *.vercel.app URL (same Vercel deployment),
// so that host is rewritten to a Testnet-only key file. Pi does an EXACT-content match,
// so each host must serve exactly its own single key.
nextConfig.rewrites = async () => ({
  beforeFiles: [
    {
      source: '/validation-key.txt',
      has: [{ type: 'host', value: '.*\\.vercel\\.app(:\\d+)?' }],
      destination: '/validation-key-testnet.txt',
    },
  ],
  afterFiles: [],
  fallback: [],
});

const __tecOrigHeaders =
  typeof nextConfig.headers === 'function' ? nextConfig.headers.bind(nextConfig) : null;
nextConfig.headers = async () => {
  const base = __tecOrigHeaders ? await __tecOrigHeaders() : [];
  return [
    ...base,
    { source: '/validation-key.txt', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
  ];
};
// --- end TEC-TESTNET-VERIFY ---

module.exports = nextConfig;
