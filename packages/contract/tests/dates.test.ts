import { describe, expect, it } from 'vitest';
import {
  LocalDateSchema, UtcDateTimeSchema, UtcRangeSchema, localDayRange, defaultAgendaRange,
} from '../src/index.js';

describe('E1 E2: calendário gregoriano e precisão de fronteira', () => {
  it.each(['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31'])('preserva data civil existente: %s', (value) => {
    expect(LocalDateSchema.parse(value)).toBe(value);
  });
  it.each([
    '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2026-02-29', '2026-01-32',
    '2026-02-30', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-1-01', '2026-01-1', ' 2026-01-01', '2026-01-01\n',
    '2026-01-01T00:00:00.000Z', null, 20260101,
  ])('rejeita data inexistente/formato não civil: %j', (value) => {
    expect(LocalDateSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    '0001-01-01T00:00:00.000Z', '0099-12-31T23:59:59.999Z',
    '2000-02-29T12:34:56.789Z', '2026-11-10T13:00:01.001Z', '9999-12-31T23:59:59.999Z',
  ])('preserva instante com milissegundos sem arredondar: %s', (value) => {
    expect(UtcDateTimeSchema.parse(value)).toBe(value);
  });
  it.each([
    '0000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z',
    '1900-02-29T00:00:00.000Z', '2026-02-30T00:00:00.000Z', '2026-01-32T00:00:00.000Z',
    '2026-01-01T24:00:00.000Z', '2026-01-01T23:60:00.000Z', '2026-01-01T23:59:60.000Z',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00.00Z', '2026-01-01T00:00:00.0000Z',
    '2026-01-01T00:00:00.000+00:00', '2026-01-01T00:00:00.000z',
    '2026-01-01t00:00:00.000Z', '2026-01-01T00:00:00.000Z\n', '2026-01-01', null,
  ])('rejeita instante inválido ou fora da precisão UTC exata: %j', (value) => {
    expect(UtcDateTimeSchema.safeParse(value).success).toBe(false);
  });
  it('aceita intervalo interno cujo fim exclusivo chega ao ano 10000', () => {
    const from = new Date('9999-12-31T03:00:00.000Z');
    const to = new Date('+010000-01-01T03:00:00.000Z');
    const result = UtcRangeSchema.parse({ from, to });
    expect(result.from.toISOString()).toBe('9999-12-31T03:00:00.000Z');
    expect(result.to.toISOString()).toBe('+010000-01-01T03:00:00.000Z');
  });
  it.each([
    { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-01-01T00:00:00.000Z') },
    { from: new Date('2026-01-02T00:00:00.000Z'), to: new Date('2026-01-01T00:00:00.000Z') },
    { from: new Date(NaN), to: new Date('2026-01-01T00:00:00.000Z') },
    { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date(NaN) },
    { from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' },
    { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-01-02T00:00:00.000Z'), extra: true },
  ])('rejeita intervalo vazio/invertido/inválido/coagido/ampliado: %j', (value) => {
    expect(UtcRangeSchema.safeParse(value).success).toBe(false);
  });
});

describe('E1 E2 S3.2 S3.3 RN-25 TEMPO-04: limites de dia civil IANA', () => {
  it.each([
    ['2026-11-10', '2026-11-10T03:00:00.000Z', '2026-11-11T03:00:00.000Z'],
    ['2024-02-29', '2024-02-29T03:00:00.000Z', '2024-03-01T03:00:00.000Z'],
    ['2018-11-04', '2018-11-04T03:00:00.000Z', '2018-11-05T02:00:00.000Z'],
    ['2019-02-16', '2019-02-16T02:00:00.000Z', '2019-02-17T03:00:00.000Z'],
    ['1931-10-03', '1931-10-03T03:00:00.000Z', '1931-10-04T02:00:00.000Z'],
    ['1914-01-01', '1914-01-01T03:06:28.000Z', '1914-01-02T03:00:00.000Z'],
    ['0001-01-01', '0001-01-01T03:06:28.000Z', '0001-01-02T03:06:28.000Z'],
    ['0099-12-31', '0099-12-31T03:06:28.000Z', '0100-01-01T03:06:28.000Z'],
    ['9999-12-31', '9999-12-31T03:00:00.000Z', '+010000-01-01T03:00:00.000Z'],
  ])('resolve %s sem offset fixo, correção de século ou rollover HTTP', (date, from, to) => {
    const range = localDayRange(date);
    expect(range.from.toISOString()).toBe(from);
    expect(range.to.toISOString()).toBe(to);
    expect(UtcRangeSchema.safeParse(range).success).toBe(true);
    expect(range.from.constructor).toBe(Date);
    expect(range.to.constructor).toBe(Date);
  });
  it('inclui o início e exclui exatamente o próximo dia', () => {
    const range = localDayRange('2026-11-10');
    const includes = (instant: string) => {
      const timestamp = Date.parse(instant);
      return timestamp >= range.from.getTime() && timestamp < range.to.getTime();
    };
    expect(includes('2026-11-10T02:59:59.999Z')).toBe(false);
    expect(includes('2026-11-10T03:00:00.000Z')).toBe(true);
    expect(includes('2026-11-11T02:59:59.999Z')).toBe(true);
    expect(includes('2026-11-11T03:00:00.000Z')).toBe(false);
  });
});

describe('E1 E2 S3.1 RN-25 TEMPO-05: hoje inteiro mais 29 dias civis', () => {
  it.each([
    ['2026-11-10T12:00:00.000Z', '2026-11-10T03:00:00.000Z', '2026-12-10T03:00:00.000Z'],
    ['2026-11-10T01:00:00.000Z', '2026-11-09T03:00:00.000Z', '2026-12-09T03:00:00.000Z'],
    ['2026-11-10T03:00:00.000Z', '2026-11-10T03:00:00.000Z', '2026-12-10T03:00:00.000Z'],
    ['2018-10-20T15:00:00.000Z', '2018-10-20T03:00:00.000Z', '2018-11-19T02:00:00.000Z'],
    ['2018-11-04T12:00:00.000Z', '2018-11-04T03:00:00.000Z', '2018-12-04T02:00:00.000Z'],
    ['2019-02-01T12:00:00.000Z', '2019-02-01T02:00:00.000Z', '2019-03-03T03:00:00.000Z'],
    ['0001-01-01T12:00:00.000Z', '0001-01-01T03:06:28.000Z', '0001-01-31T03:06:28.000Z'],
    ['9999-12-31T23:59:59.999Z', '9999-12-31T03:00:00.000Z', '+010000-01-30T03:00:00.000Z'],
  ])('calcula janela civil para now=%s, não now+720h nem 31 dias', (now, from, to) => {
    const range = defaultAgendaRange(now);
    expect(range.from.toISOString()).toBe(from);
    expect(range.to.toISOString()).toBe(to);
    expect(UtcRangeSchema.safeParse(range).success).toBe(true);
  });
  it('não compartilha limites Date mutáveis entre operações', () => {
    const range = defaultAgendaRange('2026-11-10T12:00:00.000Z');
    range.from.setTime(0);
    range.to.setTime(0);
    const next = defaultAgendaRange('2026-11-10T12:00:00.000Z');
    expect(next.from.toISOString()).toBe('2026-11-10T03:00:00.000Z');
    expect(next.to.toISOString()).toBe('2026-12-10T03:00:00.000Z');
  });
});
