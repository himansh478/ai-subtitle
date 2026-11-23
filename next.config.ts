import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    // canvaskit-wasm's loader references Node modules it never uses in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },

  // Mobile performance: compress all API responses, including the streaming NDJSON
  compress: true,

  // Allow HMR from both localhost and 127.0.0.1 without cross-origin warnings
  allowedDevOrigins: ['127.0.0.1:3100', 'localhost:3100'],

  // Allow larger audio uploads from phone cameras (default is 1MB for body)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
