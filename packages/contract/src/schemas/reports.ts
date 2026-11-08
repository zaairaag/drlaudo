import { z } from 'zod';
import { ReportStatusSchema } from '../enums.js';
import { VALIDATION_MESSAGES } from '../errors.js';
import { UUIDSchema, UtcDateTimeSchema } from './common.js';

function reportText(minimum: number, maximum: number) {
  return z.string().trim()
    .refine((value) => value.length >= minimum, {
      message: VALIDATION_MESSAGES.TOO_SHORT, params: { rule: 'TOO_SHORT' },
    })
    .refine((value) => value.length <= maximum, {
      message: VALIDATION_MESSAGES.TOO_LONG, params: { rule: 'TOO_LONG' },
    });
}

export const CreateReportRequestSchema = z.strictObject({
  title: reportText(3, 120),
  body: reportText(10, 10_000),
  professionalName: reportText(3, 120),
});
export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;

const editableFields = ['title', 'body', 'professionalName'] as const;

export const UpdateReportRequestSchema = CreateReportRequestSchema.partial()
  .superRefine((value, context) => {
    for (const field of editableFields) {
      if (Object.hasOwn(value, field) && value[field] === undefined) {
        context.addIssue({
          code: 'custom', path: [field], message: VALIDATION_MESSAGES.INVALID_TYPE,
          params: { rule: 'INVALID_TYPE' },
        });
      }
    }
  })
  .refine((value) => editableFields.some((field) => Object.hasOwn(value, field)), {
    message: VALIDATION_MESSAGES.EMPTY_PATCH,
    params: { rule: 'EMPTY_PATCH' },
    // Unknown keys must not suppress EMPTY_PATCH; absent/non-object bodies must.
    when: ({ value }) => value !== null && typeof value === 'object' && !Array.isArray(value),
  });
export type UpdateReportRequest = z.infer<typeof UpdateReportRequestSchema>;

const staffReportFields = {
  id: UUIDSchema,
  appointmentId: UUIDSchema,
  ...CreateReportRequestSchema.shape,
  updatedAt: UtcDateTimeSchema,
};

export const StaffReportSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...staffReportFields,
    status: z.literal(ReportStatusSchema.enum.DRAFT),
    publishedAt: z.null(),
  }),
  z.strictObject({
    ...staffReportFields,
    status: z.literal(ReportStatusSchema.enum.PUBLISHED),
    publishedAt: UtcDateTimeSchema,
  }),
]);
export type StaffReport = z.infer<typeof StaffReportSchema>;
