import { randomUUID } from 'node:crypto';
import { PatientListResponseSchema, PatientSchema } from '@drlaudo/contract';
import { describe, expect, it } from 'vitest';
import { withUserLock } from '../helpers/appointment-lock.ts';
import { REPORT_INPUT, draftScenario } from '../helpers/report-scenario.ts';
import { QA, auth, buildTestApp, login, testPrisma, useIsolatedDatabase } from '../helpers/setup.ts';

useIsolatedDatabase();

const booking = { patientId: QA.anaId, examTypeId: QA.xrayId, startsAt: '2026-11-10T14:00:00.000Z' };
const unauthorized = { error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária ou credenciais inválidas.' } };

async function history() {
  const db = testPrisma();
  return {
    appointments: await db.appointment.findMany({ orderBy: { id: 'asc' } }),
    reports: await db.report.findMany({ orderBy: { id: 'asc' } }),
  };
}

describe('ciclo de atividade do paciente · PostgreSQL real', () => {
  it('desativa sem perder história/hash, bloqueia login/JWT e reativa o acesso próprio', async () => {
    const { app, token, appointment, report } = await draftScenario();
    const publishedAppointment = await app.inject({
      method: 'POST', url: '/appointments', headers: auth(token), payload: booking,
    });
    expect(publishedAppointment.statusCode).toBe(201);
    const publishedId = publishedAppointment.json<{ id: string }>().id;
    const createdReport = await app.inject({
      method: 'POST', url: `/appointments/${publishedId}/report`, headers: auth(token), payload: REPORT_INPUT,
    });
    expect(createdReport.statusCode).toBe(201);
    const publishedReportId = createdReport.json<{ id: string }>().id;
    expect((await app.inject({
      method: 'POST', url: `/reports/${publishedReportId}/publish`, headers: auth(token),
    })).statusCode).toBe(200);
    const patientToken = await login(app, 'ana@qa.test');
    const db = testPrisma();
    const before = await db.user.findUniqueOrThrow({ where: { id: QA.anaId } });
    const beforeHistory = await history();
    const deactivated = await app.inject({
      method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token), payload: { active: false },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(PatientSchema.parse(deactivated.json())).toEqual({
      id: QA.anaId, name: 'Ana QA', email: 'ana@qa.test', active: false,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: QA.anaId } })).toEqual({ ...before, active: false });
    expect(await history()).toEqual(beforeHistory);
    const patients = await app.inject({ method: 'GET', url: '/patients', headers: auth(token) });
    expect(PatientListResponseSchema.parse(patients.json())).toContainEqual(deactivated.json());
    const deniedLogin = await app.inject({
      method: 'POST', url: '/auth/login', payload: { email: 'ana@qa.test', password: QA.password },
    });
    expect(deniedLogin.statusCode).toBe(401);
    expect(deniedLogin.json()).toEqual(unauthorized);
    for (const url of ['/auth/me', '/me/appointments', `/me/appointments/${publishedId}/report`, '/patients']) {
      const denied = await app.inject({ method: 'GET', url, headers: auth(patientToken) });
      expect(denied.statusCode).toBe(401);
      expect(denied.json()).toEqual(unauthorized);
    }
    const deniedBeforeParsing = await app.inject({
      method: 'PATCH', url: `/patients/${QA.brunoId}`, headers: { ...auth(patientToken), 'content-type': 'application/json' }, payload: '{',
    });
    expect(deniedBeforeParsing.statusCode).toBe(401);
    expect(deniedBeforeParsing.json()).toEqual(unauthorized);
    const staffHistory = await app.inject({
      method: 'GET', url: `/appointments?scope=all&patientId=${QA.anaId}`, headers: auth(token),
    });
    expect(staffHistory.statusCode).toBe(200);
    expect(staffHistory.json()).toHaveLength(2);
    const changedDraft = await app.inject({
      method: 'PATCH', url: `/reports/${report.id}`, headers: auth(token), payload: { title: 'Rascunho do paciente inativo' },
    });
    expect(changedDraft.statusCode).toBe(200);
    const locked = await app.inject({
      method: 'PATCH', url: `/reports/${publishedReportId}`, headers: auth(token), payload: { title: 'Não pode mudar' },
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error.code).toBe('REPORT_LOCKED');
    const afterStaffEdit = await history();
    const reactivated = await app.inject({
      method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token), payload: { active: true },
    });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json()).toEqual({ id: QA.anaId, name: 'Ana QA', email: 'ana@qa.test', active: true });
    expect(await db.user.findUniqueOrThrow({ where: { id: QA.anaId } })).toEqual(before);
    expect(await history()).toEqual(afterStaffEdit);
    const newToken = await login(app, 'ana@qa.test');
    const own = await app.inject({ method: 'GET', url: '/me/appointments', headers: auth(newToken) });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual([
      expect.objectContaining({ id: appointment.id, hasPublishedReport: false }),
      expect.objectContaining({ id: publishedId, hasPublishedReport: true }),
    ]);
    const ownReport = await app.inject({ method: 'GET', url: `/me/appointments/${publishedId}/report`, headers: auth(newToken) });
    expect(ownReport.statusCode).toBe(200);
    expect(ownReport.json()).toMatchObject(REPORT_INPUT);
    expect((await app.inject({ method: 'GET', url: `/me/appointments/${appointment.id}/report`, headers: auth(newToken) })).statusCode).toBe(404);
  });

  it('recusa novo agendamento inativo sem escrita e mantém precedência de validação/recurso', async () => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    expect((await app.inject({ method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token), payload: { active: false } })).statusCode).toBe(200);
    const before = await history();
    for (const startsAt of [booking.startsAt, '2026-11-10T13:05:00.000Z', '2026-11-09T13:00:00.000Z']) {
      const denied = await app.inject({ method: 'POST', url: '/appointments', headers: auth(token), payload: { ...booking, startsAt } });
      expect(denied.statusCode).toBe(404);
      expect(denied.json().error.code).toBe('NOT_FOUND');
    }
    const malformed = await app.inject({ method: 'POST', url: '/appointments', headers: auth(token), payload: { ...booking, startsAt: 'bad' } });
    expect(malformed.statusCode).toBe(400);
    expect(await history()).toEqual(before);
    expect((await app.inject({ method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token), payload: { active: true } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/appointments', headers: auth(token), payload: booking })).statusCode).toBe(201);
  });

  it.each([QA.anaId, QA.brunoId])('PATIENT não pode alterar atividade do alvo %s', async (id) => {
    const app = await buildTestApp();
    const token = await login(app, 'ana@qa.test');
    const before = await testPrisma().user.findMany({ orderBy: { id: 'asc' } });
    const response = await app.inject({ method: 'PATCH', url: `/patients/${id}`, headers: auth(token), payload: { active: false } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(await testPrisma().user.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it.each(['deactivate', 'book'] as const)('serializa reserva × desativação no User: %s entra primeiro', async (first) => {
    const app = await buildTestApp();
    const token = await login(app, 'equipe@qa.test');
    const book = () => app.inject({ method: 'POST', url: '/appointments', headers: auth(token), payload: booking });
    const deactivate = () => app.inject({ method: 'PATCH', url: `/patients/${QA.anaId}`, headers: auth(token), payload: { active: false } });
    await withUserLock(QA.anaId, async (lock) => {
      const one = lock.start(first === 'deactivate' ? deactivate : book);
      const firstWaiters = await lock.waitForWaiters(1);
      expect(firstWaiters).toHaveLength(1);
      if (first === 'book') expect(firstWaiters[0]?.query).toMatch(/FOR UPDATE/i);
      const two = lock.start(first === 'deactivate' ? book : deactivate);
      const waiters = await lock.waitForWaiters(2);
      expect(waiters).toHaveLength(2);
      expect(new Set(waiters.map(({ pid }) => pid)).size).toBe(2);
      for (const waiter of waiters) {
        expect(waiter.pid).not.toBe(lock.blockerPid);
        expect(waiter.observerPid).not.toBe(waiter.pid);
        expect(waiter.observerPid).not.toBe(lock.blockerPid);
        expect(waiter.blockers.length).toBeGreaterThan(0);
      }
      expect(await testPrisma().appointment.count()).toBe(0);
      await lock.release();
      const [firstResult, secondResult] = await Promise.all([one, two]);
      const [deactivated, booked] = first === 'deactivate' ? [firstResult, secondResult] : [secondResult, firstResult];
      expect(deactivated.statusCode).toBe(200);
      expect(booked.statusCode).toBe(first === 'deactivate' ? 404 : 201);
      if (first === 'deactivate') expect(booked.json().error.code).toBe('NOT_FOUND');
    });
    expect(await testPrisma().user.findUniqueOrThrow({ where: { id: QA.anaId } })).toMatchObject({ active: false });
    expect(await testPrisma().appointment.count()).toBe(first === 'deactivate' ? 0 : 1);
    const subsequent = await book();
    expect(subsequent.statusCode).toBe(404);
    expect(subsequent.json().error.code).toBe('NOT_FOUND');
  });

  it('default SQL true é NOT NULL e não altera os campos existentes do usuário', async () => {
    const db = testPrisma();
    const column = await db.$queryRaw<{ is_nullable: string; column_default: string | null }[]>`
      SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'active'
    `;
    expect(column).toEqual([{ is_nullable: 'NO', column_default: 'true' }]);
    const id = randomUUID();
    await db.$executeRaw`
      INSERT INTO "User" (id, name, email, "passwordHash", role)
      VALUES (${id}::uuid, 'Paciente SQL', 'sql@qa.test', 'hash-preservado', 'PATIENT')
    `;
    const rows = await db.$queryRaw<{ active: boolean; passwordHash: string }[]>`
      SELECT active, "passwordHash" FROM "User" WHERE id = ${id}::uuid
    `;
    expect(rows).toEqual([{ active: true, passwordHash: 'hash-preservado' }]);
    const base = await db.$queryRaw<{ active: boolean }[]>`
      SELECT active FROM "User" WHERE id IN (${QA.staffId}::uuid, ${QA.anaId}::uuid, ${QA.brunoId}::uuid)
    `;
    expect(base).toEqual([{ active: true }, { active: true }, { active: true }]);
  });
});
