import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Keep pure guard tests independent of the parent shell's development setting.
process.env.NODE_ENV = 'test';

// Pure guards must run without the integration suite's destructive global setup.
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
  },
});
