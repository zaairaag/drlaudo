import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime, shiftDate, todayDate } from './time';

describe('RN-25 · apresentação em Brasília', () => {
  it('TEMPO-07 mostra o dia anterior ao UTC sem usar o fuso do processo', () => {
    expect(formatDate('2026-11-09T01:30:00.000Z')).toBe('08/11/2026');
    expect(formatTime('2026-11-09T01:30:00.000Z')).toBe('22:30');
    expect(formatDateTime('2026-11-09T01:30:00.000Z')).toBe('08/11/2026 às 22:30');
  });

  it('respeita o histórico IANA em vez de subtrair três horas fixas', () => {
    expect(formatTime('2018-11-04T03:00:00.000Z')).toBe('01:00');
  });

  it('calcula hoje pelo dia civil da clínica', () => {
    expect(todayDate(new Date('2026-11-09T01:30:00.000Z'))).toBe('2026-11-08');
    expect(todayDate(new Date('2026-11-09T03:00:00.000Z'))).toBe('2026-11-09');
  });

  it('move dias civis nas bordas de mês e ano', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('não perde o dia ao atravessar o início histórico do horário de verão', () => {
    expect(shiftDate('2018-11-03', 1)).toBe('2018-11-04');
    expect(shiftDate('2018-11-04', 1)).toBe('2018-11-05');
  });

  it('preserva anos menores que cem no calendário civil', () => {
    expect(shiftDate('0001-12-31', 1)).toBe('0002-01-01');
    expect(shiftDate('0099-12-31', 1)).toBe('0100-01-01');
  });
});
