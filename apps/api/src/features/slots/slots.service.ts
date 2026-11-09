import {
  CLINIC_TZ,
  SlotsResponseSchema,
  generateDaySlots,
  isPast,
  localDayRange,
  type Slot,
  type SlotQuery,
  type SlotsResponse,
} from '@drlaudo/contract';
import type { Clock } from '../../clock.ts';
import type { PrismaClient } from '../../prisma.ts';

export interface SlotsService {
  list(query: SlotQuery): Promise<SlotsResponse>;
}

export function createSlotsService(
  { prisma, clock }: { prisma: PrismaClient; clock: Clock },
): SlotsService {
  return {
    async list(query: SlotQuery): Promise<SlotsResponse> {
      const range = localDayRange(query.date);
      const now = clock.now().toISOString();
      const taken = await prisma.appointment.findMany({
        where: { status: 'SCHEDULED', startsAt: { gte: range.from, lt: range.to } },
        select: { startsAt: true },
      });
      const takenInstants = new Set(taken.map((row) => row.startsAt.toISOString()));
      const slots: Slot[] = generateDaySlots(query.date).map((startsAt) => {
        if (isPast(startsAt, now)) return { startsAt, available: false, reason: 'PAST' };
        if (takenInstants.has(startsAt)) return { startsAt, available: false, reason: 'TAKEN' };
        return { startsAt, available: true };
      });
      return SlotsResponseSchema.parse({ date: query.date, timezone: CLINIC_TZ, slots });
    },
  };
}
