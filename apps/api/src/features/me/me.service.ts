import type { MyAppointment, PublishedPatientReport } from '@drlaudo/contract';
import { notFound } from '../../errors.ts';
import type { PrismaClient } from '../../prisma.ts';
import { myAppointmentSelect, toMyAppointment, toPublishedPatientReport } from '../shared/dto.ts';

export interface MeDeps {
  prisma: PrismaClient;
}

export function createMeService({ prisma }: MeDeps) {
  return {
    /** Ownership comes exclusively from the token subject, never from input. */
    async listAppointments(patientId: string): Promise<MyAppointment[]> {
      const rows = await prisma.appointment.findMany({
        where: { patientId },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: myAppointmentSelect,
      });
      return rows.map(toMyAppointment);
    },

    /**
     * One filtered query covers foreign, missing, reportless and draft cases,
     * so all four produce the same body without extra lookups.
     */
    async getPublishedReport(patientId: string, appointmentId: string): Promise<PublishedPatientReport> {
      const row = await prisma.report.findFirst({
        where: {
          status: 'PUBLISHED',
          appointment: { id: appointmentId, patientId, status: 'SCHEDULED' },
        },
        select: {
          title: true,
          body: true,
          professionalName: true,
          publishedAt: true,
          appointment: {
            select: { startsAt: true, examType: { select: { name: true } } },
          },
        },
      });
      if (!row || !row.publishedAt) throw notFound();
      return toPublishedPatientReport({
        title: row.title,
        body: row.body,
        professionalName: row.professionalName,
        publishedAt: row.publishedAt,
        appointment: row.appointment,
      });
    },
  };
}

export type MeService = ReturnType<typeof createMeService>;
