import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    // canvaskit-wasm's loader references Node modules it never uses in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },

  // Mobile performance: compress all API responses, including the streaming NDJSON
  compress: true,

  // Allow larger audio uploads from phone cameras (default is 1MB for body)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
