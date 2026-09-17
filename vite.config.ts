import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

/**
 * Frontend build + dev server.
 *
 * In development the Vite server proxies `/api` to the local Cloudflare Worker
 * (wrangler dev on :8787) so the browser only ever talks to one origin — which
 * is exactly how the app behaves in production when `VITE_API_BASE_URL` points
 * at the deployed Worker.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787';

  return {
    server: {
      host: '0.0.0.0',
      port: 8080,
      strictPort: false,
      // The preview runs behind a proxied host, so any Host header is accepted.
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 8080,
      allowedHosts: true,
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, './shared'),
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['motion'],
            query: ['@tanstack/react-query'],
          },
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    },
  };
});
