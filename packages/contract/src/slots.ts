import { TZDateMini } from '@date-fns/tz';
import {
  CLINIC_TZ, SLOT_MINUTES, OPENING_HOUR, CLOSING_HOUR, DEFAULT_AGENDA_DAYS,
} from './constants.js';
import type { LocalDate, UtcDateTime, UtcRange } from './schemas/common.js';

function parseCivil(date: LocalDate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

function utcMsSafe(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  dt.setUTCHours(h, min, s, 0);
  return dt.getTime();
}

function startOfCivilDay(y: number, m: number, d: number): Date {
  let low = utcMsSafe(y, m, d, 1, 0, 0);
  let high = utcMsSafe(y, m, d, 5, 0, 0);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const date = new TZDateMini(mid, CLINIC_TZ);
    if (
      date.getFullYear() > y
      || (date.getFullYear() === y && date.getMonth() > m - 1)
      || (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() >= d)
    ) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return new Date(low);
}

function findSlotInstant(y: number, m: number, d: number, hour: number, minute: number): UtcDateTime | null {
  let utcMs = utcMsSafe(y, m, d, hour + 3, minute, 0);
  for (let iter = 0; iter < 4; iter += 1) {
    const local = new TZDateMini(utcMs, CLINIC_TZ);
    const diff = (
      (local.getFullYear() - y) * 365 * 86_400_000
      + (local.getMonth() - (m - 1)) * 30 * 86_400_000
      + (local.getDate() - d) * 86_400_000
      + (local.getHours() - hour) * 3_600_000
      + (local.getMinutes() - minute) * 60_000
      + local.getSeconds() * 1000
      + local.getMilliseconds()
    );
    if (diff === 0) break;
    utcMs -= diff;
  }
  const check = new TZDateMini(utcMs, CLINIC_TZ);
  if (
    check.getFullYear() === y
    && check.getMonth() === m - 1
    && check.getDate() === d
    && check.getHours() === hour
    && check.getMinutes() === minute
    && check.getSeconds() === 0
    && check.getMilliseconds() === 0
  ) {
    return new Date(utcMs).toISOString();
  }
  return null;
}

export function generateDaySlots(date: LocalDate): readonly UtcDateTime[] {
  const { year, month, day } = parseCivil(date);
  const slots: UtcDateTime[] = [];
  for (let minutes = OPENING_HOUR * 60; minutes < CLOSING_HOUR * 60; minutes += SLOT_MINUTES) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const slot = findSlotInstant(year, month, day, hour, minute);
    if (slot !== null) {
      slots.push(slot);
    }
  }
  return slots;
}

export function isValidSlot(instant: UtcDateTime): boolean {
  const local = new TZDateMini(instant, CLINIC_TZ);
  return local.getHours() >= OPENING_HOUR && local.getHours() < CLOSING_HOUR
    && local.getMinutes() % SLOT_MINUTES === 0
    && local.getSeconds() === 0 && local.getMilliseconds() === 0;
}

export function isPast(instant: UtcDateTime, now: UtcDateTime): boolean {
  return instant <= now;
}

export function localDayRange(date: LocalDate): UtcRange {
  const { year, month, day } = parseCivil(date);
  const start = startOfCivilDay(year, month, day);
  const nextDay = new Date(start.getTime() + 36 * 3_600_000);
  const nextLocal = new TZDateMini(nextDay, CLINIC_TZ);
  const end = startOfCivilDay(nextLocal.getFullYear(), nextLocal.getMonth() + 1, nextLocal.getDate());
  return { from: start, to: end };
}

export function defaultAgendaRange(now: UtcDateTime): UtcRange {
  const local = new TZDateMini(now, CLINIC_TZ);
  const start = startOfCivilDay(local.getFullYear(), local.getMonth() + 1, local.getDate());
  const endTarget = new Date(start.getTime() + (DEFAULT_AGENDA_DAYS + 0.5) * 86_400_000);
  const endLocal = new TZDateMini(endTarget, CLINIC_TZ);
  const end = startOfCivilDay(endLocal.getFullYear(), endLocal.getMonth() + 1, endLocal.getDate());
  return { from: start, to: end };
}
