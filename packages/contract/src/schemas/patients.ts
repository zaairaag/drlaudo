import { z } from 'zod';
import { EmailSchema, UUIDSchema } from './common.js';

export const PatientSchema = z.strictObject({
  id: UUIDSchema,
  name: z.string().min(1),
  email: EmailSchema,
});
export type Patient = z.infer<typeof PatientSchema>;

export const PatientSummarySchema = PatientSchema.pick({ id: true, name: true });
export type PatientSummary = z.infer<typeof PatientSummarySchema>;

export const PatientListResponseSchema = z.array(PatientSchema);
export type PatientListResponse = z.infer<typeof PatientListResponseSchema>;
