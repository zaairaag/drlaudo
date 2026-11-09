import { defineConfig } from '@playwright/test';
import { WEB_URL } from './support/qa.ts';

process.env.TZ = 'Asia/Tokyo';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    browserName: 'chromium',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { screenshot: 'off' } },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testMatch: /(?:auth|staff\.scheduling|staff\.reports|staff\.patients|patient\.access|a11y)\.spec\.ts/,
    },
    {
      name: 'mobile-paciente',
      dependencies: ['setup'],
      testMatch: /patient\.access\.spec\.ts/,
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'tokyo',
      dependencies: ['setup'],
      testMatch: /timezone\.spec\.ts/,
      use: { timezoneId: 'Asia/Tokyo' },
    },
  ],
  webServer: {
    command: 'npm run serve',
    url: `${WEB_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { NODE_ENV: 'test', VITE_API_MOCKING: 'false' },
  },
});
