import { z } from 'zod';

function isGregorianDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (!(year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1)) {
    return false;
  }

  if (month === 2) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= (isLeapYear ? 29 : 28);
  }

  const daysInMonth = month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  return day <= daysInMonth;
}

// Absolute-end lookaheads reject trailing line terminators that `$` would allow.
export const UUIDSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/i)
  .toLowerCase();
export type UUID = z.infer<typeof UUIDSchema>;

export const UtcDateTimeSchema = z
  .string()
  .regex(
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z(?![\s\S])/,
  )
  .refine(isGregorianDate);
export type UtcDateTime = z.infer<typeof UtcDateTimeSchema>;

export const LocalDateSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\s\S])/)
  .refine(isGregorianDate);
export type LocalDate = z.infer<typeof LocalDateSchema>;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  // The contract limits UTF-16 units, not Unicode code points.
  .refine((value) => value.length <= 254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+(?![\s\S])/);
export type Email = z.infer<typeof EmailSchema>;

// Compact structure alone does not verify a JWT signature or authenticate a user.
export const TokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![\s\S])/);
export type Token = z.infer<typeof TokenSchema>;

export const EmptyObjectSchema = z.strictObject({});
export type EmptyObject = z.infer<typeof EmptyObjectSchema>;

export const NoBodySchema = z.undefined();
export type NoBody = z.infer<typeof NoBodySchema>;

export const IdParamsSchema = z.strictObject({ id: UUIDSchema });
export type IdParams = z.infer<typeof IdParamsSchema>;

export const UtcRangeSchema = z
  .strictObject({ from: z.date(), to: z.date() })
  .refine(({ from, to }) => from.getTime() < to.getTime(), { path: ['to'] });
export type UtcRange = z.infer<typeof UtcRangeSchema>;
