import {
  StaffAppointmentSchema,
  StaffReportSchema,
  MyAppointmentSchema,
  PublishedPatientReportSchema,
  type StaffAppointment,
  type StaffReport,
  type MyAppointment,
  type PublishedPatientReport,
} from '@drlaudo/contract';

/** Explicit selects: entities never leave the API, so hashes cannot leak. */
export const staffAppointmentSelect = {
  id: true,
  startsAt: true,
  status: true,
  patient: { select: { id: true, name: true } },
  examType: { select: { id: true, name: true } },
  report: { select: { id: true, status: true } },
} as const;

export const staffReportSelect = {
  id: true,
  appointmentId: true,
  title: true,
  body: true,
  professionalName: true,
  status: true,
  updatedAt: true,
  publishedAt: true,
} as const;

export const myAppointmentSelect = {
  id: true,
  startsAt: true,
  status: true,
  examType: { select: { id: true, name: true } },
  report: { select: { status: true } },
} as const;

type StaffAppointmentRow = {
  id: string;
  startsAt: Date;
  status: 'SCHEDULED' | 'CANCELED';
  patient: { id: string; name: string };
  examType: { id: string; name: string };
  report: { id: string; status: 'DRAFT' | 'PUBLISHED' } | null;
};

type StaffReportRow = {
  id: string;
  appointmentId: string;
  title: string;
  body: string;
  professionalName: string;
  status: 'DRAFT' | 'PUBLISHED';
  updatedAt: Date;
  publishedAt: Date | null;
};

type MyAppointmentRow = {
  id: string;
  startsAt: Date;
  status: 'SCHEDULED' | 'CANCELED';
  examType: { id: string; name: string };
  report: { status: 'DRAFT' | 'PUBLISHED' } | null;
};

export function toStaffAppointment(row: StaffAppointmentRow): StaffAppointment {
  return StaffAppointmentSchema.parse({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    status: row.status,
    patient: { id: row.patient.id, name: row.patient.name },
    examType: { id: row.examType.id, name: row.examType.name },
    report: row.report,
  });
}

export function toStaffReport(row: StaffReportRow): StaffReport {
  return StaffReportSchema.parse({
    id: row.id,
    appointmentId: row.appointmentId,
    title: row.title,
    body: row.body,
    professionalName: row.professionalName,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** A canceled item never signals a published report to its own patient. */
export function toMyAppointment(row: MyAppointmentRow): MyAppointment {
  return MyAppointmentSchema.parse({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    status: row.status,
    examType: { id: row.examType.id, name: row.examType.name },
    hasPublishedReport: row.status === 'SCHEDULED' && row.report?.status === 'PUBLISHED',
  });
}

export function toPublishedPatientReport(row: {
  title: string;
  body: string;
  professionalName: string;
  publishedAt: Date;
  appointment: { startsAt: Date; examType: { name: string } };
}): PublishedPatientReport {
  return PublishedPatientReportSchema.parse({
    title: row.title,
    body: row.body,
    professionalName: row.professionalName,
    publishedAt: row.publishedAt.toISOString(),
    startsAt: row.appointment.startsAt.toISOString(),
    examType: { name: row.appointment.examType.name },
  });
}
