import { z } from 'zod';
import { VALIDATION_MESSAGES } from '../errors.js';
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

const passwordEncoder = new TextEncoder();

function patientName(minimum: number, maximum: number) {
  return z.string().trim()
    .refine((value) => value.length >= minimum, {
      message: VALIDATION_MESSAGES.TOO_SHORT, params: { rule: 'TOO_SHORT' },
    })
    .refine((value) => value.length <= maximum, {
      message: VALIDATION_MESSAGES.TOO_LONG, params: { rule: 'TOO_LONG' },
    });
}

export const CreatePatientRequestSchema = z.strictObject({
  name: patientName(3, 120),
  email: EmailSchema,
  password: z.string()
    .refine((value) => value.length >= 8, {
      message: VALIDATION_MESSAGES.TOO_SHORT, params: { rule: 'TOO_SHORT' },
    })
    .refine(
      (value) => passwordEncoder.encode(value).byteLength <= 72,
      { message: VALIDATION_MESSAGES.TOO_LONG, params: { rule: 'TOO_LONG' } },
    ),
});
export type CreatePatientRequest = z.infer<typeof CreatePatientRequestSchema>;

const editableFields = ['name', 'email'] as const;

export const UpdatePatientRequestSchema = CreatePatientRequestSchema.omit({ password: true }).partial()
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
    when: ({ value }) => value !== null && typeof value === 'object' && !Array.isArray(value),
  });
export type UpdatePatientRequest = z.infer<typeof UpdatePatientRequestSchema>;
