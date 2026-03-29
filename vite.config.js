import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiTarget = process.env.VITE_PROXY_API || 'http://127.0.0.1:3001';

/** Avoid flooding the terminal when the API is down; Socket.io retries often. */
function quietProxyConnectionErrors(proxy) {
  let lastLog = 0;
  proxy.on('error', (err) => {
    const code = err?.code || err?.cause?.code;
    if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
      const now = Date.now();
      if (now - lastLog > 30_000) {
        lastLog = now;
        console.warn(
          `[vite proxy] API unreachable (${apiTarget}) — start the API (e.g. npm run dev:api or npm run dev:full). Suppressing similar errors for 30s.`
        );
      }
      return;
    }
    console.error('[vite proxy]', err);
  });
}

const apiProxy = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
    configure: (proxy) => quietProxyConnectionErrors(proxy),
  },
  // Socket.io connects directly to the API in dev (see realtimeClient.js) to avoid Vite ws proxy spam.
};

export default defineConfig({
  logLevel: 'error',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
