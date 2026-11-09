/**
 * Prisma 7 with driver adapters nests the PostgreSQL constraint inside
 * `meta.driverAdapterError`, so the target is extracted defensively instead of
 * assuming a single shape. Only the named constraint decides the mapping.
 */
export function uniqueConstraintName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { index?: unknown; fields?: unknown } };
      };
    };
  };
  if (candidate.code !== 'P2002') return null;

  const index = candidate.meta?.driverAdapterError?.cause?.constraint?.index;
  if (typeof index === 'string' && index.length > 0) return index;

  const fields = candidate.meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields) && fields.length > 0) return fields.map(String).join(',');

  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.map(String).join(',');
  if (typeof target === 'string') return target;

  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const match = /constraint: `([^`]+)`/.exec(message);
  return match?.[1] ?? null;
}

export function isSlotConflict(error: unknown): boolean {
  const name = uniqueConstraintName(error);
  return name === 'appointment_active_slot_unique' || name === 'startsAt';
}

export function isReportConflict(error: unknown): boolean {
  const name = uniqueConstraintName(error);
  return name === 'Report_appointmentId_key' || name === 'appointmentId';
}

export function isEmailConflict(error: unknown): boolean {
  const name = uniqueConstraintName(error);
  return name === 'User_email_key' || name === 'email';
}
