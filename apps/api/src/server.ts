import { buildApp } from './app.ts';
import { systemClock } from './clock.ts';
import { env } from './env.ts';
import { createPrisma } from './prisma.ts';

const prisma = createPrisma(env.DATABASE_URL);

const app = await buildApp({
  prisma,
  clock: systemClock,
  config: {
    jwtSecret: env.JWT_SECRET,
    loginRateLimitMax: env.LOGIN_RATE_LIMIT_MAX,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    logger: { level: 'info' },
  },
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Encerrando');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
