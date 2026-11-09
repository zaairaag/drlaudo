import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The API and Vite share .env, which legitimately sets NODE_ENV=development.
// Set this before Vite resolves its environment so DEV, JSX, React, conditional
// exports and optimization all agree on production, even in a development shell.
process.env.NODE_ENV = 'production';

const webDirectory = new URL('../apps/web/', import.meta.url);
const require = createRequire(new URL('package.json', webDirectory));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);

await build({
  root: fileURLToPath(webDirectory),
  configFile: fileURLToPath(new URL('vite.config.ts', webDirectory)),
  mode: 'production',
});
