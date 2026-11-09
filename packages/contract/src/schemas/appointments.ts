import { z } from 'zod';
import { AppointmentStatusSchema, ReportStatusSchema } from '../enums.js';
import { VALIDATION_MESSAGES } from '../errors.js';
import { UUIDSchema, UtcDateTimeSchema, LocalDateSchema } from './common.js';
import { PatientSummarySchema } from './patients.js';
import { ExamTypeSummarySchema } from './exam-types.js';

export const ReportSummarySchema = z.strictObject({ id: UUIDSchema, status: ReportStatusSchema });
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const StaffAppointmentSchema = z.strictObject({
  id: UUIDSchema,
  startsAt: UtcDateTimeSchema,
  status: AppointmentStatusSchema,
  patient: PatientSummarySchema,
  examType: ExamTypeSummarySchema,
  report: ReportSummarySchema.nullable(),
}).refine(({ status, report }) => status !== 'CANCELED' || report?.status !== 'PUBLISHED', {
  path: ['report'],
});
export type StaffAppointment = z.infer<typeof StaffAppointmentSchema>;

export const CreateAppointmentRequestSchema = z.strictObject({
  patientId: UUIDSchema,
  examTypeId: UUIDSchema,
  startsAt: UtcDateTimeSchema,
});
export type CreateAppointmentRequest = z.infer<typeof CreateAppointmentRequestSchema>;

export const AppointmentListQuerySchema = z.strictObject({
  date: LocalDateSchema.optional(),
  patientId: UUIDSchema.optional(),
  scope: z.literal('all').optional(),
}).superRefine((value, context) => {
  for (const field of ['date', 'patientId', 'scope'] as const) {
    if (Object.hasOwn(value, field) && value[field] === undefined) {
      context.addIssue({
        code: 'custom', path: [field], message: VALIDATION_MESSAGES.INVALID_TYPE,
        params: { rule: 'INVALID_TYPE' },
      });
    }
  }
  if (value.scope === 'all' && value.date !== undefined) {
    context.addIssue({
      code: 'custom', path: ['date'], message: VALIDATION_MESSAGES.INVALID_FORMAT,
      params: { rule: 'INVALID_FORMAT' },
    });
  }
});
export type AppointmentListQuery = z.infer<typeof AppointmentListQuerySchema>;

export const StaffAppointmentListResponseSchema = z.array(StaffAppointmentSchema);
export type StaffAppointmentListResponse = z.infer<typeof StaffAppointmentListResponseSchema>;
