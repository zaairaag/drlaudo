import { randomUUID } from 'node:crypto';
import {
  UtcDateTimeSchema,
  defaultAgendaRange,
  isPast,
  isValidSlot,
  localDayRange,
  type AppointmentListQuery,
  type CreateAppointmentRequest,
  type StaffAppointment,
} from '@drlaudo/contract';
import type { Clock } from '../../clock.ts';
import { DomainError, notFound } from '../../errors.ts';
import type { PrismaClient } from '../../prisma.ts';
import { staffAppointmentSelect, toStaffAppointment } from '../shared/dto.ts';
import { isSlotConflict } from '../../lib/prisma-errors.ts';

export interface AppointmentsDeps {
  prisma: PrismaClient;
  clock: Clock;
}

/** Only this index arbitrates a slot; a prior SELECT would race. */

export function createAppointmentsService({ prisma, clock }: AppointmentsDeps) {
  return {
    async list(query: AppointmentListQuery): Promise<StaffAppointment[]> {
      const now = clock.now().toISOString();
      const range = query.date
        ? localDayRange(query.date)
        : defaultAgendaRange(now);
      const rows = await prisma.appointment.findMany({
        where: {
          startsAt: { gte: range.from, lt: range.to },
          ...(query.patientId ? { patientId: query.patientId } : {}),
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: staffAppointmentSelect,
      });
      return rows.map(toStaffAppointment);
    },

    async getById(id: string): Promise<StaffAppointment> {
      const row = await prisma.appointment.findUnique({
        where: { id },
        select: staffAppointmentSelect,
      });
      if (!row) throw notFound();
      return toStaffAppointment(row);
    },

    async create(input: CreateAppointmentRequest): Promise<StaffAppointment> {
      // Missing patient and missing exam share the same opaque 404.
      const [patient, examType] = await Promise.all([
        prisma.user.findFirst({ where: { id: input.patientId, role: 'PATIENT' }, select: { id: true } }),
        prisma.examType.findUnique({ where: { id: input.examTypeId }, select: { id: true } }),
      ]);
      if (!patient || !examType) throw notFound();

      if (!isValidSlot(input.startsAt)) throw new DomainError('INVALID_SLOT');
      const capturedNow = clock.now();
      const now = UtcDateTimeSchema.parse(capturedNow.toISOString());
      if (isPast(input.startsAt, now)) throw new DomainError('PAST_DATE');

      try {
        return await prisma.$transaction(async (tx) => {
          const row = await tx.appointment.create({
            data: {
              id: randomUUID(),
              patientId: input.patientId,
              examTypeId: input.examTypeId,
              startsAt: new Date(input.startsAt),
              status: 'SCHEDULED',
              createdAt: capturedNow,
            },
            select: staffAppointmentSelect,
          });
          return toStaffAppointment(row);
        });
      } catch (error) {
        if (isSlotConflict(error)) throw new DomainError('SLOT_TAKEN');
        throw error;
      }
    },

    async cancel(id: string): Promise<StaffAppointment> {
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Appointment" WHERE id = ${id}::uuid FOR UPDATE
        `;
        if (locked.length === 0) throw notFound();

        const row = await tx.appointment.findUnique({
          where: { id },
          select: staffAppointmentSelect,
        });
        if (!row) throw notFound();
        if (row.status !== 'SCHEDULED' || row.report?.status === 'PUBLISHED') {
          throw new DomainError('CANNOT_CANCEL');
        }

        const now = clock.now();
        const updated = await tx.appointment.update({
          where: { id },
          data: { status: 'CANCELED', canceledAt: now },
          select: staffAppointmentSelect,
        });
        return toStaffAppointment(updated);
      });
    },
  };
}

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
