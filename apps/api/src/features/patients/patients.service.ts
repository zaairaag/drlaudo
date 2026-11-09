import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  PatientSchema,
  PatientListResponseSchema,
  type CreatePatientRequest,
  type UpdatePatientRequest,
  type Patient,
} from '@drlaudo/contract';
import type { Clock } from '../../clock.ts';
import { DomainError, notFound } from '../../errors.ts';
import { isEmailConflict } from '../../lib/prisma-errors.ts';
import type { PrismaClient } from '../../prisma.ts';

const patientSelect = { id: true, name: true, email: true, active: true } as const;

export interface PatientsService {
  list(): Promise<Patient[]>;
  create(input: CreatePatientRequest): Promise<Patient>;
  update(id: string, input: UpdatePatientRequest): Promise<Patient>;
}

export function createPatientsService(
  { prisma, clock }: { prisma: PrismaClient; clock: Clock },
): PatientsService {
  return {
    async list(): Promise<Patient[]> {
      // C collation on UTF-8 compares Unicode code points, unlike the database
      // locale or JavaScript's default UTF-16 sort. Every column is explicit.
      const rows: unknown = await prisma.$queryRaw`
        SELECT id, name, email, active FROM "User"
        WHERE role = 'PATIENT'
        ORDER BY name COLLATE "C" ASC, id ASC
      `;
      return PatientListResponseSchema.parse(rows);
    },

    async create(input: CreatePatientRequest): Promise<Patient> {
      const passwordHash = await bcrypt.hash(input.password, 10);
      try {
        return await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              id: randomUUID(),
              name: input.name,
              email: input.email,
              passwordHash,
              role: 'PATIENT',
              createdAt: clock.now(),
            },
            select: patientSelect,
          });
          return PatientSchema.parse(created);
        });
      } catch (error) {
        if (isEmailConflict(error)) throw new DomainError('EMAIL_TAKEN');
        throw error;
      }
    },

    async update(id: string, input: UpdatePatientRequest): Promise<Patient> {
      try {
        return await prisma.$transaction(async (tx) => {
          const updated = await tx.user.update({
            where: { id, role: 'PATIENT' },
            data: {
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.email !== undefined ? { email: input.email } : {}),
              ...(input.active !== undefined ? { active: input.active } : {}),
            },
            select: patientSelect,
          });
          return PatientSchema.parse(updated);
        });
      } catch (error) {
        if (isEmailConflict(error)) throw new DomainError('EMAIL_TAKEN');
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
          throw notFound();
        }
        throw error;
      }
    },
  };
}
