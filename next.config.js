/** @type {import('next').NextConfig} */
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; worker-src 'self' blob:;",
          },
        ],
      },
    ];
  },
  webpack: (config, {}) => {
    config.resolve.extensions.push('.ts', '.tsx');
    config.resolve.fallback = { fs: false };

    config.plugins.push(
      new NodePolyfillPlugin(),
      new CopyPlugin({
        patterns: [
          {
            from: './node_modules/onnxruntime-web/dist/*.wasm',
            to: 'static/chunks/pages/[name][ext]',
          },
          {
            from: './node_modules/onnxruntime-web/dist/*.mjs',
            to: 'static/chunks/pages/[name][ext]',
          },
          {
            from: './models',
            to: 'static/chunks/pages',
          },
        ],
      })
    );

    return config;
  },
};

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.endsWith('.onnx'),
      handler: 'CacheFirst',
      options: { cacheName: 'onnx-models', expiration: { maxEntries: 20 } },
    },
    {
      urlPattern: ({ url }) => /ort-wasm.*\.(wasm|mjs)$/.test(url.pathname),
      handler: 'CacheFirst',
      options: { cacheName: 'onnx-runtime', expiration: { maxEntries: 10 } },
    },
    {
      urlPattern: ({ url }) => url.pathname.endsWith('.mp4'),
      handler: 'CacheFirst',
      options: { cacheName: 'videos', expiration: { maxEntries: 5 } },
    },
    {
      urlPattern: ({ url }) => /\.(png|jpg|jpeg|gif|svg)$/.test(url.pathname),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'images', expiration: { maxEntries: 50 } },
    },
  ],
});

module.exports = withBundleAnalyzer(withPWA(nextConfig));

// module.exports = nextConfig
