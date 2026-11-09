import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { seedDemo } from '../../prisma/seed-data.ts';
import { fixedClock } from '../../src/clock.ts';
import { QA, auth, buildTestApp, login, testPrisma, truncateAll, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

const DEMO = {
  staff: '10000000-0000-4000-8000-000000000001',
  ana: '10000000-0000-4000-8000-000000000002',
  bruno: '10000000-0000-4000-8000-000000000003',
  xray: '20000000-0000-4000-8000-000000000001',
  ultrasound: '20000000-0000-4000-8000-000000000002',
  mri: '20000000-0000-4000-8000-000000000003',
  publishedAppointment: '30000000-0000-4000-8000-000000000001',
  draftAppointment: '30000000-0000-4000-8000-000000000002',
  emptyAppointment: '30000000-0000-4000-8000-000000000003',
  publishedReport: '40000000-0000-4000-8000-000000000001',
  draftReport: '40000000-0000-4000-8000-000000000002',
} as const;

async function snapshot() {
  const db = testPrisma();
  return {
    users: await db.user.findMany({ orderBy: { id: 'asc' } }),
    exams: await db.examType.findMany({ orderBy: { id: 'asc' } }),
    appointments: await db.appointment.findMany({ orderBy: { id: 'asc' } }),
    reports: await db.report.findMany({ orderBy: { id: 'asc' } }),
  };
}

describe('Seed real em QA · reexecução, preservação e rollback', () => {
  it('primeira execução cria demo utilizável e reexecução com outro clock preserva todas as linhas', async () => {
    await truncateAll();
    const db = testPrisma();
    await seedDemo({ prisma: db, clock: fixedClock(QA.now) });
    const before = await snapshot();
    expect(before.users.map(({ id, email, role, createdAt }) => ({ id, email, role, createdAt }))).toEqual([
      { id: DEMO.staff, email: 'equipe@drlaudo.test', role: 'STAFF', createdAt: new Date(QA.now) },
      { id: DEMO.ana, email: 'ana.souza@drlaudo.test', role: 'PATIENT', createdAt: new Date(QA.now) },
      { id: DEMO.bruno, email: 'bruno.lima@drlaudo.test', role: 'PATIENT', createdAt: new Date(QA.now) },
    ]);
    for (const user of before.users) {
      expect(await bcrypt.compare('Demo@1234', user.passwordHash)).toBe(true);
      expect(user.passwordHash).not.toBe('Demo@1234');
    }
    expect(before.exams).toEqual([
      { id: DEMO.xray, code: 'XRAY', name: 'Raio-X de tórax' },
      { id: DEMO.ultrasound, code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
      { id: DEMO.mri, code: 'MRI', name: 'Ressonância de crânio' },
    ]);
    expect(before.appointments.map(({ startsAt, status, canceledAt, createdAt }) => ({ startsAt, status, canceledAt, createdAt }))).toEqual([
      { startsAt: new Date('2026-11-11T11:00:00.000Z'), status: 'SCHEDULED', canceledAt: null, createdAt: new Date(QA.now) },
      { startsAt: new Date('2026-11-11T12:00:00.000Z'), status: 'SCHEDULED', canceledAt: null, createdAt: new Date(QA.now) },
      { startsAt: new Date('2026-11-11T13:00:00.000Z'), status: 'SCHEDULED', canceledAt: null, createdAt: new Date(QA.now) },
      { startsAt: new Date('2026-11-11T14:00:00.000Z'), status: 'SCHEDULED', canceledAt: null, createdAt: new Date(QA.now) },
      { startsAt: new Date('2026-11-11T15:00:00.000Z'), status: 'CANCELED', canceledAt: new Date(QA.now), createdAt: new Date(QA.now) },
    ]);
    expect(before.reports).toHaveLength(2);
    expect(before.reports.map(({ status, publishedAt, createdAt, updatedAt }) => ({ status, publishedAt, createdAt, updatedAt }))).toEqual([
      { status: 'PUBLISHED', publishedAt: new Date(QA.now), createdAt: new Date(QA.now), updatedAt: new Date(QA.now) },
      { status: 'DRAFT', publishedAt: null, createdAt: new Date(QA.now), updatedAt: new Date(QA.now) },
    ]);
    const app = await buildTestApp();
    const token = await login(app, 'equipe@drlaudo.test', 'Demo@1234');
    const patients = await app.inject({ method: 'GET', url: '/patients', headers: auth(token) });
    expect(patients.statusCode).toBe(200);
    expect(patients.json()).toEqual([
      { id: DEMO.ana, name: 'Ana Souza', email: 'ana.souza@drlaudo.test', active: true },
      { id: DEMO.bruno, name: 'Bruno Lima', email: 'bruno.lima@drlaudo.test', active: true },
    ]);
    await seedDemo({ prisma: db, clock: fixedClock('2027-02-10T12:00:00.000Z') });
    expect(await snapshot()).toEqual(before);
  });

  it('não sobrescreve senha, paciente editado, cancelamento, conteúdo nem publicação após uso real', async () => {
    await truncateAll();
    const db = testPrisma();
    await seedDemo({ prisma: db, clock: fixedClock(QA.now) });
    const app = await buildTestApp();
    const staff = await login(app, 'equipe@drlaudo.test', 'Demo@1234');
    const patch = await app.inject({
      method: 'PATCH', url: `/reports/${DEMO.draftReport}`, headers: auth(staff),
      payload: { title: 'Laudo revisado durante uso', body: 'Conteúdo fictício revisado que não pode ser sobrescrito.', professionalName: 'Dra. Revisora QA' },
    });
    expect(patch.statusCode).toBe(200);
    const publish = await app.inject({ method: 'POST', url: `/reports/${DEMO.draftReport}/publish`, headers: auth(staff) });
    expect(publish.statusCode).toBe(200);
    const cancel = await app.inject({ method: 'POST', url: `/appointments/${DEMO.emptyAppointment}/cancel`, headers: auth(staff) });
    expect(cancel.statusCode).toBe(200);
    const changedHash = await bcrypt.hash('SenhaAlterada@QA', 10);
    await db.user.update({ where: { id: DEMO.ana }, data: {
      name: 'Ana Nome Atualizado', email: 'ana.atualizada@qa.test', passwordHash: changedHash,
    } });
    await db.examType.update({ where: { id: DEMO.xray }, data: { name: 'Nome de catálogo preservado QA' } });
    const before = await snapshot();
    await seedDemo({ prisma: db, clock: fixedClock('2027-02-10T12:00:00.000Z') });
    expect(await snapshot()).toEqual(before);
    const loginChanged = await app.inject({
      method: 'POST', url: '/auth/login', payload: { email: 'ana.atualizada@qa.test', password: 'SenhaAlterada@QA' },
    });
    expect(loginChanged.statusCode).toBe(200);
    expect(loginChanged.json().user).toMatchObject({ id: DEMO.ana, name: 'Ana Nome Atualizado', role: 'PATIENT' });
  });

  it('reexecutar seed preserva paciente inativo sem resetar senha nem histórico', async () => {
    await truncateAll();
    const db = testPrisma();
    await seedDemo({ prisma: db, clock: fixedClock(QA.now) });
    const app = await buildTestApp();
    const token = await login(app, 'equipe@drlaudo.test', 'Demo@1234');
    const deactivated = await app.inject({
      method: 'PATCH', url: `/patients/${DEMO.ana}`, headers: auth(token), payload: { active: false },
    });
    expect(deactivated.statusCode).toBe(200);
    const before = await snapshot();
    await seedDemo({ prisma: db, clock: fixedClock('2027-02-10T12:00:00.000Z') });
    expect(await snapshot()).toEqual(before);
    const denied = await app.inject({
      method: 'POST', url: '/auth/login', payload: { email: 'ana.souza@drlaudo.test', password: 'Demo@1234' },
    });
    expect(denied.statusCode).toBe(401);
  });

  it('colisão no terceiro slot reverte usuários, exames e agendamentos anteriores e mantém o banco original', async () => {
    const db = testPrisma();
    // Only XRAY preexists; ULTRASOUND/MRI must be created and then rolled back.
    await db.examType.update({ where: { id: QA.xrayId }, data: { id: DEMO.xray } });
    await db.examType.deleteMany({ where: { id: { in: [QA.ultrasoundId, QA.mriId] } } });
    await db.appointment.create({ data: {
      id: '99000000-0000-4000-8000-000000000001', patientId: QA.anaId, examTypeId: DEMO.xray,
      startsAt: new Date('2026-11-11T13:00:00.000Z'), status: 'SCHEDULED', createdAt: new Date(QA.now),
    } });
    const before = await snapshot();
    await expect(seedDemo({ prisma: db, clock: fixedClock(QA.now) })).rejects.toMatchObject({ code: 'P2002' });
    expect(await snapshot()).toEqual(before);
    expect(await db.user.count({ where: { id: { in: [DEMO.staff, DEMO.ana, DEMO.bruno] } } })).toBe(0);
    expect(await db.examType.count({ where: { id: { in: [DEMO.ultrasound, DEMO.mri] } } })).toBe(0);
    expect(await db.appointment.count({ where: { id: { in: [DEMO.publishedAppointment, DEMO.draftAppointment] } } })).toBe(0);
    expect(await db.report.count()).toBe(0);
  });

  it('colisão do catálogo reverte também usuários recém-criados sem tocar nos registros QA', async () => {
    const db = testPrisma();
    const before = await snapshot();
    await expect(seedDemo({ prisma: db, clock: fixedClock(QA.now) })).rejects.toMatchObject({ code: 'P2002' });
    expect(await snapshot()).toEqual(before);
    expect(await db.user.count()).toBe(3);
    expect(await db.examType.count()).toBe(3);
    expect(await db.appointment.count()).toBe(0);
    expect(await db.report.count()).toBe(0);
  });
});
