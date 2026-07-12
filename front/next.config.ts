import type { NextConfig } from 'next';

const lifecycle = process.env.npm_lifecycle_event;
const distDir = lifecycle === 'build' || lifecycle === 'start' ? '.next-build' : '.next';
const defaultApiPort = process.env.API_INTERNAL_PORT || process.env.BACK_PORT || (lifecycle === 'dev' ? '3000' : '4000');

const nextConfig: NextConfig = {
  distDir,
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async rewrites() {
    const apiUrl = process.env.API_PROXY_URL || `http://127.0.0.1:${defaultApiPort}`;
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${apiUrl}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
