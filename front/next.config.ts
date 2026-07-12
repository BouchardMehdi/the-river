import type { NextConfig } from 'next';

const lifecycle = process.env.npm_lifecycle_event;
const distDir = lifecycle === 'build' || lifecycle === 'start' ? '.next-build' : '.next';
const defaultApiPort = process.env.API_INTERNAL_PORT || process.env.BACK_PORT || (lifecycle === 'dev' ? '3000' : '4000');
const isStaticExport = process.env.STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  distDir,
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  ...(isStaticExport
    ? {
        output: 'export',
      }
    : {
        async rewrites() {
          const apiUrl = process.env.API_PROXY_URL || `http://127.0.0.1:${defaultApiPort}`;
          return [
            {
              source: '/api/:path*',
              destination: `${apiUrl}/api/:path*`,
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
      }),
};

export default nextConfig;
