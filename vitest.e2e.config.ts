import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * End-to-end suite. Boots a real `wrangler dev` (workerd) with local D1, KV,
 * R2, Queues and Durable Objects, then drives the HTTP API like a browser.
 *
 *   npm run test:e2e
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.e2e.test.ts'],
    // The client module resolves its base URL from import.meta.env at load.
    env: {
      VITE_API_BASE_URL: `http://127.0.0.1:${process.env.E2E_API_PORT ?? '8788'}/api`,
    },
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 180_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    reporters: ['default'],
  },
});
