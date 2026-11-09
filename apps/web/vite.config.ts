import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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

// Inspect emitted module identities, not source strings or minifier-dependent text.
function productionBoundary(): Plugin {
  let outputDirectory: string;
  const forbiddenModule = /(?:^|\/)(?:src\/mocks\/|node_modules\/(?:msw|@mswjs\/[^/]+)\/|src\/features\/status\/(?:DesignSystemPage|MockControlsContext)\.[jt]sx?$)/u;
  const forbiddenAsset = /(?:^|\/)mockServiceWorker(?:[.-]|$)/iu;

  async function rejectCopiedWorkers(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (forbiddenAsset.test(entry.name)) {
        throw new Error(`Development worker in production output: ${path}`);
      }
      if (entry.isDirectory()) await rejectCopiedWorkers(path);
    }
  }

  return {
    name: 'drlaudo-production-boundary',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      for (const entry of Object.values(bundle)) {
        if (forbiddenAsset.test(entry.fileName)) {
          this.error(`Development worker in production output: ${entry.fileName}`);
        }
        if (entry.type !== 'chunk') continue;
        for (const id of Object.keys(entry.modules)) {
          const normalized = id.replaceAll('\\', '/').split('?')[0] ?? id;
          if (forbiddenModule.test(normalized)) {
            this.error(`Development module in production output: ${id}`);
          }
        }
      }
    },
    async writeBundle() {
      // Vite copies public/ assets outside the module graph.
      await rejectCopiedWorkers(outputDirectory);
    },
  };
}

export default defineConfig({
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react(), tailwindcss(), svgr(), developmentWorker(), productionBoundary()],
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
  build: {
    emptyOutDir: true,
    sourcemap: false,
    // Inlined data: fonts would be blocked by `font-src 'self'`; every face stays a file.
    assetsInlineLimit: (filePath) => (/\.woff2?$/iu.test(filePath) ? false : undefined),
  },
});
