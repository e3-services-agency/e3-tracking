import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type ProxyOptions} from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Cold-boot 500 burst (fix round, T-1-EXIT): `npm run dev` starts the Vite dev server and the API
 * (`tsx watch`, which has to compile and run migrations first) concurrently, so on a fresh
 * `npm run dev` there's a real window where Vite is already serving `index.html` but the API isn't
 * listening on 3001 yet. Vite's http-proxy-middleware, by default, turns that `ECONNREFUSED` into a
 * bare 500 with no body — indistinguishable in the Network tab from an actual server-side crash.
 * This `configure` hook answers with a clear, retryable 503 JSON error instead, so the very first
 * requests a fresh page load fires (projects list, clients list) fail loudly and correctly rather
 * than looking like an application bug.
 */
function onProxyError(err: Error, _req: IncomingMessage, res: ServerResponse): void {
  if (res.headersSent) return;
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'The API server is not reachable yet (still starting up?).',
      code: 'API_UNAVAILABLE',
      detail: err.message,
    })
  );
}

const proxyCommon: Omit<ProxyOptions, 'target'> = {
  configure: (proxy) => {
    proxy.on('error', onProxyError);
  },
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/tracking-plan/', // Required for sub-path deployment; production build must use this so API_BASE and assets use /tracking-plan
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      // T-2-01: board/report writes by other agents and local SQLite/file writes under `data/`
      // must never trigger an HMR reload while an agent is mid-QA on this dev server; `docs/`
      // (generated documentation) is the same kind of out-of-band write.
      watch: {
        ignored: ['**/.claude/**', '**/data/**', '**/docs/**'],
      },
      // Local dev only (D-23): the API runs separately on 3001 via `npm run dev:api`;
      // VITE_API_BASE_URL is unnecessary locally because of this proxy.
      proxy: {
        '/api': { target: 'http://localhost:3001', ...proxyCommon },
        '/tracking-plan/api': {
          target: 'http://localhost:3001',
          rewrite: (requestPath: string) => requestPath.replace(/^\/tracking-plan/, ''),
          ...proxyCommon,
        },
      },
    },
  };
});