import { z } from 'zod';
import { ExamTypeCodeSchema } from '../enums.js';
import { UUIDSchema } from './common.js';

export const ExamTypeSchema = z.strictObject({
  id: UUIDSchema,
  code: ExamTypeCodeSchema,
  name: z.string().min(1),
});
export type ExamType = z.infer<typeof ExamTypeSchema>;

export const ExamTypeSummarySchema = ExamTypeSchema.pick({ id: true, name: true });
export type ExamTypeSummary = z.infer<typeof ExamTypeSummarySchema>;

export const ExamTypeNameSchema = ExamTypeSchema.pick({ name: true });
export type ExamTypeName = z.infer<typeof ExamTypeNameSchema>;

export const ExamTypeListResponseSchema = z.array(ExamTypeSchema);
export type ExamTypeListResponse = z.infer<typeof ExamTypeListResponseSchema>;
