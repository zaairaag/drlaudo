import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/mocks/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    env: { TZ: 'Asia/Tokyo' },
    // Full concurrent run timed out in auth; the same case passed in isolation.
    // Bound jsdom CPU/memory pressure while retaining isolation and existing timeouts.
    maxWorkers: 2,
    clearMocks: true,
    restoreMocks: true,
  },
});
