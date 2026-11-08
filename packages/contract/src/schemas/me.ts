import { z } from 'zod';
import { AppointmentStatusSchema } from '../enums.js';
import { UUIDSchema, UtcDateTimeSchema } from './common.js';
import { ExamTypeSummarySchema, ExamTypeNameSchema } from './exam-types.js';
import { CreateReportRequestSchema } from './reports.js';

export const MyAppointmentSchema = z.strictObject({
  id: UUIDSchema,
  startsAt: UtcDateTimeSchema,
  status: AppointmentStatusSchema,
  examType: ExamTypeSummarySchema,
  hasPublishedReport: z.boolean(),
}).refine(({ status, hasPublishedReport }) => status !== 'CANCELED' || !hasPublishedReport, {
  path: ['hasPublishedReport'],
});
export type MyAppointment = z.infer<typeof MyAppointmentSchema>;

export const MyAppointmentListResponseSchema = z.array(MyAppointmentSchema);
export type MyAppointmentListResponse = z.infer<typeof MyAppointmentListResponseSchema>;

export const PublishedPatientReportSchema = z.strictObject({
  ...CreateReportRequestSchema.shape,
  publishedAt: UtcDateTimeSchema,
  examType: ExamTypeNameSchema,
  startsAt: UtcDateTimeSchema,
});
export type PublishedPatientReport = z.infer<typeof PublishedPatientReportSchema>;
