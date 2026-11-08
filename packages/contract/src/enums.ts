import { z } from 'zod';

export const RoleSchema = z.enum(['STAFF', 'PATIENT']);
export type Role = z.infer<typeof RoleSchema>;

export const AppointmentStatusSchema = z.enum(['SCHEDULED', 'CANCELED']);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

export const ReportStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ExamTypeCodeSchema = z.enum(['XRAY', 'ULTRASOUND', 'MRI']);
export type ExamTypeCode = z.infer<typeof ExamTypeCodeSchema>;

export const SlotUnavailableReasonSchema = z.enum(['PAST', 'TAKEN']);
export type SlotUnavailableReason = z.infer<typeof SlotUnavailableReasonSchema>;
