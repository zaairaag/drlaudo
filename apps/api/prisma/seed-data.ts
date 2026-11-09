import bcrypt from 'bcryptjs';
import {
  CLINIC_TZ,
  LocalDateSchema,
  generateDaySlots,
  type LocalDate,
} from '@drlaudo/contract';
import { format, addDays } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import type { Clock } from '../src/clock.ts';
import type { PrismaClient } from '../src/prisma.ts';

const STAFF_ID = '10000000-0000-4000-8000-000000000001';
const ANA_ID = '10000000-0000-4000-8000-000000000002';
const BRUNO_ID = '10000000-0000-4000-8000-000000000003';
const XRAY_ID = '20000000-0000-4000-8000-000000000001';
const ULTRASOUND_ID = '20000000-0000-4000-8000-000000000002';
const MRI_ID = '20000000-0000-4000-8000-000000000003';

const appointmentId = (suffix: number) =>
  `30000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const reportId = (suffix: number) =>
  `40000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

function tomorrow(date: LocalDate): LocalDate {
  const local = new TZDate(2000, 0, 1, 12, 0, 0, 0, CLINIC_TZ);
  local.setFullYear(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  return LocalDateSchema.parse(format(addDays(local, 1), 'yyyy-MM-dd'));
}

/** No import-time I/O: the caller owns the connection and clock lifecycle. */
export async function seedDemo({ prisma, clock }: { prisma: PrismaClient; clock: Clock }): Promise<void> {
  const now = clock.now();
  const today = LocalDateSchema.parse(format(new TZDate(now, CLINIC_TZ), 'yyyy-MM-dd'));
  const day = generateDaySlots(tomorrow(today));
  const at = (index: number): Date => {
    const instant = day[index];
    if (!instant) throw new Error(`Posição ${index} inexistente na grade de demonstração.`);
    return new Date(instant);
  };

  // Relative dates and hashes apply only on first create; empty updates keep
  // history, passwords and published timestamps untouched on re-run.
  const passwordHash = await bcrypt.hash('Demo@1234', 10);
  const users = [
    { id: STAFF_ID, name: 'Equipe Dr. Laudo', email: 'equipe@drlaudo.test', role: 'STAFF' as const },
    { id: ANA_ID, name: 'Ana Souza', email: 'ana.souza@drlaudo.test', role: 'PATIENT' as const },
    { id: BRUNO_ID, name: 'Bruno Lima', email: 'bruno.lima@drlaudo.test', role: 'PATIENT' as const },
  ];
  const exams = [
    { id: XRAY_ID, code: 'XRAY', name: 'Raio-X de tórax' },
    { id: ULTRASOUND_ID, code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
    { id: MRI_ID, code: 'MRI', name: 'Ressonância de crânio' },
  ];

  await prisma.$transaction(async (tx) => {
    for (const user of users) {
      await tx.user.upsert({
        where: { id: user.id },
        update: {},
        create: { ...user, passwordHash, createdAt: now },
      });
    }
    for (const exam of exams) {
      await tx.examType.upsert({ where: { id: exam.id }, update: {}, create: exam });
    }
    const appointments = [
      { id: appointmentId(1), patientId: ANA_ID, examTypeId: XRAY_ID, startsAt: at(2) },
      { id: appointmentId(2), patientId: ANA_ID, examTypeId: ULTRASOUND_ID, startsAt: at(4) },
      { id: appointmentId(3), patientId: ANA_ID, examTypeId: MRI_ID, startsAt: at(6) },
      { id: appointmentId(4), patientId: BRUNO_ID, examTypeId: XRAY_ID, startsAt: at(8) },
      { id: appointmentId(5), patientId: BRUNO_ID, examTypeId: ULTRASOUND_ID, startsAt: at(10) },
    ];
    for (const appointment of appointments) {
      const canceled = appointment.id === appointmentId(5);
      await tx.appointment.upsert({
        where: { id: appointment.id },
        update: {},
        create: {
          ...appointment,
          status: canceled ? 'CANCELED' : 'SCHEDULED',
          createdAt: now,
          ...(canceled ? { canceledAt: now } : {}),
        },
      });
    }
    const published = {
      id: reportId(1),
      appointmentId: appointmentId(1),
      title: 'Raio-X de tórax',
      body: 'Exemplo fictício: campos pulmonares sem alterações relevantes.',
      professionalName: 'Dra. Marina Costa',
      status: 'PUBLISHED' as const,
      publishedAt: now,
    };
    const draft = {
      id: reportId(2),
      appointmentId: appointmentId(2),
      title: 'Ultrassonografia de abdome',
      body: 'Rascunho fictício: avaliação abdominal em preparação pela equipe.',
      professionalName: 'Dra. Marina Costa',
      status: 'DRAFT' as const,
      publishedAt: null,
    };
    for (const report of [published, draft]) {
      await tx.report.upsert({
        where: { id: report.id },
        update: {},
        create: { ...report, createdAt: now, updatedAt: now },
      });
    }
  });
}
