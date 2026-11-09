import { defineConfig } from 'vitest/config';

// The clinic timezone is applied before workers start, so host TZ never leaks
// into integration expectations.
process.env.TZ = 'Asia/Tokyo';
// QA is explicitly disposable even when the parent shell is in development.
// Apply before globalSetup, which evaluates the fail-closed database guard.
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
    globalSetup: ['tests/global-setup.ts'],
    // One worker: integration files share the QA database and truncate it.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
