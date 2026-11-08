import { z } from 'zod';
import { CLINIC_TZ } from '../constants.js';
import { SlotUnavailableReasonSchema } from '../enums.js';
import { generateDaySlots } from '../slots.js';
import { LocalDateSchema, UtcDateTimeSchema } from './common.js';

export const SlotSchema = z.discriminatedUnion('available', [
  z.strictObject({ startsAt: UtcDateTimeSchema, available: z.literal(true) }),
  z.strictObject({
    startsAt: UtcDateTimeSchema,
    available: z.literal(false),
    reason: SlotUnavailableReasonSchema,
  }),
]);
export type Slot = z.infer<typeof SlotSchema>;

export const SlotQuerySchema = z.strictObject({ date: LocalDateSchema });
export type SlotQuery = z.infer<typeof SlotQuerySchema>;

export const SlotsResponseSchema = z.strictObject({
  date: LocalDateSchema,
  timezone: z.literal(CLINIC_TZ),
  slots: z.array(SlotSchema),
}).check((context) => {
  // Do not calculate temporal values from a malformed date or partially parsed DTO.
  if (context.issues.length > 0) return;
  const expected = generateDaySlots(context.value.date);
  if (context.value.slots.length !== expected.length
    || context.value.slots.some((slot, index) => slot.startsAt !== expected[index])) {
    context.issues.push({
      code: 'custom', input: context.value.slots, path: ['slots'],
      message: 'A grade deve conter todos os horários civis existentes do dia, em ordem.',
    });
  }
});
export type SlotsResponse = z.infer<typeof SlotsResponseSchema>;
