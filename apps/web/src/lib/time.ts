import { CLINIC_TZ, LocalDateSchema } from '@drlaudo/contract';
import { TZDate } from '@date-fns/tz';
import { addDays, format } from 'date-fns';

const TIMEZONE = CLINIC_TZ || 'America/Sao_Paulo';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const longDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIMEZONE,
  month: 'long',
  year: 'numeric',
});

export function formatLongDate(date: string): string {
  const civil = LocalDateSchema.parse(date);
  const local = new TZDate(2000, 0, 1, 12, 0, 0, 0, TIMEZONE);
  local.setFullYear(Number(civil.slice(0, 4)), Number(civil.slice(5, 7)) - 1, Number(civil.slice(8, 10)));
  const label = longDateFormatter.format(local);
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

export function formatMonth(instant: string): string {
  const label = monthFormatter.format(new Date(instant));
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

export function formatDate(instant: string): string {
  return dateFormatter.format(new Date(instant));
}

export function formatTime(instant: string): string {
  return timeFormatter.format(new Date(instant));
}

export function formatDateTime(instant: string): string {
  return `${formatDate(instant)} às ${formatTime(instant)}`;
}

export function todayDate(now = new Date()): string {
  return format(new TZDate(now, TIMEZONE), 'yyyy-MM-dd');
}

export function shiftDate(date: string, days: number): string {
  const civil = LocalDateSchema.parse(date);
  // Noon avoids nonexistent midnight at historical daylight-saving boundaries.
  // setFullYear preserves 0001–0099, unlike the numeric Date constructor.
  const local = new TZDate(2000, 0, 1, 12, 0, 0, 0, TIMEZONE);
  local.setFullYear(Number(civil.slice(0, 4)), Number(civil.slice(5, 7)) - 1, Number(civil.slice(8, 10)));
  return LocalDateSchema.parse(format(addDays(local, days), 'yyyy-MM-dd'));
}
