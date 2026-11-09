import { randomUUID } from 'node:crypto';
import type {
  CreateReportRequest,
  StaffReport,
  UpdateReportRequest,
} from '@drlaudo/contract';
import type { Clock } from '../../clock.ts';
import { DomainError, notFound } from '../../errors.ts';
import type { PrismaClient } from '../../prisma.ts';
import { staffReportSelect, toStaffReport } from '../shared/dto.ts';
import { isReportConflict } from '../../lib/prisma-errors.ts';

export interface ReportsDeps {
  prisma: PrismaClient;
  clock: Clock;
}

/**
 * Every mutation locks the Appointment row first, then re-reads appointment and
 * report inside the same transaction. Cancel and publish therefore serialize on
 * the same row, so CANCELED + PUBLISHED is unreachable.
 */
export function createReportsService({ prisma, clock }: ReportsDeps) {
  async function lockAppointment(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    id: string,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Appointment" WHERE id = ${id}::uuid FOR UPDATE
    `;
    return rows.length > 0;
  }

  return {
    async getByAppointment(appointmentId: string): Promise<StaffReport> {
      const row = await prisma.report.findFirst({
        where: { appointmentId },
        select: staffReportSelect,
      });
      if (!row) throw notFound();
      return toStaffReport(row);
    },

    async create(appointmentId: string, input: CreateReportRequest): Promise<StaffReport> {
      try {
        return await prisma.$transaction(async (tx) => {
          const exists = await lockAppointment(tx, appointmentId);
          if (!exists) throw notFound();

          const appointment = await tx.appointment.findUnique({
            where: { id: appointmentId },
            select: { status: true, report: { select: { id: true } } },
          });
          if (!appointment) throw notFound();
          if (appointment.status === 'CANCELED') throw new DomainError('APPOINTMENT_CANCELED');
          if (appointment.report) throw new DomainError('REPORT_EXISTS');

          const now = clock.now();
          const created = await tx.report.create({
            data: {
              id: randomUUID(),
              appointmentId,
              title: input.title,
              body: input.body,
              professionalName: input.professionalName,
              status: 'DRAFT',
              createdAt: now,
              updatedAt: now,
              publishedAt: null,
            },
            select: staffReportSelect,
          });
          return toStaffReport(created);
        });
      } catch (error) {
        if (isReportConflict(error)) throw new DomainError('REPORT_EXISTS');
        throw error;
      }
    },

    async update(reportId: string, input: UpdateReportRequest): Promise<StaffReport> {
      return prisma.$transaction(async (tx) => {
        const located = await tx.report.findUnique({
          where: { id: reportId },
          select: { appointmentId: true },
        });
        if (!located) throw notFound();

        const exists = await lockAppointment(tx, located.appointmentId);
        if (!exists) throw notFound();

        const appointment = await tx.appointment.findUnique({
          where: { id: located.appointmentId },
          select: { status: true },
        });
        if (!appointment) throw notFound();
        if (appointment.status === 'CANCELED') throw new DomainError('APPOINTMENT_CANCELED');

        const report = await tx.report.findUnique({
          where: { id: reportId },
          select: staffReportSelect,
        });
        if (!report) throw notFound();
        if (report.status !== 'DRAFT') throw new DomainError('REPORT_LOCKED');

        const updated = await tx.report.update({
          where: { id: reportId },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
            ...(input.professionalName !== undefined
              ? { professionalName: input.professionalName }
              : {}),
            updatedAt: clock.now(),
          },
          select: staffReportSelect,
        });
        return toStaffReport(updated);
      });
    },

    async publish(reportId: string): Promise<StaffReport> {
      return prisma.$transaction(async (tx) => {
        const located = await tx.report.findUnique({
          where: { id: reportId },
          select: { appointmentId: true },
        });
        if (!located) throw notFound();

        const exists = await lockAppointment(tx, located.appointmentId);
        if (!exists) throw notFound();

        const appointment = await tx.appointment.findUnique({
          where: { id: located.appointmentId },
          select: { status: true },
        });
        if (!appointment) throw notFound();
        if (appointment.status === 'CANCELED') throw new DomainError('APPOINTMENT_CANCELED');

        const report = await tx.report.findUnique({
          where: { id: reportId },
          select: staffReportSelect,
        });
        if (!report) throw notFound();
        if (report.status !== 'DRAFT') throw new DomainError('REPORT_LOCKED');

        const now = clock.now();
        const published = await tx.report.update({
          where: { id: reportId },
          data: { status: 'PUBLISHED', publishedAt: now, updatedAt: now },
          select: staffReportSelect,
        });
        return toStaffReport(published);
      });
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
