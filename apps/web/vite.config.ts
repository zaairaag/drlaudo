import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import svgr from 'vite-plugin-svgr';

// Serve the installed MSW asset in development, never through public/ or a build copy.
function developmentWorker(): Plugin {
  const require = createRequire(import.meta.url);
  return {
    name: 'drlaudo-development-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET' || request.url?.split('?')[0] !== '/mockServiceWorker.js') {
          next();
          return;
        }
        try {
          const worker = await readFile(require.resolve('msw/mockServiceWorker.js'));
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Service-Worker-Allowed', '/');
          response.end(worker);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react(), tailwindcss(), svgr(), developmentWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3333',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { emptyOutDir: true, sourcemap: false },
});
