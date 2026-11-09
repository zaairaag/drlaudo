import { CLINIC_TZ, LocalDateSchema, generateDaySlots, localDayRange } from '@drlaudo/contract';
import type { ClinicApi } from './api.ts';

export function clinicDate(now = new Date()): string {
  return LocalDateSchema.parse(new Intl.DateTimeFormat('sv-SE', {
    timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now));
}

export function nextDate(date: string): string {
  return clinicDate(localDayRange(date).to);
}

export function addDays(date: string, count: number): string {
  const civil = new Date(`${LocalDateSchema.parse(date)}T12:00:00.000Z`);
  civil.setUTCDate(civil.getUTCDate() + count);
  return LocalDateSchema.parse(civil.toISOString().slice(0, 10));
}

/** Each case owns an unused civil day; failed/repeated cases cannot steal old slots. */
export async function unusedDay(api: ClinicApi, minimumDays = 1): Promise<string> {
  let date = clinicDate();
  for (let day = 0; day < minimumDays; day += 1) date = nextDate(date);
  for (let attempt = 0; attempt < 366; attempt += 1) {
    if ((await api.appointments(date)).length === 0) return date;
    date = nextDate(date);
  }
  throw new Error('QA não encontrou dia isolado disponível nos próximos 366 dias.');
}

export function slotAt(date: string, index: number): string {
  const slot = generateDaySlots(date)[index];
  if (!slot) throw new Error(`Slot QA ${index} inexistente no dia civil ${date}.`);
  return slot;
}

export function displayDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}
