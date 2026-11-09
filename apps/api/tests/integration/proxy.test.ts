import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { fixedClock } from '../../src/clock.ts';
import { QA, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

describe('limiter · cadeia de proxies limitada por hops', () => {
  it.each([
    { hops: 0, first: '198.51.100.1', second: '203.0.113.2', limited: true },
    { hops: 1, first: '198.51.100.1, 203.0.113.7', second: '198.51.100.2, 203.0.113.7', limited: true },
    { hops: 1, first: '198.51.100.1, 203.0.113.7', second: '198.51.100.1, 203.0.113.8', limited: false },
    { hops: 2, first: '192.0.2.1, 198.51.100.7, 203.0.113.7', second: '192.0.2.2, 198.51.100.7, 203.0.113.8', limited: true },
    { hops: 2, first: '192.0.2.1, 198.51.100.7, 203.0.113.7', second: '192.0.2.1, 198.51.100.8, 203.0.113.7', limited: false },
  ])('usa request.ip com $hops hops, limited=$limited', async ({ hops, first, second, limited }) => {
    const app = await buildApp({
      prisma: testPrisma(),
      clock: fixedClock(QA.now),
      config: {
        jwtSecret: 'qa-secret-with-at-least-32-characters!!',
        loginRateLimitMax: 1,
        trustProxyHops: hops,
      },
    });
    try {
      const attempt = (forwardedFor: string) => app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: '10.0.0.10',
        headers: { 'x-forwarded-for': forwardedFor },
        payload: { email: 'equipe@qa.test', password: 'senha-incorreta' },
      });
      expect((await attempt(first)).statusCode).toBe(401);
      const response = await attempt(second);
      expect(response.statusCode).toBe(limited ? 429 : 401);
      if (limited) {
        expect(response.json().error.code).toBe('RATE_LIMITED');
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      }
    } finally {
      await app.close();
    }
  });
});
