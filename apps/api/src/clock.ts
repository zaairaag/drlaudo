/** Injectable "now". Business rules never call `new Date()` on their own. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Deterministic clock for tests and for the demo seed. */
export function fixedClock(instant: string | Date): Clock {
  const value = typeof instant === 'string' ? new Date(instant) : instant;
  return { now: () => new Date(value.getTime()) };
}
