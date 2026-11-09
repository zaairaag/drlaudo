import { ExamTypeListResponseSchema, type ExamType } from '@drlaudo/contract';
import type { PrismaClient } from '../../prisma.ts';

export interface ExamTypesService {
  list(): Promise<ExamType[]>;
}

export function createExamTypesService({ prisma }: { prisma: PrismaClient }): ExamTypesService {
  return {
    async list(): Promise<ExamType[]> {
      const rows: unknown = await prisma.$queryRaw`
        SELECT id, code, name FROM "ExamType"
        ORDER BY name COLLATE "C" ASC, id ASC
      `;
      return ExamTypeListResponseSchema.parse(rows);
    },
  };
}
