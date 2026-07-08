import type { NextConfig } from 'next';

const lifecycle = process.env.npm_lifecycle_event;
const distDir = lifecycle === 'build' || lifecycle === 'start' ? '.next-build' : '.next';

const nextConfig: NextConfig = {
  distDir,
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async rewrites() {
    const apiUrl = process.env.API_PROXY_URL || 'http://127.0.0.1:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
