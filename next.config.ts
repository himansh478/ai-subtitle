import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    // canvaskit-wasm's loader references Node modules it never uses in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },
};

export default nextConfig;
