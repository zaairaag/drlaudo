import type { Clock, MockAppointment, MockDb, MockReport, MockStorage, MockUser } from './db.js';

export const TEST_IDS = {
  staff: '11111111-1111-4111-8111-111111111111',
  ana: '22222222-2222-4222-8222-222222222222',
  bruno: '33333333-3333-4333-8333-333333333333',
  missing: '99999999-9999-4999-8999-999999999999',
  xray: '20000000-0000-4000-8000-000000000001',
  ultrasound: '20000000-0000-4000-8000-000000000002',
  mri: '20000000-0000-4000-8000-000000000003',
  publishedAppointment: '30000000-0000-4000-8000-000000000001',
  draftAppointment: '30000000-0000-4000-8000-000000000002',
  plainAppointment: '30000000-0000-4000-8000-000000000003',
  brunoAppointment: '30000000-0000-4000-8000-000000000004',
  canceledAppointment: '30000000-0000-4000-8000-000000000005',
  publishedReport: '40000000-0000-4000-8000-000000000001',
  draftReport: '40000000-0000-4000-8000-000000000002',
} as const;

export interface TestClock extends Clock {
  set(iso: string | Date): void;
  advanceBy(ms: number): void;
}

export function createTestClock(initialIso = '2026-11-10T12:00:00.000Z'): TestClock {
  let current = new Date(initialIso);
  return {
    now: () => new Date(current.getTime()),
    set(iso: string | Date) { current = new Date(iso); },
    advanceBy(ms: number) { current = new Date(current.getTime() + ms); },
  };
}

export function createMemoryStorage(): MockStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

// Resets mock state to predictable isolated test fixtures.
export function resetTestDb(db: MockDb, nowIso = '2026-11-10T12:00:00.000Z'): void {
  const users: MockUser[] = [
    { id: TEST_IDS.staff, name: 'Equipe QA', email: 'staff@fixture.test', role: 'STAFF', active: true, password: 'Demo@1234', createdAt: nowIso },
    { id: TEST_IDS.ana, name: 'Ana QA', email: 'ana@fixture.test', role: 'PATIENT', active: true, password: 'Demo@1234', createdAt: nowIso },
    { id: TEST_IDS.bruno, name: 'Bruno QA', email: 'bruno@fixture.test', role: 'PATIENT', active: true, password: 'Demo@1234', createdAt: nowIso },
  ];
  const examTypes = [
    { id: TEST_IDS.xray, code: 'XRAY' as const, name: 'Raio-X de tórax' },
    { id: TEST_IDS.ultrasound, code: 'ULTRASOUND' as const, name: 'Ultrassonografia de abdome' },
    { id: TEST_IDS.mri, code: 'MRI' as const, name: 'Ressonância de crânio' },
  ];
  const appointments: MockAppointment[] = [
    { id: TEST_IDS.publishedAppointment, patientId: TEST_IDS.ana, examTypeId: TEST_IDS.xray, startsAt: '2026-11-11T11:00:00.000Z', status: 'SCHEDULED', createdAt: nowIso, canceledAt: null },
    { id: TEST_IDS.draftAppointment, patientId: TEST_IDS.ana, examTypeId: TEST_IDS.ultrasound, startsAt: '2026-11-11T12:00:00.000Z', status: 'SCHEDULED', createdAt: nowIso, canceledAt: null },
    { id: TEST_IDS.plainAppointment, patientId: TEST_IDS.ana, examTypeId: TEST_IDS.mri, startsAt: '2026-11-11T13:00:00.000Z', status: 'SCHEDULED', createdAt: nowIso, canceledAt: null },
    { id: TEST_IDS.brunoAppointment, patientId: TEST_IDS.bruno, examTypeId: TEST_IDS.xray, startsAt: '2026-11-11T14:00:00.000Z', status: 'SCHEDULED', createdAt: nowIso, canceledAt: null },
    { id: TEST_IDS.canceledAppointment, patientId: TEST_IDS.bruno, examTypeId: TEST_IDS.ultrasound, startsAt: '2026-11-11T15:00:00.000Z', status: 'CANCELED', createdAt: nowIso, canceledAt: nowIso },
  ];
  const reports: MockReport[] = [
    { id: TEST_IDS.publishedReport, appointmentId: TEST_IDS.publishedAppointment, title: 'Publicado Ana', body: 'SENTINELA-PUBLICADO-ANA-852', professionalName: 'Dra. QA', status: 'PUBLISHED', publishedAt: nowIso, updatedAt: nowIso, createdAt: nowIso },
    { id: TEST_IDS.draftReport, appointmentId: TEST_IDS.draftAppointment, title: 'Rascunho Ana', body: 'SENTINELA-RASCUNHO-ANA-741', professionalName: 'Dra. QA', status: 'DRAFT', publishedAt: null, updatedAt: nowIso, createdAt: nowIso },
  ];
  db.users = users;
  db.examTypes = examTypes;
  db.appointments = appointments;
  db.reports = reports;
  db.snapshotStatus = 'memory';
}
