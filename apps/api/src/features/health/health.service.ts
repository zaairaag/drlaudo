import { HealthResponseSchema, type HealthResponse } from '@drlaudo/contract';
import { DomainError } from '../../errors.ts';
import type { PrismaClient } from '../../prisma.ts';

export interface HealthService {
  get(): Promise<HealthResponse>;
}

export function createHealthService({ prisma }: { prisma: PrismaClient }): HealthService {
  return {
    async get(): Promise<HealthResponse> {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        throw new DomainError('INTERNAL_ERROR', undefined, 503);
      }
      return HealthResponseSchema.parse({ status: 'ok', db: 'ok' });
    },
  };
}
