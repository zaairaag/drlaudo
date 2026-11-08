import {
  CLINIC_TZ,
  ExamTypeSchema,
  LocalDateSchema,
  StaffReportSchema,
  UserSchema,
  UUIDSchema,
  UtcDateTimeSchema,
  AppointmentStatusSchema,
  generateDaySlots,
  localDayRange,
  type ExamType,
  type StaffReport,
  type User,
} from '@drlaudo/contract';
import { z } from 'zod';

export interface Clock { now(): Date }
export interface MockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// This storage contains invented demo data only. Never connect it to real clinical data.
export const MOCK_SNAPSHOT_KEY = 'drlaudo.mock.v1';
const SNAPSHOT_VERSION = 1;
const MockUserSchema = UserSchema.extend({ password: z.string().min(1), createdAt: UtcDateTimeSchema });
const MockAppointmentSchema = z.strictObject({
  id: UUIDSchema,
  patientId: UUIDSchema,
  examTypeId: UUIDSchema,
  startsAt: UtcDateTimeSchema,
  status: AppointmentStatusSchema,
  createdAt: UtcDateTimeSchema,
  canceledAt: UtcDateTimeSchema.nullable(),
});
// The strict report union rejects createdAt, so validate its persisted envelope separately.
const StoredReportSchema = z.strictObject({ createdAt: UtcDateTimeSchema, dto: StaffReportSchema });
const SnapshotSchema = z.strictObject({
  version: z.literal(SNAPSHOT_VERSION),
  users: z.array(MockUserSchema),
  examTypes: z.array(ExamTypeSchema),
  appointments: z.array(MockAppointmentSchema),
  reports: z.array(StoredReportSchema),
});
export type MockUser = User & { password: string; createdAt: string };
export type MockAppointment = z.infer<typeof MockAppointmentSchema>;
export type MockReport = StaffReport & { createdAt: string };
type SnapshotStatus = 'memory' | 'saved' | 'invalid' | 'unavailable';

// Internal to mocks; screens consume contract DTOs through /api instead.
export interface MockDb {
  users: MockUser[];
  examTypes: ExamType[];
  appointments: MockAppointment[];
  reports: MockReport[];
  snapshotStatus: SnapshotStatus;
  persist(): void;
  reset(): void;
}

const civilDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
function dateInClinic(instant: Date): string {
  const parts = civilDate.formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value.padStart(4, '0');
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return LocalDateSchema.parse(`${year}-${month}-${day}`);
}
function seed(clock: Clock): Pick<MockDb, 'users' | 'examTypes' | 'appointments' | 'reports'> {
  const now = UtcDateTimeSchema.parse(clock.now().toISOString());
  const today = dateInClinic(new Date(now));
  const tomorrow = dateInClinic(localDayRange(today).to);
  const slots = generateDaySlots(tomorrow);
  const times = ['08', '09', '10', '11', '12'];
  // Look up civil times rather than indexing: historical IANA gaps can remove starts.
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const starts = times.map((value) => {
    const instant = slots.find((slot) => hour.format(new Date(slot)) === `${value}:00`);
    if (!instant) throw new Error('Demo seed requires its five civil appointment times');
    return instant;
  });
  const users: MockUser[] = [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Equipe Dr. Laudo', email: 'equipe@drlaudo.test', role: 'STAFF', password: 'Demo@1234', createdAt: now },
    { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Souza', email: 'ana.souza@drlaudo.test', role: 'PATIENT', password: 'Demo@1234', createdAt: now },
    { id: '10000000-0000-4000-8000-000000000003', name: 'Bruno Lima', email: 'bruno.lima@drlaudo.test', role: 'PATIENT', password: 'Demo@1234', createdAt: now },
  ];
  const examTypes: ExamType[] = [
    { id: '20000000-0000-4000-8000-000000000001', code: 'XRAY', name: 'Raio-X de tórax' },
    { id: '20000000-0000-4000-8000-000000000002', code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
    { id: '20000000-0000-4000-8000-000000000003', code: 'MRI', name: 'Ressonância de crânio' },
  ];
  const appointments: MockAppointment[] = starts.map((startsAt, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    patientId: index < 3 ? '10000000-0000-4000-8000-000000000002' : '10000000-0000-4000-8000-000000000003',
    examTypeId: `20000000-0000-4000-8000-${String(index % 3 + 1).padStart(12, '0')}`,
    startsAt, status: index === 4 ? 'CANCELED' : 'SCHEDULED', createdAt: now, canceledAt: index === 4 ? now : null,
  }));
  const reports: MockReport[] = [
    { id: '40000000-0000-4000-8000-000000000001', appointmentId: '30000000-0000-4000-8000-000000000001', title: 'Raio-X de tórax', body: 'Exemplo fictício: campos pulmonares sem alterações relevantes.', professionalName: 'Dra. Marina Costa', status: 'PUBLISHED', publishedAt: now, updatedAt: now, createdAt: now },
    { id: '40000000-0000-4000-8000-000000000002', appointmentId: '30000000-0000-4000-8000-000000000002', title: 'Ultrassonografia de abdome', body: 'Rascunho fictício: avaliação abdominal em preparação pela equipe.', professionalName: 'Dra. Marina Costa', status: 'DRAFT', publishedAt: null, updatedAt: now, createdAt: now },
  ];
  return { users, examTypes, appointments, reports };
}
function isConsistent(data: Pick<MockDb, 'users' | 'examTypes' | 'appointments' | 'reports'>): boolean {
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (!unique(data.users.map((entry) => entry.id)) || !unique(data.users.map((entry) => entry.email)) ||
      !unique(data.examTypes.map((entry) => entry.id)) || !unique(data.examTypes.map((entry) => entry.code)) ||
      !unique(data.appointments.map((entry) => entry.id)) || !unique(data.reports.map((entry) => entry.id)) ||
      !unique(data.reports.map((entry) => entry.appointmentId)) ||
      !unique(data.appointments.filter((entry) => entry.status === 'SCHEDULED').map((entry) => entry.startsAt))) return false;
  for (const appointment of data.appointments) {
    if (!data.users.some((user) => user.id === appointment.patientId && user.role === 'PATIENT') ||
        !data.examTypes.some((exam) => exam.id === appointment.examTypeId) ||
        (appointment.status === 'CANCELED') !== (appointment.canceledAt !== null)) return false;
  }
  return data.reports.every((report) => data.appointments.some((appointment) =>
    appointment.id === report.appointmentId && !(appointment.status === 'CANCELED' && report.status === 'PUBLISHED')));
}

export function createMockDb({ clock, storage }: { clock: Clock; storage?: MockStorage }): MockDb {
  const db: MockDb = {
    users: [], examTypes: [], appointments: [], reports: [], snapshotStatus: storage ? 'saved' : 'memory',
    persist() {
      if (!storage || db.snapshotStatus === 'invalid') return;
      try {
        storage.setItem(MOCK_SNAPSHOT_KEY, JSON.stringify({
          version: SNAPSHOT_VERSION, users: db.users, examTypes: db.examTypes, appointments: db.appointments,
          reports: db.reports.map(({ createdAt, ...dto }) => ({ createdAt, dto })),
        }));
        db.snapshotStatus = 'saved';
      } catch {
        db.snapshotStatus = 'unavailable';
      }
    },
    reset() {
      Object.assign(db, seed(clock));
      db.snapshotStatus = storage ? 'saved' : 'memory';
      db.persist();
    },
  };
  let raw: string | null = null;
  try { raw = storage?.getItem(MOCK_SNAPSHOT_KEY) ?? null; }
  catch { db.snapshotStatus = 'unavailable'; }
  if (raw !== null) {
    try {
      const value: unknown = JSON.parse(raw);
      const parsed = SnapshotSchema.safeParse(value);
      if (!parsed.success) { db.snapshotStatus = 'invalid'; return db; }
      const data = {
        users: parsed.data.users, examTypes: parsed.data.examTypes, appointments: parsed.data.appointments,
        reports: parsed.data.reports.map(({ createdAt, dto }) => ({ ...dto, createdAt })),
      };
      if (!isConsistent(data)) { db.snapshotStatus = 'invalid'; return db; }
      Object.assign(db, data);
      return db;
    } catch {
      db.snapshotStatus = 'invalid';
      return db;
    }
  }
  Object.assign(db, seed(clock));
  db.persist();
  return db;
}
