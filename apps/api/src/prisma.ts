import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

export type { PrismaClient };

/**
 * Prisma 7 requires a driver adapter. Connection pooling belongs to `pg`, so a
 * connection timeout is configured explicitly instead of v6 engine defaults.
 */
export function createPrisma(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
    max: 10,
  });
  return new PrismaClient({ adapter });
}
