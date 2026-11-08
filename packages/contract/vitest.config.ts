import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// docs/TESTING.md §2: set TZ before spawning workers, including on Windows.
process.env.TZ = 'Asia/Tokyo';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['tests/**/*.test.ts'],
    retry: 0,
    passWithNoTests: false,
    allowOnly: false,
  },
});
