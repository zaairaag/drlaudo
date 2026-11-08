import { describe, expect, it } from 'vitest';
import {
  generateDaySlots, isValidSlot, isPast, SlotSchema, SlotQuerySchema, SlotsResponseSchema,
} from '../src/index.js';

// Oráculo literal de API §§4.1/5.6, independente da implementação temporal.
const novemberGrid = [
  '2026-11-10T10:00:00.000Z', '2026-11-10T10:30:00.000Z',
  '2026-11-10T11:00:00.000Z', '2026-11-10T11:30:00.000Z',
  '2026-11-10T12:00:00.000Z', '2026-11-10T12:30:00.000Z',
  '2026-11-10T13:00:00.000Z', '2026-11-10T13:30:00.000Z',
  '2026-11-10T14:00:00.000Z', '2026-11-10T14:30:00.000Z',
  '2026-11-10T15:00:00.000Z', '2026-11-10T15:30:00.000Z',
  '2026-11-10T16:00:00.000Z', '2026-11-10T16:30:00.000Z',
  '2026-11-10T17:00:00.000Z', '2026-11-10T17:30:00.000Z',
  '2026-11-10T18:00:00.000Z', '2026-11-10T18:30:00.000Z',
  '2026-11-10T19:00:00.000Z', '2026-11-10T19:30:00.000Z',
  '2026-11-10T20:00:00.000Z', '2026-11-10T20:30:00.000Z',
  '2026-11-10T21:00:00.000Z', '2026-11-10T21:30:00.000Z',
];
const freeSlots = novemberGrid.map((startsAt) => ({ startsAt, available: true }));
const response = { date: '2026-11-10', timezone: 'America/Sao_Paulo', slots: freeSlots };
const instant = '2026-11-10T12:00:00.000Z';

describe('E1 E2 S3.9 RN-06 RN-07 RN-25 TEMPO-01: grade civil IANA', () => {
  it('gera os 24 inícios UTC exatos, ordenados e sem duplicatas em processo Tóquio', () => {
    expect(generateDaySlots('2026-11-10')).toEqual(novemberGrid);
  });
  it.each([
    ['2026-11-14', '2026-11-14T10:00:00.000Z', '2026-11-14T21:30:00.000Z'],
    ['2026-11-15', '2026-11-15T10:00:00.000Z', '2026-11-15T21:30:00.000Z'],
    ['2018-11-04', '2018-11-04T09:00:00.000Z', '2018-11-04T20:30:00.000Z'],
    ['2019-02-17', '2019-02-17T10:00:00.000Z', '2019-02-17T21:30:00.000Z'],
    ['0001-01-01', '0001-01-01T10:06:28.000Z', '0001-01-01T21:36:28.000Z'],
    ['0099-12-31', '0099-12-31T10:06:28.000Z', '0099-12-31T21:36:28.000Z'],
    ['1900-01-01', '1900-01-01T10:06:28.000Z', '1900-01-01T21:36:28.000Z'],
    ['9999-12-31', '9999-12-31T10:00:00.000Z', '9999-12-31T21:30:00.000Z'],
  ])('preserva fins de semana, horário histórico e extremos em %s', (date, first, last) => {
    const slots = generateDaySlots(date);
    expect(slots).toHaveLength(24);
    expect(slots[0]).toBe(first);
    expect(slots[23]).toBe(last);
    expect(new Set(slots).size).toBe(24);
    for (let index = 1; index < slots.length; index += 1) {
      expect(Date.parse(slots[index] ?? '') - Date.parse(slots[index - 1] ?? '')).toBe(1_800_000);
    }
  });
  it('não depende de clock nem compartilha estado mutável entre dias', () => {
    expect(generateDaySlots('2026-11-10')).toEqual(novemberGrid);
    generateDaySlots('2018-11-04');
    expect(generateDaySlots('2026-11-10')).toEqual(novemberGrid);
  });
});

describe('E1 S3.16 RN-06 RN-07 TEMPO-02: grade local sem arredondamento', () => {
  it.each([
    '2026-11-10T10:00:00.000Z', '2026-11-10T10:30:00.000Z',
    '2026-11-10T21:30:00.000Z', '2018-11-04T09:00:00.000Z',
    '0001-01-01T10:06:28.000Z', '1900-01-01T21:36:28.000Z',
  ])('aceita início civil válido sem avaliar passado: %s', (value) => {
    expect(isValidSlot(value)).toBe(true);
  });
  it.each([
    '2026-11-10T09:30:00.000Z', '2026-11-10T13:15:00.000Z',
    '2026-11-10T21:45:00.000Z', '2026-11-10T22:00:00.000Z',
    '2026-11-10T10:00:01.000Z', '2026-11-10T10:00:00.001Z',
    '2026-11-10T10:29:59.999Z', '2018-11-04T08:30:00.000Z',
    '2018-11-04T21:00:00.000Z', '1900-01-01T10:00:00.000Z',
    '1900-01-01T10:06:28.001Z',
  ])('rejeita fora da grade ou resíduo local: %s', (value) => {
    expect(isValidSlot(value)).toBe(false);
  });
});

describe('E1 S3.10 RN-08 TEMPO-03: início menor ou igual é passado', () => {
  it.each([
    ['2026-11-10T11:59:59.999Z', true],
    ['2026-11-10T12:00:00.000Z', true],
    ['2026-11-10T12:00:00.001Z', false],
    ['2026-11-10T12:30:00.000Z', false],
  ])('compara %s contra o único now fornecido', (value, expected) => {
    expect(isPast(value, instant)).toBe(expected);
  });
});

describe('E1 E2 S3.9: disponibilidade é união strict sem inventar reason', () => {
  it.each([
    { startsAt: instant, available: true },
    { startsAt: instant, available: false, reason: 'PAST' },
    { startsAt: instant, available: false, reason: 'TAKEN' },
  ])('aceita ramo exato: %j', (value) => {
    expect(SlotSchema.parse(value)).toEqual(value);
  });
  it.each([
    { startsAt: instant, available: true, reason: 'TAKEN' },
    { startsAt: instant, available: false },
    { startsAt: instant, available: false, reason: null },
    { startsAt: instant, available: false, reason: 'CANCELED' },
    { startsAt: instant, available: 'true' },
    { startsAt: instant, available: true, patientId: 'secret' },
    { available: true }, { startsAt: null, available: true },
    { startsAt: '2026-11-10T12:00:00Z', available: true }, null, [],
  ])('rejeita ramo incompleto, extra ou tipo indevido: %j', (value) => {
    expect(SlotSchema.safeParse(value).success).toBe(false);
  });
  it('valida a query com data obrigatória sem limites futuros extras', () => {
    expect(SlotQuerySchema.parse({ date: '9999-12-31' })).toEqual({ date: '9999-12-31' });
  });
  it.each([{}, { date: null }, { date: ['2026-11-10'] }, { date: '2026-02-30' }, { date: '2026-11-10', patientId: 'x' }])(
    'rejeita query incompleta ou ampliada: %j', (value) => {
      expect(SlotQuerySchema.safeParse(value).success).toBe(false);
    },
  );
  it('em 1931-10-03 omite 11:00 e 11:30 civis inexistentes, sem normalizar para outros horários', () => {
    const grid = [
      '1931-10-03T10:00:00.000Z', '1931-10-03T10:30:00.000Z',
      '1931-10-03T11:00:00.000Z', '1931-10-03T11:30:00.000Z',
      '1931-10-03T12:00:00.000Z', '1931-10-03T12:30:00.000Z',
      '1931-10-03T13:00:00.000Z', '1931-10-03T13:30:00.000Z',
      '1931-10-03T14:00:00.000Z', '1931-10-03T14:30:00.000Z',
      '1931-10-03T15:00:00.000Z', '1931-10-03T15:30:00.000Z',
      '1931-10-03T16:00:00.000Z', '1931-10-03T16:30:00.000Z',
      '1931-10-03T17:00:00.000Z', '1931-10-03T17:30:00.000Z',
      '1931-10-03T18:00:00.000Z', '1931-10-03T18:30:00.000Z',
      '1931-10-03T19:00:00.000Z', '1931-10-03T19:30:00.000Z',
      '1931-10-03T20:00:00.000Z', '1931-10-03T20:30:00.000Z',
    ];
    expect(generateDaySlots('1931-10-03')).toEqual(grid);
    const value = {
      date: '1931-10-03', timezone: 'America/Sao_Paulo',
      slots: grid.map((startsAt) => ({ startsAt, available: true })),
    };
    expect(SlotsResponseSchema.parse(value)).toEqual(value);
    expect(SlotsResponseSchema.safeParse({
      ...value, slots: [...value.slots, value.slots[0], value.slots[1]],
    }).success).toBe(false);
    expect(SlotsResponseSchema.safeParse({ ...value, slots: value.slots.slice(0, 21) }).success).toBe(false);
  });
  it('aceita grade completa com mistura dos três estados', () => {
    const value = {
      ...response,
      slots: freeSlots.map((slot, index) => index === 0
        ? { startsAt: slot.startsAt, available: false, reason: 'PAST' }
        : index === 1
          ? { startsAt: slot.startsAt, available: false, reason: 'TAKEN' }
          : slot),
    };
    expect(SlotsResponseSchema.parse(value)).toEqual(value);
  });
  it.each([
    { ...response, slots: freeSlots.slice(0, 23) },
    { ...response, slots: [...freeSlots, freeSlots[0]] },
    { ...response, slots: [...freeSlots].reverse() },
    { ...response, slots: freeSlots.map((slot, index) => index === 1 ? freeSlots[0] : slot) },
    { ...response, slots: freeSlots.map((slot, index) => index === 0 ? { startsAt: '2026-11-10T09:30:00.000Z', available: true } : slot) },
    { ...response, date: '2026-11-11' },
    { ...response, date: '2026-02-30' },
    { ...response, timezone: 'UTC' },
    { ...response, timezone: '-03:00' },
    { ...response, slots: null },
    { ...response, count: 24 },
    { ...response, slots: [{ startsAt: instant, available: true, reason: 'PAST' }, ...freeSlots.slice(1)] },
  ])('rejeita cardinalidade, ordem, instante, fuso ou shape incorretos: %j', (value) => {
    expect(SlotsResponseSchema.safeParse(value).success).toBe(false);
  });
});
