import { describe, expect, it, vi } from 'vitest';
import { createMockDb, MOCK_SNAPSHOT_KEY } from './db';
import { createMemoryStorage, createTestClock } from './fixtures';

const NOW = '2026-11-10T12:00:00.000Z';

// These literals are independent of the demo mapper and intentionally pin ARCH §9.
describe('snapshot fictício por aba', () => {
  it('creates exactly the canonical three users, three exams, five appointments and two reports', () => {
    const db = createMockDb({ clock: createTestClock(NOW) });
    expect(db.users.map(({ id, name, email, role, active }) => ({ id, name, email, role, active }))).toEqual([
      { id: '10000000-0000-4000-8000-000000000001', name: 'Equipe Dr. Laudo', email: 'equipe@drlaudo.test', role: 'STAFF', active: true },
      { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Souza', email: 'ana.souza@drlaudo.test', role: 'PATIENT', active: true },
      { id: '10000000-0000-4000-8000-000000000003', name: 'Bruno Lima', email: 'bruno.lima@drlaudo.test', role: 'PATIENT', active: true },
    ]);
    expect(db.examTypes).toEqual([
      { id: '20000000-0000-4000-8000-000000000001', code: 'XRAY', name: 'Raio-X de tórax' },
      { id: '20000000-0000-4000-8000-000000000002', code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
      { id: '20000000-0000-4000-8000-000000000003', code: 'MRI', name: 'Ressonância de crânio' },
    ]);
    expect(db.appointments.map(({ id, patientId, examTypeId, startsAt, status, canceledAt }) => ({ id, patientId, examTypeId, startsAt, status, canceledAt }))).toEqual([
      { id: '30000000-0000-4000-8000-000000000001', patientId: '10000000-0000-4000-8000-000000000002', examTypeId: '20000000-0000-4000-8000-000000000001', startsAt: '2026-11-11T11:00:00.000Z', status: 'SCHEDULED', canceledAt: null },
      { id: '30000000-0000-4000-8000-000000000002', patientId: '10000000-0000-4000-8000-000000000002', examTypeId: '20000000-0000-4000-8000-000000000002', startsAt: '2026-11-11T12:00:00.000Z', status: 'SCHEDULED', canceledAt: null },
      { id: '30000000-0000-4000-8000-000000000003', patientId: '10000000-0000-4000-8000-000000000002', examTypeId: '20000000-0000-4000-8000-000000000003', startsAt: '2026-11-11T13:00:00.000Z', status: 'SCHEDULED', canceledAt: null },
      { id: '30000000-0000-4000-8000-000000000004', patientId: '10000000-0000-4000-8000-000000000003', examTypeId: '20000000-0000-4000-8000-000000000001', startsAt: '2026-11-11T14:00:00.000Z', status: 'SCHEDULED', canceledAt: null },
      { id: '30000000-0000-4000-8000-000000000005', patientId: '10000000-0000-4000-8000-000000000003', examTypeId: '20000000-0000-4000-8000-000000000002', startsAt: '2026-11-11T15:00:00.000Z', status: 'CANCELED', canceledAt: NOW },
    ]);
    expect(db.reports.map(({ id, appointmentId, title, body, professionalName, status, publishedAt, updatedAt }) => ({ id, appointmentId, title, body, professionalName, status, publishedAt, updatedAt }))).toEqual([
      { id: '40000000-0000-4000-8000-000000000001', appointmentId: '30000000-0000-4000-8000-000000000001', title: 'Raio-X de tórax', body: 'Exemplo fictício: campos pulmonares sem alterações relevantes.', professionalName: 'Dra. Marina Costa', status: 'PUBLISHED', publishedAt: NOW, updatedAt: NOW },
      { id: '40000000-0000-4000-8000-000000000002', appointmentId: '30000000-0000-4000-8000-000000000002', title: 'Ultrassonografia de abdome', body: 'Rascunho fictício: avaliação abdominal em preparação pela equipe.', professionalName: 'Dra. Marina Costa', status: 'DRAFT', publishedAt: null, updatedAt: NOW },
    ]);
  });

  it('seeds D+1 using the Brasília day rather than the UTC or process day', () => {
    const db = createMockDb({ clock: createTestClock('2026-11-10T01:00:00.000Z') });
    expect(db.appointments[0]?.startsAt).toBe('2026-11-10T11:00:00.000Z');
  });

  it('writes only on initial creation or explicit persistence, never on reading a valid snapshot', () => {
    const storage = createMemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const clock = createTestClock(NOW);
    const first = createMockDb({ clock, storage });
    expect(setItem).toHaveBeenCalledTimes(1);
    const draft = first.reports[1];
    if (!draft) throw new Error('Missing arranged draft');
    draft.body = 'Texto fictício salvo em sessão.';
    first.persist();
    expect(setItem).toHaveBeenCalledTimes(2);
    clock.set('2026-12-01T15:00:00.000Z');
    const restored = createMockDb({ clock, storage });
    expect(restored.appointments).toEqual(first.appointments);
    expect(restored.reports).toEqual(first.reports);
    expect(restored.users).toEqual(first.users);
    expect(setItem).toHaveBeenCalledTimes(2);
  });

  it('restaura atividade persistida sem reativar paciente ou reinicializar histórico', () => {
    const storage = createMemoryStorage();
    const clock = createTestClock(NOW);
    const first = createMockDb({ clock, storage });
    const patient = first.users.find(({ role }) => role === 'PATIENT');
    if (!patient) throw new Error('Missing arranged patient');
    patient.active = false;
    first.persist();
    const before = storage.getItem(MOCK_SNAPSHOT_KEY);
    clock.set('2026-12-01T15:00:00.000Z');
    const restored = createMockDb({ clock, storage });
    expect(restored.users).toEqual(first.users);
    expect(restored.appointments).toEqual(first.appointments);
    expect(restored.reports).toEqual(first.reports);
    expect(storage.getItem(MOCK_SNAPSHOT_KEY)).toBe(before);
  });

  it('carrega snapshot anterior à atividade como ativo sem apagar dados ou regravar na leitura', () => {
    const storage = createMemoryStorage();
    const clock = createTestClock(NOW);
    const first = createMockDb({ clock });
    const legacy = JSON.stringify({
      version: 1,
      users: first.users.map(({ id, name, email, role, password, createdAt }) => ({ id, name, email, role, password, createdAt })),
      examTypes: first.examTypes, appointments: first.appointments,
      reports: first.reports.map(({ createdAt, ...dto }) => ({ createdAt, dto })),
    });
    storage.setItem(MOCK_SNAPSHOT_KEY, legacy);
    clock.set('2026-12-01T15:00:00.000Z');
    const restored = createMockDb({ clock, storage });
    expect(restored.snapshotStatus).toBe('saved');
    expect(restored.users).toEqual(first.users);
    expect(restored.users.every(({ active }) => active === true)).toBe(true);
    expect(restored.appointments).toEqual(first.appointments);
    expect(restored.reports).toEqual(first.reports);
    expect(storage.getItem(MOCK_SNAPSHOT_KEY)).toBe(legacy);
  });

  it.each([null, 'false', 0])('rejeita atividade persistida inválida sem sobrescrever snapshot: %j', (active) => {
    const storage = createMemoryStorage();
    const clock = createTestClock(NOW);
    const first = createMockDb({ clock });
    const invalid = JSON.stringify({
      version: 1, users: first.users.map((user) => ({ ...user, active })),
      examTypes: first.examTypes, appointments: first.appointments,
      reports: first.reports.map(({ createdAt, ...dto }) => ({ createdAt, dto })),
    });
    storage.setItem(MOCK_SNAPSHOT_KEY, invalid);
    expect(createMockDb({ clock, storage }).snapshotStatus).toBe('invalid');
    expect(storage.getItem(MOCK_SNAPSHOT_KEY)).toBe(invalid);
  });

  it('isolates independent tab storages', () => {
    const clock = createTestClock(NOW);
    const first = createMockDb({ clock, storage: createMemoryStorage() });
    first.appointments.splice(0, 1);
    first.persist();
    const second = createMockDb({ clock, storage: createMemoryStorage() });
    expect(first.appointments).toHaveLength(4);
    expect(second.appointments).toHaveLength(5);
  });

  it('recalculates dates only on explicit reset and replaces the stored snapshot', () => {
    const clock = createTestClock(NOW);
    const storage = createMemoryStorage();
    const db = createMockDb({ clock, storage });
    clock.set('2026-12-01T15:00:00.000Z');
    db.reset();
    expect(db.appointments[0]?.startsAt).toBe('2026-12-02T11:00:00.000Z');
    expect(createMockDb({ clock, storage }).appointments).toEqual(db.appointments);
  });

  it.each(['not json', '{}', '{"version":999}', '{"version":1,"users":[]}'])('fails closed on an invalid saved snapshot without silently overwriting it: %s', (raw) => {
    const storage = createMemoryStorage();
    storage.setItem(MOCK_SNAPSHOT_KEY, raw);
    const clock = createTestClock(NOW);
    const db = createMockDb({ clock, storage });
    expect(db.snapshotStatus).toBe('invalid');
    expect(db.users).toEqual([]);
    expect(db.appointments).toEqual([]);
    expect(storage.getItem(MOCK_SNAPSHOT_KEY)).toBe(raw);
    db.reset();
    expect(db.snapshotStatus).toBe('saved');
    expect(db.appointments).toHaveLength(5);
  });

  it('rejects a structurally valid snapshot with broken ownership or an impossible aggregate', () => {
    const storage = createMemoryStorage();
    const clock = createTestClock(NOW);
    const first = createMockDb({ clock, storage });
    const published = first.appointments[0];
    if (!published) throw new Error('Missing arranged appointment');
    published.status = 'CANCELED';
    published.canceledAt = NOW;
    first.persist();
    expect(createMockDb({ clock, storage }).snapshotStatus).toBe('invalid');
  });

  it('keeps an in-memory fictitious demo usable when storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('Storage denied'); },
      setItem: () => { throw new Error('Storage denied'); },
      removeItem: () => { throw new Error('Storage denied'); },
    };
    const db = createMockDb({ clock: createTestClock(NOW), storage });
    expect(db.snapshotStatus).toBe('unavailable');
    expect(db.appointments).toHaveLength(5);
    expect(() => db.persist()).not.toThrow();
  });
});
