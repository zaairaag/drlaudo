import { afterEach, describe, expect, it, vi } from 'vitest';
import { appointmentCreationHref, safeReturnTo } from './navigation';

const patientId = '10000000-0000-4000-8000-000000000002';
const appointmentId = '30000000-0000-4000-8000-000000000001';

describe('retorno seguro dos filtros da agenda', () => {
  it.each([
    '/agenda?scope=all',
    `/agenda?scope=all&patientId=${patientId}&focus=${appointmentId}`,
    `/agendamentos/${appointmentId}/laudo?scope=all`,
    `/agendamentos/${appointmentId}/laudo?scope=all&patientId=${patientId}`,
    `/agenda?scope=all&view=calendar&calendarDate=2026-11-10&patientId=${patientId}`,
    `/agendamentos/${appointmentId}/laudo?scope=all&view=calendar&calendarDate=2026-11-10&patientId=${patientId}`,
  ])('preserva o modo completo autorizado para equipe: %s', (path) => {
    expect(safeReturnTo(path, 'STAFF')).toBe(path);
    expect(safeReturnTo(path, 'PATIENT')).toBe('/meus-exames');
  });

  it.each([
    'scope=',
    'scope=ALL',
    'scope=daily',
    'scope=all&scope=all',
    'scope=all&scope=daily',
    'scope=all&date=2026-11-10',
    'scope=all&date=',
    'scope=all&patientId=invalido',
    `scope=all&patientId=${patientId}&patientId=${patientId}`,
    'scope=all&view=calendar&calendarDate=2026-02-30',
    'scope=all&view=calendar&calendarDate=2026-11-10&calendarDate=2026-11-11',
    'scope=all&view=calendar',
    'scope=all&calendarDate=2026-11-10',
    'date=2026-11-10&view=calendar&calendarDate=2026-11-10',
    'scope=all&view=other&calendarDate=2026-11-10',
  ])('não retoma contexto inválido ou ambíguo: %s', (query) => {
    expect(safeReturnTo(`/agenda?${query}`, 'STAFF')).toBe('/agenda');
    expect(safeReturnTo(`/agendamentos/${appointmentId}/laudo?${query}`, 'STAFF')).toBe('/agenda');
  });

  it.each([
    'scope=all',
    `scope=all&patientId=${patientId}`,
    'scope=all&date=2026-11-10',
  ])('não concede o modo completo à criação: %s', (query) => {
    expect(safeReturnTo(`/agendamentos/novo?${query}`, 'STAFF')).toBe('/agenda');
  });
});

describe('criação contextual de agendamento', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['/agenda?date=2026-11-10', '2026-11-10', undefined],
    [`/agenda?date=2026-11-10&patientId=${patientId}`, '2026-11-10', patientId],
    [`/agenda?scope=all&view=calendar&calendarDate=2026-12-03&patientId=${patientId}`, '2026-12-03', patientId],
    [`/agenda?scope=all&patientId=${patientId}`, '2026-11-09', patientId],
    ['/agenda', '2026-11-09', undefined],
  ] as const)('abre formulário vazio com data e retorno de %s', (context, date, patient) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T01:00:00.000Z'));
    const href = new URL(appointmentCreationHref(context), 'http://localhost');
    expect(href.pathname).toBe('/agendamentos/novo');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      date, ...(patient ? { patientId: patient } : {}), returnTo: context,
    });
  });

  it.each([
    'https://example.test/agenda?date=2026-11-10',
    '//example.test/agenda',
    '/\\example.test/agenda',
    '/pacientes',
    '/agendamentos/novo',
    '/agenda#exames',
    '/agenda?date=2026-02-30',
    '/agenda?date=2026-11-10&date=2026-11-11',
    '/agenda?scope=all&date=2026-11-10',
    '/agenda?scope=all&view=calendar',
    '/agenda?scope=all&view=calendar&calendarDate=2026-02-30',
    '/agenda?returnTo=%2Fagenda',
    '/agenda?arbitrary=value',
  ])('descarta origem externa, ambígua ou não autorizada: %s', (context) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T15:00:00.000Z'));
    const href = new URL(appointmentCreationHref(context), 'http://localhost');
    expect(href.pathname).toBe('/agendamentos/novo');
    expect(Object.fromEntries(href.searchParams)).toEqual({ date: '2026-11-09', returnTo: '/agenda' });
  });

  it.each([
    '/agenda?date=2026-11-10',
    `/agenda?scope=all&patientId=${patientId}`,
    `/agenda?scope=all&view=calendar&calendarDate=2026-11-10&patientId=${patientId}`,
  ])('login retoma criação com retorno interno validado: %s', (context) => {
    const path = `/agendamentos/novo?date=2026-11-11&patientId=${patientId}&returnTo=${encodeURIComponent(context)}`;
    expect(safeReturnTo(path, 'STAFF')).toBe(path);
    expect(safeReturnTo(path, 'PATIENT')).toBe('/meus-exames');
  });

  it.each([
    'https://example.test/agenda',
    '//example.test/agenda',
    '/\\example.test/agenda',
    '/pacientes',
    '/agendamentos/novo?date=2026-11-10',
    '/agenda?returnTo=%2Fagenda',
    '/agenda?date=2026-11-10&date=2026-11-11',
    `/agenda?scope=all&patientId=${patientId}&patientId=${patientId}`,
    '/agenda?scope=all&view=calendar&calendarDate=2026-02-30',
    '/agenda#exames',
  ])('login recusa retorno externo, duplicado ou recursivo: %s', (context) => {
    const path = `/agendamentos/novo?date=2026-11-10&returnTo=${encodeURIComponent(context)}`;
    expect(safeReturnTo(path, 'STAFF')).toBe('/agenda');
  });

  it('login recusa returnTo duplicado e mantém criação direta legada', () => {
    const duplicate = '/agendamentos/novo?date=2026-11-10&returnTo=%2Fagenda&returnTo=%2Fagenda';
    expect(safeReturnTo(duplicate, 'STAFF')).toBe('/agenda');
    const legacy = `/agendamentos/novo?date=2026-11-10&patientId=${patientId}`;
    expect(safeReturnTo(legacy, 'STAFF')).toBe(legacy);
  });
});
