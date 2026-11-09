import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './navigation';

const patientId = '10000000-0000-4000-8000-000000000002';
const appointmentId = '30000000-0000-4000-8000-000000000001';

describe('retorno seguro dos filtros da agenda', () => {
  it.each([
    '/agenda?scope=all',
    `/agenda?scope=all&patientId=${patientId}&focus=${appointmentId}`,
    `/agendamentos/${appointmentId}/laudo?scope=all`,
    `/agendamentos/${appointmentId}/laudo?scope=all&patientId=${patientId}`,
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
