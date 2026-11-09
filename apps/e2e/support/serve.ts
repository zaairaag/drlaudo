import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { preview, type PreviewServer } from 'vite';
import { buildApp } from '../../api/src/app.ts';
import { systemClock } from '../../api/src/clock.ts';
import { loadEnv, testDatabaseUrl } from '../../api/src/env.ts';
import { createPrisma } from '../../api/src/prisma.ts';
import { migrateTestDatabase } from '../../api/tests/helpers/migrate.ts';
import { API_URL, QA } from './qa.ts';

// The shared guard checks the original DATABASE_URL as well as the QA target.
// Never change either URL before validation or accept a demo/production database.
const loaded = loadEnv({ ...process.env, NODE_ENV: 'test' });
const prisma = createPrisma(testDatabaseUrl(loaded));
const app = await buildApp({
  prisma,
  clock: systemClock,
  config: {
    jwtSecret: randomBytes(48).toString('base64url'),
    loginRateLimitMax: 1_000,
    trustProxyHops: 0,
    logger: false,
  },
});
let web: PreviewServer | undefined;

async function close(): Promise<void> {
  if (web) {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    web.httpServer.close((error) => error ? reject(error) : resolve());
    await promise;
  }
  await app.close();
  await prisma.$disconnect();
}

try {
  // Bind before cleanup: another E2E runner must fail without touching its data.
  await app.listen({ host: '127.0.0.1', port: 3335 });
  await migrateTestDatabase(loaded);
  const passwordHash = await bcrypt.hash(QA.password, 10);
  await prisma.$transaction([
    prisma.user.createMany({ data: [
      { ...QA.staff, passwordHash, role: 'STAFF' },
      { ...QA.ana, passwordHash, role: 'PATIENT' },
      { ...QA.bruno, passwordHash, role: 'PATIENT' },
    ] }),
    prisma.examType.createMany({ data: [QA.xray, QA.ultrasound, QA.mri] }),
  ]);

  process.env.VITE_API_MOCKING = 'false';
  const proxy = {
    '/api': {
      target: API_URL,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  };
  web = await preview({
    root: fileURLToPath(new URL('../../web/', import.meta.url)),
    configFile: fileURLToPath(new URL('../../web/vite.config.ts', import.meta.url)),
    mode: 'production',
    server: { proxy },
    preview: { host: '127.0.0.1', port: 4183, strictPort: true, proxy },
  });
  console.log('E2E QA: API real 3335 e preview de produção 4183 prontos.');
} catch (error) {
  await close();
  throw error;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void close().then(() => process.exit(0), () => process.exit(1));
  });
}
